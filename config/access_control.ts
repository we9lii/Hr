export const REMOTE_ACCESS_CONFIG = {
    // Array of Employee IDs allowed to punch from anywhere
    ALLOWED_IDS: [
        '1093394672', // Faisal (Dev)
        // Add more IDs here as needed
    ],

    // Feature Flags
    ENABLE_ALL_REMOTE: false, // Set to true to allow everyone temporarily
};

export const isRemoteAllowed = (employeeId: string): boolean => {
    if (REMOTE_ACCESS_CONFIG.ENABLE_ALL_REMOTE) return true;
    return REMOTE_ACCESS_CONFIG.ALLOWED_IDS.includes(String(employeeId));
};
