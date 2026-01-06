<?php
// biometric_stats.php - Serve logs and devices to frontend
// Path: public_html/api/biometric_stats.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once 'db_connect.php'; // Ensure db_connect.php exists in same folder or adjust path

try {
    // 1. Fetch Latest 50 Logs with User Names
    // JOIN with biometric_users to get the name directly from the DB
    $logsSql = "SELECT 
                    l.id, l.device_sn, l.user_id, l.check_time, l.status, l.verify_mode, l.created_at,
                    u.name as user_name
                FROM attendance_logs l 
                LEFT JOIN biometric_users u ON l.user_id = u.user_id
                ORDER BY l.check_time DESC 
                LIMIT 50";

    $stmt = $pdo->query($logsSql);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Fetch Devices Status
    $devicesSql = "SELECT id, serial_number, device_name, status, last_activity FROM devices";
    $stmtDev = $pdo->query($devicesSql);
    $devices = $stmtDev->fetchAll(PDO::FETCH_ASSOC);

    // Calculate 'ONLINE' based on last_activity (e.g., within 5 mins)
    foreach ($devices as &$dev) {
        $last = strtotime($dev['last_activity']);
        $now = time();
        if (($now - $last) < 300) { // 5 minutes
            $dev['status'] = 'ONLINE';
        } else {
            $dev['status'] = 'OFFLINE';
        }
    }

    // 3. Fetch Biometric Users (Synced from Devices)
    $stmtUsers = $pdo->query("SELECT user_id, name, role, device_sn FROM biometric_users");
    $bioUsers = $stmtUsers->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "status" => "success",
        "logs" => $logs,
        "devices" => $devices,
        "users" => $bioUsers
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>