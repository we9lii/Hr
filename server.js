import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise'; // Native DB Access

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// DB Configuration (Matches db_connect.php)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'qssunsol_qssun_user',
    password: process.env.DB_PASSWORD || 'g3QL]cRAHvny',
    database: process.env.DB_NAME || 'qssunsolar_qssunsolar_hr',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);

// Verify DB Connection on Startup
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log(`[System] Database connection successful: ${dbConfig.host} (${dbConfig.database})`);
        connection.release();
    } catch (err) {
        console.error(`[System Error] Database connection failed!`, {
            host: dbConfig.host,
            user: dbConfig.user,
            error: err.message
        });
        console.log("Check if DB_HOST, DB_USER, DB_PASSWORD environment variables are set correctly in Render.");
    }
})();

// Enable CORS for all routes
app.use(cors());

// HTTP Bridge Configuration (Bypass Port 3306 Block)
const SYNC_URL = 'https://qssun.solar/api/iclock/sync_log.php';

// Proxy Configuration (BioTime)
const target = 'http://qssun.dyndns.org:8085';
const proxyConfig = {
    target,
    changeOrigin: true,
    secure: false,
    timeout: 15000,
    proxyTimeout: 15000
};

// Proxy Configuration (Local cPanel API)
// Proxy Configuration (Local cPanel API)
const biometricProxyConfig = {
    target: 'https://qssun.solar/api',
    changeOrigin: true,
    secure: false, // Allow self-signed or chain issues
    pathRewrite: {
        '^/biometric_api': '' // Remove /biometric_api prefix when forwarding
    },
    // Add logging and error handling
    onProxyReq: (proxyReq, req, res) => {
        // console.log(`[Proxy] Proxying ${req.method} request to: ${proxyReq.path}`);
    },
    onError: (err, req, res) => {
        console.error(`[Proxy Error] ${err.message} on ${req.url}`);
        res.status(502).send(`Proxy Error: ${err.message}`);
    },
    timeout: 10000,
    proxyTimeout: 10000
};


// Helper: Process User Line (Save to DB)
// Helper: Process User Line (Save to DB)
// Helper: Process User Line (Save to DB via Bridge)
const processUserLine = async (line, sn) => {
    try {
        const parts = line.split('\t');
        const d = {};
        parts.forEach(p => {
            const splitArr = p.split('=');
            if (splitArr.length >= 2) {
                const k = splitArr[0].trim();
                const v = splitArr.slice(1).join('=').trim();
                if (k) d[k] = v;
            }
        });

        // Debug: Log parsed keys to ensure we are receiving data
        // console.log(`[ZKTeco] Parsing User Line:`, JSON.stringify(d));

        // PIN is standard, but sometimes it is USER PIN
        const userId = d['PIN'] || d['USER PIN'];

        if (userId) {
            // Use PHP Bridge
            try {
                const response = await fetch('https://qssun.solar/api/iclock/sync_user.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        name: d['Name'] || '',
                        role: d['Pri'] || 0,
                        card_number: d['Card'] || '',
                        password: d['Passwd'] || '',
                        device_sn: sn
                    })
                });

                const result = await response.json();
                if (result.status === 'success') {
                    console.log(`[Bridge Success] Saved User (from Log): ${userId} (${d['Name']})`);
                    return true;
                } else {
                    console.error(`[Bridge Error] User Sync Failed:`, result.message);
                }
            } catch (bridgeErr) {
                console.error(`[Bridge Network Error] Failed to contact PHP script for User Sync:`, bridgeErr.message);
            }
        } else {
            // Only warn if it significantly looks like user data but missing PIN
            if (line.includes('Name=')) console.warn(`[ZKTeco] Warning: No User ID found in line with Name: ${line}`);
        }
        return false;
    } catch (e) {
        console.error("DB Insert User Error:", e.message);
        return false;
    }
};

