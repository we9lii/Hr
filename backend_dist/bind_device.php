<?php
include_once 'security_db_connect.php';

$raw_input = file_get_contents("php://input");
$data = json_decode($raw_input);

$emp_id = $data->emp_id ?? '';
$device_uuid = $data->device_uuid ?? '';
$device_model = $data->device_model ?? 'Unknown';

if (empty($emp_id) || empty($device_uuid)) {
    echo json_encode([
        "status" => "ERROR",
        "message" => "Missing parameters",
        "debug_received" => $raw_input
    ]);
    exit();
}

// Double check if already bound to another device
$query = "SELECT * FROM device_bindings WHERE employee_id = ? LIMIT 1";
$stmt = $conn->prepare($query);
$stmt->execute([$emp_id]);

if ($stmt->rowCount() > 0) {
    echo json_encode(["status" => "BLOCKED", "message" => "User already bound"]);
    exit();
}

// Insert Binding
$insert = "INSERT INTO device_bindings (employee_id, device_uuid, device_model) VALUES (?, ?, ?)";
$stmt = $conn->prepare($insert);

if ($stmt->execute([$emp_id, $device_uuid, $device_model])) {
    echo json_encode(["status" => "SUCCESS"]);
} else {
    echo json_encode(["status" => "ERROR", "message" => "Database error"]);
}
?>