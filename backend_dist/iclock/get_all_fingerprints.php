<?php
// get_all_fingerprints.php - Return all valid fingerprint templates
// Path: public_html/api/iclock/get_all_fingerprints.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once '../db_connect.php';

try {
    $stmt = $pdo->query("SELECT user_id, finger_id, template_data FROM fingerprint_templates WHERE valid = 1");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(["status" => "success", "templates" => $rows]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>