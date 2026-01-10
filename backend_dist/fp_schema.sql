CREATE TABLE IF NOT EXISTS fingerprint_templates (
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
);
