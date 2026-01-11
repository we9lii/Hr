<?php
// db_setup.php - Initialize Tables for Biometric Sync
include_once '../db_connect.php';

$tables = [
    // 1. Device Commands
    "CREATE TABLE IF NOT EXISTS device_commands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_sn VARCHAR(50) NOT NULL,
        command TEXT NOT NULL,
        status ENUM('PENDING', 'SENT', 'SUCCESS', 'ERROR') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        executed_at TIMESTAMP NULL,
        INDEX (device_sn),
        INDEX (status)
    )",

    // 2. Biometric Users
    "CREATE TABLE IF NOT EXISTS biometric_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        name VARCHAR(100),
        role INT DEFAULT 0,
        card_number VARCHAR(50),
        password VARCHAR(50),
        device_sn VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user (user_id, device_sn)
    )",

    // 3. Fingerprints
    "CREATE TABLE IF NOT EXISTS fingerprint_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        finger_id INT NOT NULL DEFAULT 0,
        template_data TEXT NOT NULL,
        size INT DEFAULT 0,
        device_sn VARCHAR(50),
        valid INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_fp (user_id, finger_id)
    )"
];

foreach ($tables as $sql) {
    try {
        $pdo->exec($sql);
        echo "Table verified/created successfully.<br>";
    } catch (PDOException $e) {
        echo "Error: " . $e->getMessage() . "<br>";
    }
}
echo "Database Setup Complete.";
?>