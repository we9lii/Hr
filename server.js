import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
                        const logText = await resLog.text();
                        console.log(`[ZKTeco] Log Sync Response (${resLog.status}):`, logText);

                        if (resLog.ok) count++;
                    }
                }
                console.log(`[ZKTeco] Synced ${count} logs`);
            } catch (e) { console.error(e); }
        }

        else if (table === 'OPERLOG') {
            // Smart Sync: detailed handling of operation logs
            // Logic: Scan for user data lines AND trigger smart sync if needed
            try {
                console.log(`[Smart Sync] Operational Log received from ${SN}. Checking for User Info...`);

                // 1. Try to parse User Info from OPERLOG lines (sometimes it comes here!)
                let userSyncCount = 0;
                for (const line of lines) {
                    if (processUserLine(line, SN)) userSyncCount++;
                }
                if (userSyncCount > 0) {
                    console.log(`[Smart Sync] Extracted ${userSyncCount} users directly from OPERLOG.`);
                } else {
                    // 2. If no direct user data found, but it looks like an operation (e.g. OPLOG 4/5), trigger a pull
                    console.log(`[Smart Sync] No direct user data in OPERLOG. Scheduling Force Query.`);
                    hasSentForceQuery = false;
                }
            } catch (e) {
                console.error(e);
            }
        }

        else if (table === 'USERINFO') {
            // USERINFO: Standard handling
            try {
                let count = 0;
                for (const line of lines) {
                    if (processUserLine(line, SN)) count++;
                }
                console.log(`[ZKTeco] Synced ${count} users from USERINFO table`);
            } catch (e) { console.error(e); }
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

// Trigger Fingerprint Sync (Called by Frontend)
app.get('/iclock/trigger_fp_sync', async (req, res) => {
    try {
        const { sn } = req.query;
        console.log(`[ZKTeco] Triggering Fingerprint Sync for ${sn}...`);

        // Fetch from PHP
        const response = await fetch('https://qssun.solar/api/iclock/get_all_fingerprints.php');
        const json = await response.json();

        const templates = json.templates || [];
        console.log(`[ZKTeco] Found ${templates.length} templates to sync.`);

        // Populate Queue
        pendingFingerprints = templates.map((t, idx) => {
            // Command Format: DATA UPDATE FINGERTMP PIN=1 FID=0 TMP=...
            // Using logic ID (idx + 1000) to avoid conflict
            return `C:${1000 + idx}:DATA UPDATE FINGERTMP PIN=${t.user_id} FID=${t.finger_id} TMP=${t.template_data}`;
        });

        res.send({ status: 'success', count: pendingFingerprints.length });
    } catch (e) {
        console.error(e);
        res.status(500).send({ status: 'error', message: e.message });
    }
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

// Helper: Process a single USERINFO line
// Returns true if sync was triggered, false otherwise
async function processUserLine(line, SN) {
    const SYNC_USER_URL = 'https://qssun.solar/api/iclock/sync_user.php';
    let userId, name, priv, pass, card;

    // A. Detect Key=Value Format (Found in OPERLOG or varying firmware)
    if (line.includes('=')) {
        const map = {};
        line.split('\t').forEach(p => {
            const parts = p.split('=');
            if (parts.length >= 2) {
                const k = parts[0].trim();
                const v = parts.slice(1).join('=').trim();
                if (k) map[k] = v;
            }
        });

        // Strict Key Check: We only want USER info, not FP (Fingerprint) info
        // FP PIN is for fingerprint templates. USER PIN is for user info.
        if (map['FP PIN']) return false; // Ignore Fingerprint Templates

        userId = map['USER PIN'] || map['PIN'];
        name = map['Name'];
        priv = map['Pri'];
        pass = map['Passwd'];
        card = map['Card'];

    } else {
        // B. Fallback to Standard Tab-Delimited: User_PIN\tName\tPrivilege\tPassword\tCard
        // Only if it looks like a clean data line (no equals sign)
        [userId, name, priv, pass, card] = line.split('\t');
    }

    // 3. Sync if we found a valid User ID
    if (userId) {
        const payload = {
            device_sn: SN,
            user_id: userId,
            name: name || '',
            role: priv || 0,
            password: pass || '',
            card_number: card || ''
        };
        console.log(`[ZKTeco] Parsed User from ${SN}:`, payload); // Debug Log

        try {
            const resRequest = await fetch(SYNC_USER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const resText = await resRequest.text();
            console.log(`[ZKTeco] User Sync Response (${resRequest.status}):`, resText);
            return resRequest.ok;
        } catch (e) {
            console.error(`[ZKTeco] User Sync Failed:`, e);
            return false;
        }
    }
    return false;
}
