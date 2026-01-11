biometric_stats.php<?php
// Disable display errors to prevent HTML pollution in JSON response
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

try {
    include_once '../db_connect.php';

    // Handle Date Filtering (Django style params: punch_time__gte, punch_time__lte)
    $start_date = $_GET['punch_time__gte'] ?? date('Y-m-d 00:00:00');
    $end_date = $_GET['punch_time__lte'] ?? date('Y-m-d 23:59:59');

    $emp_code = $_GET['emp_code'] ?? '';
    // Support both 'terminal_sn' and 'device_sn'
    $terminal_sn = $_GET['terminal_sn'] ?? ($_GET['device_sn'] ?? '');

    // Build Query
    $sql = "SELECT * FROM attendance_logs WHERE check_time >= ? AND check_time <= ?";
    $params = [$start_date, $end_date];

    if (!empty($emp_code) && $emp_code !== 'ALL') {
        $sql .= " AND user_id = ?";
        $params[] = $emp_code;
    }

    if (!empty($terminal_sn) && $terminal_sn !== 'ALL') {
        $sql .= " AND device_sn = ?";
        $params[] = $terminal_sn;
    }

    $sql .= " ORDER BY check_time DESC LIMIT 1000";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $results = [];
    foreach ($rows as $row) {
        $results[] = [
            'id' => $row['id'],
            'emp_code' => $row['user_id'],
            // Ideally we should join with users table, but for now we fallback
            'emp_name' => "User " . $row['user_id'],
            'punch_time' => $row['check_time'],
            'punch_state' => $row['status'],
            'verify_type_display' => ($row['verify_mode'] == 1 ? 'Finger' : ($row['verify_mode'] == 15 ? 'Face' : 'Other')),
            'terminal_sn' => $row['device_sn'],
            'terminal_alias' => $row['device_sn'], // Can be enriched by frontend if needed
            'area_alias' => 'Main Branch' // Default
        ];
    }

    // Output clean JSON
    echo json_encode($results);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server Error: " . $e->getMessage()]);
}
?>