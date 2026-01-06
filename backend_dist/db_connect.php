<?php
// db_connect.php
// Centralized Database Connection

$host = "localhost";
$db_name = "qssunsolar_qssunsolar_hr";
$username = "qssunsol_qssun_user";
$password = "g3QL]cRAHvny";

try {
    $dsn = "mysql:host=$host;dbname=$db_name;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $pdo = new PDO($dsn, $username, $password, $options);
} catch (PDOException $e) {
    // Return JSON error if connection fails
    header("Content-Type: application/json");
    echo json_encode(["status" => "error", "message" => "Database Connection Failed: " . $e->getMessage()]);
    exit;
}
?>