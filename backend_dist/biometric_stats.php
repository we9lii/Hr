<?php
// biometric_stats.php
// Returns latest logs and device status for the Dashboard

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
require_once 'db_connect.php';

try {
    // 1. Fetch Active Devices
    $stmtDevices = $pdo->query("SELECT id, serial_number, device_name, status, last_activity FROM devices ORDER BY last_activity DESC");
    $devices = $stmtDevices->fetchAll(PDO::FETCH_ASSOC);

    // 2. Fetch Latest Logs (Last 50)
    $stmtLogs = $pdo->query("SELECT id, device_sn, user_id, check_time, status, verify_mode, created_at FROM attendance_logs ORDER BY check_time DESC LIMIT 50");
    $logs = $stmtLogs->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "status" => "success",
        "devices" => $devices,
        "logs" => $logs
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>