// ZKTeco ADMS Listener (Must be BEFORE proxies)
// 1. Handshake & Data Push
// Note: express.text() is scoped ONLY to this route to avoid breaking proxies
app.all(['/iclock/cdata', '/iclock/cdata.php'], express.text({ type: '*/*' }), async (req, res) => {
    const { SN, table, options } = req.query;
    console.log(`[ZKTeco] Request: ${req.method} ${req.url} (Type: ${req.headers['content-type']})`);

    // Handshake (First Connection)
    if (req.method === 'GET' && options === 'all') {
        console.log(`[ZKTeco] Handshake from ${SN}`);
        return res.send(`GET OPTION FROM: ${SN}\nStamp=0\nOpStamp=0\nErrorDelay=60\nDelay=30\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nRealtime=1\nEncrypt=0\nServerVer=3.4.1\nDate=${getRiyadhTime()}`);
    }

    // Data Push (Attendance Logs)
    if (req.method === 'POST') {
        const body = req.body;
        console.log(`[ZKTeco] Received ${table} from ${SN}:`, body);

        if (!body) return res.send('OK');
        const lines = body.split('\n').filter(line => line.trim());
        let count = 0;

        if (table === 'ATTLOG') {
            try {
                for (const line of lines) {
                    const parts = line.split('\t');
                    if (parts.length >= 2) {
                        const [userId, time, status, verify, workCode] = parts;
                        // HTTP Bridge: Sync Log
                        try {
                            const resLog = await fetch('https://qssun.solar/api/iclock/sync_log.php', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    device_sn: SN,
                                    user_id: userId,
                                    check_time: time,
                                    status: status || 0,
                                    verify_mode: verify || 1,
                                    work_code: workCode || 0
                                })
                            });

                            const logData = await resLog.json();
                            if (resLog.ok && logData.status === 'success') {
                                console.log(`[Bridge Success] Log Synced: User=${userId} Time=${time}`);
                                count++;
                            } else {
                                console.error(`[Bridge Error] Log Sync Failed:`, logData.message || resLog.statusText);
                            }
                        } catch (bridgeErr) {
                            console.error(`[Bridge Network Error] Failed to contact PHP script:`, bridgeErr.message);
                        }
                    }
                }
                console.log(`[ZKTeco] Processed ${count} valid logs`);
            } catch (e) {
                console.error("ATTLOG Sync Error:", e);
            }
        }

        else if (table === 'USERINFO' || table === 'userinfo' || table === 'user') {
            console.log(`[ZKTeco] Processing USERINFO. Total lines: ${lines.length}`);
            if (lines.length > 0) console.log(`[ZKTeco] Sample Line: ${lines[0]}`);

            try {
                let count = 0;
                for (const line of lines) {
                    // processUserLine logic moved to PHP Bridge
                    // Parse line for JSON payload
                    const parts = line.split('\t');
                    const d = {};
                    parts.forEach(p => {
                        const splitArr = p.split('=');
                        if (splitArr.length >= 2) {
                            const k = splitArr[0].trim();
                            const v = splitArr.slice(1).join('=').trim();
                            if (k) d[k] = v;
                        }
                    });

                    const userId = d['PIN'] || d['USER PIN'];
                    if (userId) {
                        try {
                            const response = await fetch('https://qssun.solar/api/iclock/sync_user.php', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    user_id: userId,
                                    name: d['Name'] || '',
                                    role: d['Pri'] || 0,
                                    card_number: d['Card'] || '',
                                    password: d['Passwd'] || '',
                                    device_sn: SN
                                })
                            });

                            const result = await response.json();
                            if (response.ok && result.status === 'success') {
                                console.log(`[Bridge Success] Saved User: ${userId} (${d['Name']})`);
                                count++;
                            } else {
                                console.error(`[Bridge Error] User Sync Failed:`, result.message);
                            }
                        } catch (bridgeErr) {
                            console.error(`[Bridge Network Error] Failed to contact PHP script for User Sync:`, bridgeErr.message);
                        }
                    }
                }
                console.log(`[ZKTeco] Synced ${count} users from USERINFO`);
            } catch (e) { console.error(e); }
        }

        else if (table === 'fingertmp') {
            try {
                let count = 0;
                for (const line of lines) {
                    const parts = line.split('\t');
                    const d = {};
                    parts.forEach(p => { const [k, v] = p.split('=', 2); if (k) d[k.trim()] = v ? v.trim() : ''; });

                    if (d['PIN'] && d['TMP']) {
                        // Valid Data - Send to PHP Bridge (Bypassing Port 3306 Block)
                        try {
                            const response = await fetch('https://qssun.solar/api/iclock/sync_fingerprint.php', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    user_id: d['PIN'],
                                    finger_id: d['FID'] || 0,
                                    template_data: d['TMP'],
                                    size: d['Size'] || d['TMP'].length,
                                    valid: d['Valid'] || 1,
                                    device_sn: SN
                                })
                            });

                            const result = await response.json();
                            if (result.status === 'success') {
                                console.log(`[Bridge Success] Saved Template: User=${d['PIN']} FID=${d['FID']}`);
                                count++;
                            } else {
                                console.error(`[Bridge Error] PHP Script Failed:`, result.message);
                            }
                        } catch (bridgeErr) {
                            console.error(`[Bridge Network Error] Failed to contact PHP script:`, bridgeErr.message);
                        }
                    }
                }
                console.log(`[ZKTeco] Synced ${count} fingerprints.`);
            } catch (e) { console.error("DB Insert FP Error:", e.message); }
        }


        // Log the incoming table type for debugging
        console.log(`[ZKTeco] /iclock/cdata received table: ${table} from SN: ${SN}`);

        if (table === 'operlog' || table === 'OPERLOG') {
            // Smart Sync: detailed handling of operation logs
            try {
                console.log(`[Smart Sync] Operational Log received from ${SN}. Parsing contents...`);
                let userSyncCount = 0;
                let fpSyncCount = 0;

                for (const line of lines) {
                    // Check for Fingerprint (FP PIN) or Face (FACE PIN)
                    if (line.includes('FP PIN=') || line.includes('FACE PIN=')) {
                        try {
                            const d = {};
                            line.split('\t').forEach(p => {
                                const idx = p.indexOf('=');
                                if (idx > 0) {
                                    const k = p.substring(0, idx).trim();
                                    const v = p.substring(idx + 1).trim();
                                    d[k] = v;
                                }
                            });

                            let userId = d['FP PIN'] || d['FACE PIN'];

                            // Fallback regex
                            if (!userId) {
                                const match = line.match(/(FP|FACE) PIN=(\d+)/);
                                if (match) userId = match[2];
                            }

                            if (userId && d['TMP']) {
                                // Valid Data - Send to PHP Bridge (Bypassing Port 3306 Block)
                                const bridgeUrl = 'https://qssun.solar/api/iclock/sync_fingerprint.php';

                                const response = await fetch(bridgeUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        user_id: userId,
                                        finger_id: d['FID'] || 0,
                                        template_data: d['TMP'],
                                        size: d['Size'] || d['TMP'].length,
                                        valid: d['Valid'] || 1,
                                        device_sn: SN
                                    })
                                });

                                const result = await response.json();
                                if (result.status === 'success') {
                                    console.log(`[Bridge Success] Saved Template from OPERLOG: User=${userId} FID=${d['FID']}`);
                                    fpSyncCount++;
                                } else {
                                    console.error(`[Bridge Error] PHP Script Failed:`, result.message);
                                }
                            }
                        } catch (err) {
                            console.error("Error parsing FP/FACE line in OPERLOG:", {
                                message: err.message,
                                code: err.code,
                                sqlMessage: err.sqlMessage,
                                line: line
                            });
                        }
                    }
                    // Otherwise try User Info
                    else {
                        if (await processUserLine(line, SN)) userSyncCount++;
                    }
                }

                if (userSyncCount > 0 || fpSyncCount > 0) {
                    console.log(`[Smart Sync] Processed ${userSyncCount} users and ${fpSyncCount} templates from OPERLOG.`);
                } else {
                    console.log(`[Smart Sync] No actionable data in OPERLOG.`);
                }
            } catch (e) {
                console.error(e);
            }
        }

        return res.send('OK');
    }

    // Default Response
    res.send('OK');
});

