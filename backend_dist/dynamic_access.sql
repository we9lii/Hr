-- Add 'allow_remote' column to biometric_users table
-- This flag determines if a user can punch from anywhere (ignoring geofence)
-- 0 = Restricted to Geofence (Default)
-- 1 = Remote Access Allowed

ALTER TABLE biometric_users 
ADD COLUMN allow_remote TINYINT(1) DEFAULT 0;

-- Optional: Grant remote access to the developer immediately
UPDATE biometric_users SET allow_remote = 1 WHERE user_id = '1093394672';
