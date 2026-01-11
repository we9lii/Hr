<?php
// iclock/getrequest.php
// Device asks: "Do you have any commands for me?"
// We usually reply "OK" unless we want to send commands (like Update Name, Delete User).

header("Content-Type: text/plain");
require_once '../db_connect.php';

$sn = $_GET['SN'] ?? '';

if ($sn) {
    // 1. Update Heartbeat
    try {
        $stmt = $pdo->prepare("INSERT INTO devices (serial_number, last_activity, status) VALUES (?, NOW(), 'ONLINE') ON DUPLICATE KEY UPDATE last_activity = NOW(), status = 'ONLINE'");
        $stmt->execute([$sn]);
    } catch (Exception $e) {
    }

    // 2. Check for Pending Commands
    try {
        // Fetch oldest PENDING command
        $cmdStmt = $pdo->prepare("SELECT id, command FROM device_commands WHERE device_sn = ? AND status = 'PENDING' ORDER BY id ASC LIMIT 1");
        $cmdStmt->execute([$sn]);
        $command = $cmdStmt->fetch(PDO::FETCH_ASSOC);

        if ($command) {
            // Format: C:ID:COMMAND_STRING
            // Example: C:101:DATA UPDATE USERINFO PIN=1 Name=...
            $cmdString = "C:" . $command['id'] . ":" . $command['command'];

            // Mark as SENT
            $updateStmt = $pdo->prepare("UPDATE device_commands SET status = 'SENT', executed_at = NOW() WHERE id = ?");
            $updateStmt->execute([$command['id']]);

            echo $cmdString;
            exit;
        }
    } catch (Exception $e) {
        // Fallback
    }
}

echo "OK";
?>