<?php
// Disable display errors to prevent HTML pollution in JSON response
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

try {
    include_once '../db_connect.php';

    // Fetch Devices
    // We select basic info. 'status' and 'last_activity' are crucial.
    $sql = "SELECT * FROM devices ORDER BY last_activity DESC";

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $results = [];
    foreach ($rows as $row) {
        $last_act = strtotime($row['last_activity']);
        $now = time();
        // Dynamic Status Check (5 mins timeout)
        $is_online = ($now - $last_act) < 300;

        // Use DB status if it's explicitly set to ONLINE and recent, otherwise fallback
        $status = $is_online ? 'ONLINE' : 'OFFLINE';

        $results[] = [
            'id' => $row['id'],
            'serial_number' => $row['serial_number'],
            'alias' => $row['device_name'] ? $row['device_name'] : $row['serial_number'], // Frontend expects 'alias' or uses logic
            'ip_address' => $row['ip_address'],
            'last_activity' => $row['last_activity'],
            'state' => ($status === 'ONLINE' ? 1 : 0), // 1=Online, 0=Offline for compatibility
            'area_name' => 'Main Branch' // Placeholder
        ];
    }

    echo json_encode($results);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server Error: " . $e->getMessage()]);
}
?>