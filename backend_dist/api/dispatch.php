<?php
// dispatch.php - Tool to push all users/fingers to a target device
// Usage: /api/dispatch.php?target_sn=DEVICE_SN

header("Content-Type: application/json");
require_once '../db_connect.php';

$target_sn = $_GET['target_sn'] ?? '';

if (empty($target_sn)) {
    echo json_encode(["status" => "error", "message" => "Missing target_sn parameter"]);
    exit;
}

try {
    $count = 0;

    // 1. Dispatch Users
    $stmtUser = $pdo->query("SELECT * FROM biometric_users");
    while ($row = $stmtUser->fetch(PDO::FETCH_ASSOC)) {
        // Format: PIN=1 Name=...
        $cmdData = "PIN=" . $row['user_id'] . "\t" .
            "Name=" . $row['name'] . "\t" .
            "Pri=" . ($row['role'] ?? 0) . "\t" .
            "Passwd=" . ($row['password'] ?? '') . "\t" .
            "Card=" . ($row['card_number'] ?? '') . "\t" .
            "Grp=1";

        $command = "DATA UPDATE USERINFO " . $cmdData;

        $ins = $pdo->prepare("INSERT INTO device_commands (device_sn, command, status) VALUES (?, ?, 'PENDING')");
        $ins->execute([$target_sn, $command]);
        $count++;
    }

    // 2. Dispatch Fingerprints
    $stmtFp = $pdo->query("SELECT * FROM fingerprint_templates WHERE valid=1");
    while ($row = $stmtFp->fetch(PDO::FETCH_ASSOC)) {
        // Format: PIN=1 FID=0 ...
        $cmdData = "PIN=" . $row['user_id'] . "\t" .
            "FID=" . $row['finger_id'] . "\t" .
            "Size=" . $row['size'] . "\t" .
            "Valid=" . $row['valid'] . "\t" .
            "TMP=" . $row['template_data'];

        $command = "DATA UPDATE FINGERTMP " . $cmdData;

        $ins = $pdo->prepare("INSERT INTO device_commands (device_sn, command, status) VALUES (?, ?, 'PENDING')");
        $ins->execute([$target_sn, $command]);
        $count++;
    }

    echo json_encode(["status" => "success", "message" => "Queued $count commands for device $target_sn"]);

} catch (Exception $e) {
    echo json_encode(["status" => "error", "message" => "Error: " . $e->getMessage()]);
}
?>