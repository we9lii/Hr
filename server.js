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

        else if (table === 'USERINFO') {
            // USERINFO Format: User_PIN\tName\tPrivilege\tPassword\tCard\tGroup\tTimezone\tVerify
            const SYNC_USER_URL = 'https://qssun.solar/api/iclock/sync_user.php';
            try {
                for (const line of lines) {
                    // Try parsing as standard tab-delimited
                    let [userId, name, priv, pass, card] = line.split('\t');

                    // If that failed to get a name, maybe it's Key=Value format?
                    if (!name && line.includes('=')) {
                        const map = {};
                        line.split('\t').forEach(p => {
                            const [k, v] = p.split('=');
                            if (k && v) map[k] = v;
                        });
                        if (map['PIN']) userId = map['PIN'];
                        if (map['Name']) name = map['Name'];
                        if (map['Pri']) priv = map['Pri'];
                        if (map['Passwd']) pass = map['Passwd'];
                        if (map['Card']) card = map['Card'];
                    }

                    if (userId) {
                        const payload = {
                            device_sn: SN,
                            user_id: userId,
                            name: name || '', // Ensure empty string if undefined
                            role: priv || 0,
                            password: pass || '',
                            card_number: card || ''
                        };
                        console.log(`[ZKTeco] Syncing User:`, payload);

                        const resRequest = await fetch(SYNC_USER_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const resText = await resRequest.text();
                        console.log(`[ZKTeco] Sync Response (${resRequest.status}):`, resText);

                        if (resRequest.ok) count++;
                    }
                }
                console.log(`[ZKTeco] Synced ${count} users`);
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

app.all('/iclock/getrequest', async (req, res) => {
    // console.log(`[ZKTeco] Heartbeat from ${req.query.SN}`);

    // Attempt to force User Info Sync once
    if (!hasSentForceQuery) {
        console.log(`[ZKTeco] Sending FORCE SYNC command to ${req.query.SN}`);
        hasSentForceQuery = true;
        // Command ID: 1, Command: DATA QUERY USERINFO
        return res.send(`C:1:DATA QUERY USERINFO`);
    }

    res.send(`OK\nDate=${getRiyadhTime()}`); // Keep device time synced to Riyadh Time
});

// 3. Command Response (When device finishes a command)
app.post('/iclock/devicecmd', express.text({ type: '*/*' }), (req, res) => {
    const { SN } = req.query;
    console.log(`[ZKTeco] Device Command Response from ${SN}:`, req.body);
    res.send('OK');
});

// Apply Proxies (For other requests)
app.use('/iclock/api', createProxyMiddleware(proxyConfig));
app.use('/personnel/api', createProxyMiddleware(proxyConfig));
app.use('/att/api', createProxyMiddleware(proxyConfig));
app.use('/jwt-api-token-auth', createProxyMiddleware(proxyConfig));
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