// Helper: Riyadh Time
const getRiyadhTime = () => {
    // Force UTC+3 (Riyadh)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const riyadhOffset = 3 * 60 * 60 * 1000;
    const riyadhDate = new Date(utc + riyadhOffset);
    return riyadhDate.toISOString().replace(/T/, ' ').replace(/\..+/, '');
};

app.all(['/iclock/getrequest', '/iclock/getrequest.php'], async (req, res) => {
    // console.log(`[ZKTeco] Heartbeat from ${req.query.SN}`);

    // Priority 1: Serve Fingerprint Commands (One by One)
    if (pendingFingerprints.length > 0) {
        const cmd = pendingFingerprints.shift();
        console.log(`[ZKTeco] Sending FP Command (${pendingFingerprints.length} remaining): ${cmd.substring(0, 50)}...`);
        return res.send(cmd);
    }

    // Priority 2: Force User Info Sync (Once)
    if (!hasSentForceQuery) {
        console.log(`[ZKTeco] Sending FORCE SYNC command to ${req.query.SN}`);
        hasSentForceQuery = true;
        // Also send date to correct time immediately
        return res.send(`C:1:DATA QUERY USERINFO\nDate=${getRiyadhTime()}`);
    }

    // Always send server time to keep device synced
    const serverTime = getRiyadhTime();
    res.send(`OK\nDate=${serverTime}`);
});

// 3. Command Response (When device finishes a command)
app.post(['/iclock/devicecmd', '/iclock/devicecmd.php'], express.text({ type: '*/*' }), (req, res) => {
    const { SN } = req.query;
    console.log(`[ZKTeco] Device Command Response from ${SN}:`, req.body);
    res.send('OK');
});

app.get('/iclock/force_sync', (req, res) => {
    hasSentForceQuery = false;
    console.log('[Manual] Force Sync Reset. Device will be queried on next heartbeat.');
    res.send('Force Sync Reset. Reboot Device now.');
});

// Apply Proxies (For other requests)
app.use('/iclock/api', createProxyMiddleware(proxyConfig));
app.use('/personnel/api', createProxyMiddleware(proxyConfig));
app.use('/att/api', createProxyMiddleware(proxyConfig));
app.use('/jwt-api-token-auth', createProxyMiddleware(proxyConfig));
// Legacy Proxies (Matching Vite Config for Consistency)
app.use('/legacy_iclock', createProxyMiddleware({
    ...proxyConfig,
    pathRewrite: { '^/legacy_iclock': '/iclock' }
}));
app.use('/legacy_auth', createProxyMiddleware({
    ...proxyConfig,
    pathRewrite: { '^/legacy_auth': '' }
}));
app.use('/biometric_api', createProxyMiddleware(biometricProxyConfig));

// Serve Static Files (Build Output)
app.use(express.static(path.join(__dirname, 'dist')));

// Handle Client-Side Routing (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

