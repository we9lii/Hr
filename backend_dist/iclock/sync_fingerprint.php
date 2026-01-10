<?php
// sync_fingerprint.php - Receive fingerprint templates and save to DB
// Path: public_html/api/iclock/sync_fingerprint.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

require_once '../db_connect.php';

// Get JSON Input
$json = file_get_contents("php://input");
$data = json_decode($json, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "No data received"]);
    exit;
}

try {
    // Check if template exists
    $stmt = $pdo->prepare("SELECT id FROM fingerprint_templates WHERE user_id = ? AND finger_id = ?");
    $stmt->execute([$data['user_id'], $data['finger_id']]);
    $exists = $stmt->fetch();

    if ($exists) {
        // Update
        $sql = "UPDATE fingerprint_templates SET 
                template_data = ?, 
                size = ?, 
                device_sn = ?,
                valid = 1
                WHERE id = ?";
        $updateStmt = $pdo->prepare($sql);
        $updateStmt->execute([
            $data['template_data'],
            strlen($data['template_data']),
            $data['device_sn'] ?? 'UNKNOWN',
            $exists['id']
        ]);
        echo json_encode(["status" => "success", "message" => "Template updated", "id" => $exists['id']]);
    } else {
        // Insert
        $sql = "INSERT INTO fingerprint_templates (user_id, finger_id, template_data, size, device_sn, valid) VALUES (?, ?, ?, ?, ?, 1)";
        $insertStmt = $pdo->prepare($sql);
        $insertStmt->execute([
            $data['user_id'],
            $data['finger_id'],
            $data['template_data'],
            strlen($data['template_data']),
            $data['device_sn'] ?? 'UNKNOWN'
        ]);
        echo json_encode(["status" => "success", "message" => "Template created", "id" => $pdo->lastInsertId()]);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database Error: " . $e->getMessage()]);
}
?>