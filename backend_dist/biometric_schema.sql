-- Biometric Device Integration Schema
-- Run this in your cPanel phpMyAdmin

-- 1. Attendance Logs (Stores raw data from the device)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_sn VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    check_time DATETIME NOT NULL,
    status TINYINT DEFAULT 0, -- 0=CheckIn, 1=CheckOut, etc.
    verify_mode INT DEFAULT 1, -- 1=Finger, 15=Face, etc.
    work_code INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY log_unique (device_sn, user_id, check_time),
    INDEX (user_id),
    INDEX (check_time)
);

-- 2. Devices Registry (Tracks online status)
CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(50) NOT NULL UNIQUE,
    device_name VARCHAR(100),
    ip_address VARCHAR(50),
    fw_version VARCHAR(100),
    user_count INT DEFAULT 0,
    face_count INT DEFAULT 0,
    fp_count INT DEFAULT 0,
    last_activity TIMESTAMP NULL,
    status ENUM('ONLINE', 'OFFLINE') DEFAULT 'OFFLINE'
);
