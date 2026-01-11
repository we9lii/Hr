<?php
// get_all_users.php - Fetch all users for syncing
// Returns JSON: { users: [ { user_id, name, role, ... }, ... ] }

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

require_once '../db_connect.php';

try {
    $stmt = $pdo->query("SELECT * FROM biometric_users");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["status" => "success", "users" => $users]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>