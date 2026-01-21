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

// GET: List all users with emails and remote status
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->query("SELECT user_id, email, name, allow_remote FROM biometric_users WHERE email IS NOT NULL AND email != '' GROUP BY user_id");
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($users);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// POST: Update User Email and Remote Status
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!isset($data['user_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing user_id']);
        exit;
    }

    $user_id = $data['user_id'];
    $email = $data['email'] ?? null;
    $allow_remote = isset($data['allow_remote']) ? (int) $data['allow_remote'] : null;
    $name = $data['name'] ?? 'Unknown';

    try {
        // Upsert logic: Update existing user by user_id

        // Build efficient query based on what's provided
        if ($email !== null && $allow_remote !== null) {
            $stmt = $pdo->prepare("UPDATE biometric_users SET email = ?, allow_remote = ? WHERE user_id = ?");
            $stmt->execute([$email, $allow_remote, $user_id]);
        } elseif ($email !== null) {
            $stmt = $pdo->prepare("UPDATE biometric_users SET email = ? WHERE user_id = ?");
            $stmt->execute([$email, $user_id]);
        } elseif ($allow_remote !== null) {
            $stmt = $pdo->prepare("UPDATE biometric_users SET allow_remote = ? WHERE user_id = ?");
            $stmt->execute([$allow_remote, $user_id]);
        }

        if ($stmt->rowCount() == 0) {
            // If no rows updated, maybe user doesn't exist?
            // Insert a "Virtual" user
            // Note: This insert assumes email is provided or allows null if schema supports it (which it does via logic)
            if ($email) {
                $stmt = $pdo->prepare("INSERT INTO biometric_users (user_id, name, email, allow_remote, device_sn) VALUES (?, ?, ?, ?, 'WEB_ADMIN') ON DUPLICATE KEY UPDATE email = ?, allow_remote = ?");
                $stmt->execute([$user_id, $name, $email, $allow_remote ?? 0, $email, $allow_remote ?? 0]);
            }
        }

        echo json_encode(['status' => 'success', 'message' => 'User updated']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}
?>