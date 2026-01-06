CREATE TABLE IF NOT EXISTS biometric_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    role INT DEFAULT 0,
    card_number VARCHAR(50),
    password VARCHAR(50),
    device_sn VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user (user_id, device_sn)
);
