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
};

// Proxy Configuration (Local cPanel API)
const biometricProxyConfig = {
    target: 'https://qssun.solar/api',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
        '^/biometric_api': '' // Remove /biometric_api prefix when forwarding
    }
};


// Helper: Process User Line (Save to DB)
// Helper: Process User Line (Save to DB)
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
            const sql = `INSERT INTO biometric_users (user_id, name, role, card_number, password, device_sn) 
                          VALUES (?, ?, ?, ?, ?, ?) 
                          ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), card_number=VALUES(card_number), password=VALUES(password), device_sn=VALUES(device_sn)`;

            await pool.execute(sql, [
                userId,
                d['Name'] || 'Unknown',
                d['Pri'] || 0,
                d['Card'] || '',
                d['Passwd'] || '',
                sn
            ]);
            return true;
        } else {
            console.warn(`[ZKTeco] Warning: No User ID found in line: ${line}`);
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
app.all('/iclock/cdata', express.text({ type: '*/*' }), async (req, res) => {
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
                        const resLog = await fetch(SYNC_URL, {
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
                        if (resLog.ok) count++;
                    }
                }
                console.log(`[ZKTeco] Synced ${count} logs`);
            } catch (e) { console.error(e); }
        }

        else if (table === 'USERINFO') {
            try {
                let count = 0;
                for (const line of lines) {
                    if (await processUserLine(line, SN)) count++;
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
                        const sql = `INSERT INTO fingerprint_templates (user_id, finger_id, template_data, size, device_sn, valid) 
                                     VALUES (?, ?, ?, ?, ?, ?) 
                                     ON DUPLICATE KEY UPDATE template_data=VALUES(template_data), size=VALUES(size), valid=VALUES(valid), device_sn=VALUES(device_sn)`;

                        await pool.execute(sql, [
                            d['PIN'],
                            d['FID'] || 0,
                            d['TMP'],
                            d['Size'] || d['TMP'].length,
                            SN,
                            d['Valid'] || 1
                        ]);
                        count++;
                    }
                }
                console.log(`[ZKTeco] Synced ${count} fingerprints.`);
            } catch (e) { console.error("DB Insert FP Error:", e.message); }
        }


        else if (table === 'OPERLOG') {
            // Smart Sync: detailed handling of operation logs
            try {
                console.log(`[Smart Sync] Operational Log received from ${SN}. Checking for User Info...`);
                let userSyncCount = 0;
                for (const line of lines) {
                    if (await processUserLine(line, SN)) userSyncCount++;
                }
                if (userSyncCount > 0) {
                    console.log(`[Smart Sync] Extracted ${userSyncCount} users directly from OPERLOG.`);
                } else {
                    console.log(`[Smart Sync] No direct user data in OPERLOG. Scheduling Force Query.`);
                    hasSentForceQuery = false;
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

const getRiyadhTime = () => {
    const d = new Date();
    // Add 3 hours to UTC
    d.setHours(d.getUTCHours() + 3);
    return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
};

// 2. Command Check (Poll)
let hasSentForceQuery = false; // Memory flag to send command once per server restart
let pendingFingerprints = []; // Queue for fingerprint commands


// Trigger Full Sync (Users + Fingerprints)
// Supports fetching from PHP (if available) OR accepting direct JSON payload
app.post('/iclock/trigger_full_sync', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { sn, users, fingerprints } = req.body;
        console.log(`[ZKTeco] Triggering Full Sync for ${sn}...`);

        let count = 0;

        // 1. Queue Users (DATA UPDATE USERINFO)
        if (users && Array.isArray(users)) {
            console.log(`[ZKTeco] Queuing ${users.length} users...`);
            users.forEach((u, idx) => {
                // Command: DATA UPDATE USERINFO PIN=1 Name=...
                // Ensure proper formatting
                const cmdString = `DATA UPDATE USERINFO PIN=${u.user_id}\tName=${u.name}\tPri=${u.role}\tPasswd=${u.password}\tCard=${u.card_number}\tGrp=1`;
                pendingFingerprints.push(`C:${2000 + idx}:${cmdString}`);
                count++;
            });
        }

        // 2. Queue Fingerprints (DATA UPDATE FINGERTMP)
        if (fingerprints && Array.isArray(fingerprints)) {
            console.log(`[ZKTeco] Queuing ${fingerprints.length} fingerprints...`);
            fingerprints.forEach((fp, idx) => {
                const cmdString = `DATA UPDATE FINGERTMP PIN=${fp.user_id}\tFID=${fp.finger_id}\tSize=${fp.size}\tValid=${fp.valid}\tTMP=${fp.template_data}`;
                pendingFingerprints.push(`C:${3000 + idx}:${cmdString}`);
                count++;
            });
        }


        res.send({ status: 'success', queued: count });
    } catch (e) {
        console.error(e);
        res.status(500).send({ status: 'error', message: e.message });
    }
});

// Trigger Pull Data (Device -> Server)
app.get('/iclock/trigger_pull', (req, res) => {
    const { sn } = req.query;
    if (!sn) return res.status(400).send("Missing SN");

    console.log(`[ZKTeco] Scheduling PULL command for ${sn}`);

    // Queue commands to pull Users and Fingerprints
    pendingFingerprints.push(`C:9001:DATA QUERY USERINFO`);
    pendingFingerprints.push(`C:9002:DATA QUERY FINGERTMP`);

    res.send({ status: "success", message: "Pull commands queued. Reboot device to process immediately." });
});

app.all('/iclock/getrequest', async (req, res) => {
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
        return res.send(`C:1:DATA QUERY USERINFO`);
    }

    res.send(`OK\nDate=${getRiyadhTime()}`); // Keep device time synced
});

// 3. Command Response (When device finishes a command)
app.post('/iclock/devicecmd', express.text({ type: '*/*' }), (req, res) => {
    const { SN } = req.query;
    console.log(`[ZKTeco] Device Command Response from ${SN}:`, req.body);
    res.send('OK');
});

// Manual Trigger for Force Sync
app.get('/iclock/force_sync', (req, res) => {
    hasSentForceQuery = false;
    console.log('[Manual] Force Sync Triggered. Command will be sent on next heartbeat.');
    res.send('Force Sync Triggered');
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

