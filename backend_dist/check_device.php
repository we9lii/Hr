<?php
include_once 'db_connect.php';

$emp_id = $_GET['emp_id'] ?? '';
$device_uuid = $_GET['device_uuid'] ?? '';

if (empty($emp_id) || empty($device_uuid)) {
    echo json_encode(["status" => "ERROR", "message" => "Missing parameters"]);
    exit();
}

// 1. Check if user has ANY device registered
$query = "SELECT * FROM device_bindings WHERE employee_id = ? LIMIT 1";
$stmt = $conn->prepare($query);
$stmt->execute([$emp_id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    // User has no device -> Allow Binding (New User)
    echo json_encode(["status" => "NEW_USER"]);
} else {
    // User has a device -> Check if it matches
    if ($row['device_uuid'] === $device_uuid) {
        // Update last login
        $update = $conn->prepare("UPDATE device_bindings SET last_login = NOW() WHERE id = ?");
        $update->execute([$row['id']]);
        echo json_encode(["status" => "ALLOWED"]);
    } else {
        echo json_encode(["status" => "BLOCKED", "message" => "Account linked to another device"]);
    }
}
?>