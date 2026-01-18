<?php
// users.php - Manage Local User Data (Email, etc.)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../db_connect.php';

// GET: List all users with emails
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->query("SELECT user_id, email, name FROM biometric_users WHERE email IS NOT NULL AND email != '' GROUP BY user_id");
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($users);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// POST: Update User Email
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!isset($data['user_id']) || !isset($data['email'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing user_id or email']);
        exit;
    }

    $user_id = $data['user_id'];
    $email = $data['email'];
    $name = $data['name'] ?? 'Unknown';

    try {
        // Upsert logic: Try to update existing user by user_id
        // Since biometric_users is unique by (user_id, device_sn), we might have multiple rows per user.
        // We should update ALL rows for this user_id.

        $stmt = $pdo->prepare("UPDATE biometric_users SET email = ? WHERE user_id = ?");
        $stmt->execute([$email, $user_id]);

        if ($stmt->rowCount() == 0) {
            // If no rows updated, maybe user doesn't exist?
            // Insert a "Virtual" user for the email mapping
            $stmt = $pdo->prepare("INSERT INTO biometric_users (user_id, name, email, device_sn) VALUES (?, ?, ?, 'WEB_ADMIN') ON DUPLICATE KEY UPDATE email = ?");
            $stmt->execute([$user_id, $name, $email, $email]);
        }

        echo json_encode(['status' => 'success', 'message' => 'Email updated']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}
?>