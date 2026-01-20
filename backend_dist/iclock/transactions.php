<?php
// Disable display errors to prevent HTML pollution in JSON response
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

// Handle Preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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

        // FIX: TIMEZONE & DATE FORMAT
        // BioTime expects Local Time (Asia/Riyadh), but App sends ISO (UTC).
        date_default_timezone_set('Asia/Riyadh');

        $utcTime = isset($data['punch_time']) ? $data['punch_time'] : date('Y-m-d H:i:s');
        $timestamp = strtotime($utcTime);
        $localTime = date('Y-m-d H:i:s', $timestamp);

        // FIX: VALID DEVICE FOR DASHBOARD
        // Dashboard filters out logs from unknown serial numbers.
        $dashboardDeviceSn = 'AF4C232560143';

        // Insert into attendance_logs (Custom DB)
        $stmt = $pdo->prepare("INSERT INTO attendance_logs 
            (user_id, check_time, status, verify_mode, device_sn, latitude, longitude, image_proof) 
            VALUES (:user_id, :check_time, :status, :verify_mode, :device_sn, :latitude, :longitude, :image_proof)
            ON DUPLICATE KEY UPDATE 
            check_time = VALUES(check_time),
            latitude = VALUES(latitude),
            longitude = VALUES(longitude),
            image_proof = VALUES(image_proof)
        ");

        // Logic for Remote vs Local Punches
        $isRemote = isset($data['is_remote']) ? $data['is_remote'] : false;

        if (isset($data['terminal_sn']) && !empty($data['terminal_sn'])) {
            $customDeviceSn = $data['terminal_sn'];
        } else {
            $customDeviceSn = $isRemote ? 'AF4C232560143' : 'MANUAL';
        }

        $verifyMode = $isRemote ? 200 : 15; // 200 = GPS Pin, 15 = Standard Manual

        // Execute Custom Insert (Using Local Time)
        $stmt->execute([
            ':device_sn' => $customDeviceSn,
            ':user_id' => $data['emp_code'],
            ':check_time' => $localTime, // <-- CORRECTED TIME
            ':status' => $data['punch_state'], // 0=CheckIn, 1=CheckOut
            ':verify_mode' => $verifyMode,
            ':latitude' => $data['latitude'] ?? null,
            ':longitude' => $data['longitude'] ?? null,
            ':image_proof' => $data['image_proof'] ?? null
        ]);

        // --- NATIVE BIOTIME SYNC (Dual Write) ---
        // Insert into `iclock_transaction` so it appears in Main Dashboard/Real-Time Monitor
        try {
            // lookup logic: Ensure we have the correct emp_code for BioTime FK
            // The App might send 'id' or 'emp_code'. We need strict 'emp_code'.
            $lookupStmt = $pdo->prepare("SELECT emp_code FROM personnel_employee WHERE emp_code = ? OR id = ? OR card_number = ? LIMIT 1");
            $lookupStmt->execute([$data['emp_code'], $data['emp_code'], $data['emp_code']]);
            $employee = $lookupStmt->fetch(PDO::FETCH_ASSOC);

            // If found, use the Database's emp_code. If not, fallback to input.
            $validEmpCode = $employee ? $employee['emp_code'] : $data['emp_code'];

            $nativeStmt = $pdo->prepare("INSERT IGNORE INTO iclock_transaction 
                (emp_code, punch_time, punch_state, verify_type, terminal_sn, terminal_alias, area_alias, upload_time, source, sync_status, latitude, longitude) 
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 1, 0, ?, ?)
            ");

            $nativeStmt->execute([
                $validEmpCode, // <-- VALIDATED CODE
                $localTime, // <-- CORRECTED TIME
                $data['punch_state'],
                $verifyMode,
                $dashboardDeviceSn, // VALID DEVICE SN
                'Mobile App',
                $isRemote ? 'Remote (GPS)' : 'Inside (App)',
                $data['latitude'] ?? 0,
                $data['longitude'] ?? 0
            ]);
        } catch (Exception $e) {
            file_put_contents('gps_debug_log.txt', date('Y-m-d H:i:s') . " - Native Insert Failed: " . $e->getMessage() . "\n", FILE_APPEND);
        }
        // ----------------------------------------

        $rows = $stmt->rowCount();
        file_put_contents('gps_debug_log.txt', date('Y-m-d H:i:s') . " - Inserted Rows: " . $rows . " (ID: " . $pdo->lastInsertId() . ")\n", FILE_APPEND);

        if ($rows > 0 || $pdo->lastInsertId()) {
            $typeStr = $isRemote ? "REMOTE (Device: $customDeviceSn)" : "LOCAL (Device: $customDeviceSn)";
            $msg = "Recorded: $typeStr | GPS: " . ($data['latitude'] ?? 'N/A');
            echo json_encode(['status' => 'success', 'message' => $msg]);
        } else {
            // Check if it was a duplicate update
            echo json_encode(['status' => 'success', 'message' => 'Updated (Duplicate)']);
        }
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
    $stmt = $pdo->prepare(str_replace('LIMIT ? OFFSET ?', "LIMIT $page_size OFFSET $offset", $sql));
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $results = [];
    foreach ($rows as $row) {
        // ID Logic: Use Card Number as 'emp_code' if present
        $finalCode = (!empty($row['card_number'])) ? $row['card_number'] : $row['user_id'];

        $results[] = [
            'id' => $row['id'],
            'emp_code' => $finalCode,
            'emp_name' => $row['real_name'] ? $row['real_name'] : ("User " . $row['user_id']),
            'punch_time' => $row['check_time'],
            'punch_state' => $row['status'],
            'verify_type_display' => ($row['device_sn'] === 'MANUAL' ? 'Manual' : ($row['verify_mode'] == 1 ? 'Finger' : ($row['verify_mode'] == 15 ? 'Face' : 'Other'))),
            'terminal_sn' => $row['device_sn'],
            'terminal_alias' => $row['device_sn'],
            'area_alias' => 'الفرع الرئيسي',
            'latitude' => $row['latitude'],
            'longitude' => $row['longitude'],
            'image_proof' => $row['image_proof']
        ];
    }

    echo json_encode($results);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server Error: " . $e->getMessage()]);
}
?>