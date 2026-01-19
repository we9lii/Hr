<?php
// Disable display errors to prevent HTML pollution in JSON response
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");



try {
    require_once '../db_connect.php';

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);

        // Handle DELETE Action
        if (isset($data['action']) && $data['action'] === 'delete') {
            if (!isset($data['id'])) {
                echo json_encode(['status' => 'error', 'message' => 'Missing ID']);
                exit;
            }
            // Security: Only delete MANUAL logs (verify_mode=15)
            $stmt = $pdo->prepare("DELETE FROM attendance_logs WHERE id = ? AND verify_mode = 15");
            $stmt->execute([$data['id']]);

            if ($stmt->rowCount() > 0) {
                echo json_encode(['status' => 'success', 'message' => 'Log deleted']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Log not found or not manual']);
            }
            exit;
        }

        // Handle Creation (Existing)
        if (!isset($data['emp_code']) || !isset($data['punch_time']) || !isset($data['punch_state'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            exit;
        }

        // Insert into attendance_logs... (Keep existing insert logic)

        // Insert into attendance_logs
        $stmt = $pdo->prepare("INSERT INTO attendance_logs 
            (device_sn, user_id, check_time, status, verify_mode, notes, latitude, longitude, image_proof, created_at) 
            VALUES (:device_sn, :user_id, :check_time, :status, :verify_mode, :notes, :latitude, :longitude, :image_proof, NOW())
            ON DUPLICATE KEY UPDATE notes = VALUES(notes), verify_mode = VALUES(verify_mode), latitude=VALUES(latitude), longitude=VALUES(longitude), image_proof=VALUES(image_proof)");

        $stmt->execute([
            ':device_sn' => 'Mobile',
            ':user_id' => $data['emp_code'],
            ':check_time' => $data['punch_time'],
            ':status' => $data['punch_state'], // 0=CheckIn, 1=CheckOut
            ':verify_mode' => 200, // Mobile/GPS
            ':notes' => $data['area_alias'] ?? '',
            ':latitude' => $data['latitude'] ?? null,
            ':longitude' => $data['longitude'] ?? null,
            ':image_proof' => $data['image_proof'] ?? null
        ]);

        echo json_encode(['status' => 'success', 'message' => 'Manual log created']);
        exit;
    }

    // Default: GET (Fetch Logs)
    // require_once '../db_connect.php'; // Already included above

    // Handle Date Filtering (Django style params: punch_time__gte, punch_time__lte)
    $start_date = $_GET['punch_time__gte'] ?? date('Y-m-d 00:00:00');
    $end_date = $_GET['punch_time__lte'] ?? date('Y-m-d 23:59:59');

    $emp_code = $_GET['emp_code'] ?? '';
    // Support alternate code (e.g. National ID)
    $alt_emp_code = $_GET['alt_emp_code'] ?? '';

    // Support both 'terminal_sn' and 'device_sn'
    $terminal_sn = $_GET['terminal_sn'] ?? ($_GET['device_sn'] ?? '');

    // Build Query
    // Join with biometric_users to get real names AND Card Number (as generic ID map)
    $sql = "SELECT l.*, u.name as real_name, u.card_number 
            FROM attendance_logs l 
            LEFT JOIN biometric_users u ON l.user_id = u.user_id 
            WHERE l.check_time >= ? AND l.check_time <= ?";
    $params = [$start_date, $end_date];

    if (!empty($emp_code) && $emp_code !== 'ALL') {
        // If searching for specific employee code, check:
        // 1. user_id = emp_code (Direct Match)
        // 2. card_number = emp_code (Workaround fix)
        // 3. user_id = alt_emp_code (Software Mapping fix)
        if (!empty($alt_emp_code)) {
            $sql .= " AND (l.user_id = ? OR u.card_number = ? OR l.user_id = ?)";
            $params[] = $emp_code;
            $params[] = $emp_code;
            $params[] = $alt_emp_code;
        } else {
            $sql .= " AND (l.user_id = ? OR u.card_number = ?)";
            $params[] = $emp_code;
            $params[] = $emp_code;
        }
    }

    if (!empty($terminal_sn) && $terminal_sn !== 'ALL') {
        $sql .= " AND l.device_sn = ?";
        $params[] = $terminal_sn;
    }

    // Pagination Support
    $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
    $page_size = isset($_GET['page_size']) ? (int) $_GET['page_size'] : 1000;
    if ($page < 1)
        $page = 1;
    $offset = ($page - 1) * $page_size;

    $sql .= " ORDER BY l.check_time DESC LIMIT ? OFFSET ?";

    // Bind Limit/Offset as integers (PDO strict)
    // Note: params array has strings/dates so far.
    // PDO::execute with array treats all as string usually, BUT LIMIT requires int in some drivers.
    // Safer to bindValue manually or use direct interpolation (safe if ints forced).
    // Let's use bindParam approach on STMT directly if possible, or append to params but might fail if driver is strict.
    // Simpler: Just Interpolate since they are cast to (int)
    $stmt = $pdo->prepare(str_replace('LIMIT ? OFFSET ?', "LIMIT $page_size OFFSET $offset", $sql));
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Return next page indicator if full page returned
    // (Wait, standard BioTime API returns { count, next, previous, results }).
    // To minimize frontend changes, let's keep array output BUT with infinite scroll support frontend needs to know if done?
    // Frontend `api.ts` loop break if `list.length === 0`.
    // So if we return [] when page is empty, frontend stops.
    // That's standard compatible.

    $results = [];
    foreach ($rows as $row) {
        // ID Logic: Use Card Number as 'emp_code' if present, because ZKTeco user_id might be National ID.
        // This allows user to fix ID mismatch by editing Card Number on device.
        $finalCode = (!empty($row['card_number'])) ? $row['card_number'] : $row['user_id'];

        $results[] = [
            'id' => $row['id'],
            'emp_code' => $finalCode,
            // Use real name if found, else fallback
            'emp_name' => $row['real_name'] ? $row['real_name'] : ("User " . $row['user_id']),
            'punch_time' => $row['check_time'], // ADDED MISSING PUNCH_TIME
            'punch_state' => $row['status'],
            'verify_type_display' => ($row['device_sn'] === 'MANUAL' ? 'Manual' : ($row['verify_mode'] == 1 ? 'Finger' : ($row['verify_mode'] == 15 ? 'Face' : 'Other'))),
            'terminal_sn' => $row['device_sn'],
            'terminal_alias' => $row['notes'] ? $row['notes'] : $row['device_sn'], // Show Notes in Alias field
            'area_alias' => $row['notes'] ? $row['notes'] : 'الفرع الرئيسي',
            // GPS Data (Critical for Map Pin)
            'latitude' => $row['latitude'],
            'longitude' => $row['longitude'],
            'image_proof' => $row['image_proof']
        ];
    }

    // Output clean JSON
    echo json_encode($results);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server Error: " . $e->getMessage()]);
}
?>