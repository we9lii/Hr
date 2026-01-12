
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'biometric_db' // Assuming local for this test since we can't easily query remote PHP, actually wait.
    // The user's system uses a PHP bridge for writes, but server.js reads locally?
    // No, server.js uses the bridge for writing.
    // The frontend fetches from PHP.
};

// I cannot query the remote DB directly from here easily if port 3306 is blocked.
// But I can use the same trick: verify logs via a PHP script or just rely on the bridge logs.
// The bridge logs said "Bridge Success", so the data IS in the remote DB.
// The issue is likely the time difference.

// Let's focus on the Server Time Logic in server.js
console.log("Checking Time Logic...");
const d = new Date();
const currentLocal = d.toISOString();
d.setHours(d.getUTCHours() + 3);
const riyadh = d.toISOString().replace(/T/, ' ').replace(/\..+/, '');

console.log(`Local ISO: ${currentLocal}`);
console.log(`Calculated Riyadh Command: ${riyadh}`);
