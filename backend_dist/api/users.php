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

// Debugging: Enable errors
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// Debugging: Enable errors
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// --- DB Connection (Inlined for reliability) ---
$pdo = null;
try {
    $host = "localhost";
    $db_name = "qssunsolar_qssunsolar_hr";
    $username = "qssunsol_qssun_user";
    $password = "g3QL]cRAHvny";

    $dsn = "mysql:host=$host;dbname=$db_name;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $pdo = new PDO($dsn, $username, $password, $options);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

// GET: List all users OR specific user
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $user_id = isset($_GET['user_id']) ? $_GET['user_id'] : null;

        if ($user_id) {
            // Fetch specific user
            $stmt = $pdo->prepare("SELECT user_id, email, name, allow_remote FROM biometric_users WHERE user_id = ?");
            $stmt->execute([$user_id]);
        } else {
            // Fetch all (Previous Logic)
            $stmt = $pdo->query("SELECT user_id, email, name, allow_remote FROM biometric_users WHERE (email IS NOT NULL AND email != '') OR allow_remote = 1 GROUP BY user_id");
        }

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
        // Build efficient query based on what's provided
        $stmt = null;
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

        // If no rows updated, user might not exist. Check and Insert.
        if (!$stmt || $stmt->rowCount() == 0) {
            $check = $pdo->prepare("SELECT id FROM biometric_users WHERE user_id = ?");
            $check->execute([$user_id]);

            if ($check->rowCount() == 0) {
                // Ensure email is not NULL for DB constraint if needed, or empty string
                $safeEmail = $email ?? '';
                $safeRemote = $allow_remote ?? 0;

                $stmt = $pdo->prepare("INSERT INTO biometric_users (user_id, name, email, allow_remote, device_sn) VALUES (?, ?, ?, ?, 'WEB_ADMIN')");
                $stmt->execute([$user_id, $name, $safeEmail, $safeRemote]);
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