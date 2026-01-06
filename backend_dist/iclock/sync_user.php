<?php
// sync_user.php - Receive user data from Node.js bridge and insert into MySQL
// Path: public_html/api/iclock/sync_user.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

require_once '../db_connect.php';

// Get JSON Input
$json = file_get_contents("php://input");
file_put_contents("user_debug.log", date('Y-m-d H:i:s') . " - Input: " . $json . "\n", FILE_APPEND);
$data = json_decode($json, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "No data received"]);
    exit;
}

try {
    // Check if user exists
    $stmt = $pdo->prepare("SELECT id FROM biometric_users WHERE user_id = ? AND device_sn = ?");
    $stmt->execute([$data['user_id'], $data['device_sn']]);
    $exists = $stmt->fetch();

    if ($exists) {
        // Update
        // Update - Only update fields if they are not empty/null in the input
        // This prevents overwriting valid data with NULLs if a partial sync occurs
        $sql = "UPDATE biometric_users SET 
                name = COALESCE(NULLIF(?, ''), name), 
                role = COALESCE(NULLIF(?, ''), role), 
                card_number = COALESCE(NULLIF(?, ''), card_number), 
                password = COALESCE(NULLIF(?, ''), password) 
                WHERE id = ?";
        $updateStmt = $pdo->prepare($sql);
        $updateStmt->execute([
            $data['name'] ?? null,
            $data['role'] ?? null,
            $data['card_number'] ?? null,
            $data['password'] ?? null,
            $exists['id']
        ]);
        echo json_encode(["status" => "success", "message" => "User updated (merged)", "id" => $exists['id']]);
    } else {
        // Insert
        $sql = "INSERT INTO biometric_users (user_id, name, role, card_number, password, device_sn) VALUES (?, ?, ?, ?, ?, ?)";
        $insertStmt = $pdo->prepare($sql);
        $insertStmt->execute([
            $data['user_id'],
            $data['name'],
            $data['role'],
            $data['card_number'],
            $data['password'],
            $data['device_sn']
        ]);
        echo json_encode(["status" => "success", "message" => "User created", "id" => $pdo->lastInsertId()]);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database Error: " . $e->getMessage()]);
}
?>