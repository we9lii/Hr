-- Add 'allow_remote' column to biometric_users table
-- This flag determines if a user can punch from anywhere (ignoring geofence)
-- 0 = Restricted to Geofence (Default)
-- 1 = Remote Access Allowed

-- Add email and allow_remote columns if they don't exist
ALTER TABLE biometric_users 
ADD COLUMN email VARCHAR(100) DEFAULT NULL,
ADD COLUMN allow_remote TINYINT(1) DEFAULT 0;

-- Optional: Grant remote access to specific user (Example)
-- UPDATE biometric_users SET allow_remote = 1 WHERE user_id = '1093394672';
