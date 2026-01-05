<?php
// sync_log.php - Bridge to receive logs from Render Server
// Path: public_html/api/iclock/sync_log.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

require_once '../db_connect.php';

// Get JSON Input
$data = json_decode(file_get_contents("php://input"));

if (
    !empty($data->device_sn) &&
    !empty($data->user_id) &&
    !empty($data->check_time)
) {
    try {
        // 1. Insert Log
        $sql = "INSERT IGNORE INTO attendance_logs 
                (device_sn, user_id, check_time, status, verify_mode, work_code) 
                VALUES (:sn, :uid, :time, :status, :verify, :work)";

        $stmt = $pdo->prepare($sql);

        $stmt->bindParam(":sn", $data->device_sn);
        $stmt->bindParam(":uid", $data->user_id);
        $stmt->bindParam(":time", $data->check_time);
        $stmt->bindParam(":status", $data->status);
        $stmt->bindParam(":verify", $data->verify_mode);
        $stmt->bindParam(":work", $data->work_code);

        if ($stmt->execute()) {
            // 2. Update Device Status
            $deviceSql = "INSERT INTO devices (serial_number, last_activity, status) 
                          VALUES (:sn, NOW(), 'ONLINE') 
                          ON DUPLICATE KEY UPDATE last_activity = NOW(), status = 'ONLINE'";
            $deviceStmt = $pdo->prepare($deviceSql);
            $deviceStmt->bindParam(":sn", $data->device_sn);
            $deviceStmt->execute();

            echo json_encode(["message" => "Log synced successfully.", "status" => "success"]);
        } else {
            echo json_encode(["message" => "Unable to sync log.", "status" => "error"]);
        }
    } catch (PDOException $e) {
        echo json_encode(["message" => "DB Error: " . $e->getMessage(), "status" => "error"]);
    }
} else {
    echo json_encode(["message" => "Incomplete data.", "status" => "error"]);
}
?>