<?php
// iclock/getrequest.php
// Device asks: "Do you have any commands for me?"
// We usually reply "OK" unless we want to send commands (like Update Name, Delete User).

header("Content-Type: text/plain");
require_once '../db_connect.php';

$sn = $_GET['SN'] ?? '';

if ($sn) {
    // Update heartbeat here too
    try {
        $stmt = $pdo->prepare("UPDATE devices SET last_activity = NOW(), status = 'ONLINE' WHERE serial_number = ?");
        $stmt->execute([$sn]);
    } catch (Exception $e) {
    }
}

echo "OK";
?>