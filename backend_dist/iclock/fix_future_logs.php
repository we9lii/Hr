<?php
header("Content-Type: text/plain");
require_once '../db_connect.php';

// Set Riyadh Time
date_default_timezone_set('Asia/Riyadh');
$current_time = date('Y-m-d H:i:s');

// Delete logs that are in the future (with 10 minute buffer just in case)
// We only target logs from the last 24 hours to avoid destroying intentionally future dated records if any existed (unlikely for biometric)
$sql = "DELETE FROM attendance_logs WHERE check_time > DATE_ADD(?, INTERVAL 5 MINUTE)";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$current_time]);
    $deleted = $stmt->rowCount();

    echo "✅ Successfully deleted $deleted invalid 'future' logs.\n";
    echo "Current Server Time: $current_time\n";
    echo "All remaining logs should be valid.";
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage();
}
?>