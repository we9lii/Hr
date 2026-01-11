CREATE TABLE IF NOT EXISTS device_commands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_sn VARCHAR(50) NOT NULL,
    command TEXT NOT NULL,
    status ENUM('PENDING', 'SENT', 'SUCCESS', 'ERROR') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP NULL,
    INDEX (device_sn),
    INDEX (status)
);
