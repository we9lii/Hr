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
    console.log(`[ZKTeco] Request: ${req.method} ${req.url}`);

    // Handshake (First Connection)
    if (req.method === 'GET' && options === 'all') {
        console.log(`[ZKTeco] Handshake from ${SN}`);
        return res.send(`GET OPTION FROM: ${SN}\nStamp=9999\nOpStamp=9999\nErrorDelay=60\nDelay=30\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nRealtime=1\nEncrypt=0`);
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
                        await fetch(SYNC_URL, {
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
                        count++;
                    }
                }
                console.log(`[ZKTeco] Synced ${count} logs`);
            } catch (e) { console.error(e); }
        }

        else if (table === 'USERINFO') {
            // USERINFO Format: User_PIN	Name	Privilege	Password	Card	Group	Timezone	Verify
            const SYNC_USER_URL = 'https://qssun.solar/api/iclock/sync_user.php';
            try {
                for (const line of lines) {
                    const parts = line.split('\t');
                    if (parts.length >= 1) {
                        // ZK Protocol sometimes varies, but usually:
                        // PIN, Name, Password, Card, Priv, Group...
                        // Let's assume standard push params or parse liberally
                        // Actually, ZK push: USERINFO usually sends:
                        // User_PIN \t Name \t Privilege \t Password \t Card \t ...
                        const [userId, name, priv, pass, card] = parts;

                        await fetch(SYNC_USER_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                device_sn: SN,
                                user_id: userId,
                                name: name || '',
                                role: priv || 0,
                                password: pass || '',
                                card_number: card || ''
                            })
                        });
                        count++;
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

// 2. Command Check (Poll)
app.all('/iclock/getrequest', async (req, res) => {
    console.log(`[ZKTeco] Heartbeat from ${req.query.SN}`);
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
