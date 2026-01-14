<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../db_connect.php';

// Check if file is present
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    echo JSON_encode(['status' => 'error', 'message' => 'No file uploaded or upload error']);
    exit;
}

$file = $_FILES['file'];
$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowed = ['jpg', 'jpeg', 'png', 'pdf'];

if (!in_array($ext, $allowed)) {
    echo JSON_encode(['status' => 'error', 'message' => 'Invalid file type. Only JPG, PNG, PDF allowed']);
    exit;
}

// Create Upload Directory
$uploadDir = '../uploads/proofs/';
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// Generate Unique Name
$filename = uniqid('proof_', true) . '.' . $ext;
$targetPath = $uploadDir . $filename;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    // Return the URL (assuming server root structure, adapt as needed)
    // If backend_dist is mapped to /api root:
    // This needs to be accessible via web. 
    // Usually backend_dist is static served or php served.
    // We'll return the relative path from the API root.
    $publicUrl = "/uploads/proofs/" . $filename;

    echo JSON_encode([
        'status' => 'success',
        'url' => $publicUrl,
        'message' => 'File uploaded successfully'
    ]);
} else {
    echo JSON_encode(['status' => 'error', 'message' => 'Failed to save file']);
}
?>