<?php
// db_setup.php - Initialize Tables for Biometric Sync
if (file_exists('db_connect.php')) {
    include_once 'db_connect.php';
} elseif (file_exists('../db_connect.php')) {
    include_once '../db_connect.php';
} else {
    die("Error: db_connect.php not found. Please upload this file to the root or api folder.");
}

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
    )",

    // 4. Attendance Logs (Ensure exists)
    // 4. Attendance Logs (Ensure exists)
    "CREATE TABLE IF NOT EXISTS attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_sn VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        check_time DATETIME NOT NULL,
        status TINYINT DEFAULT 0,
        verify_mode INT DEFAULT 1,
        work_code INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY log_unique (device_sn, user_id, check_time),
        INDEX (user_id),
        INDEX (check_time)
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

// Add 'notes' column if not exists (for existing tables)
$alterSql = "ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS notes TEXT";
try {
    $pdo->exec($alterSql);
    echo "Checked/Added 'notes' column to attendance_logs.<br>";
} catch (Exception $e) {
    // Fallback for older MySQL
    try {
        $pdo->exec("ALTER TABLE attendance_logs ADD COLUMN notes TEXT");
        echo "Added 'notes' column (Fallback).<br>";
    } catch (Exception $ex) {
        // Ignored: Column probably exists
    }
}

echo "Database Setup Complete.";
?>