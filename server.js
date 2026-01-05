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

// Proxy Configuration
const target = 'http://qssun.dyndns.org:8085';
const proxyConfig = {
    target,
    changeOrigin: true,
    secure: false,
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
    if (req.method === 'POST' && table === 'ATTLOG') {
        const body = req.body; // Raw text body
        console.log(`[ZKTeco] Received Logs from ${SN}:`, body);

        if (!body) return res.send('OK');

        const lines = body.split('\n').filter(line => line.trim());
        let count = 0;

        try {
            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    const [userId, time, status, verify, workCode] = parts;

                    // HTTP Bridge: Sync to cPanel via HTTPS
                    const payload = {
                        device_sn: SN,
                        user_id: userId,
                        check_time: time,
                        status: status || 0,
                        verify_mode: verify || 1,
                        work_code: workCode || 0
                    };

                    // Use global fetch (Node 18+)
                    const response = await fetch(SYNC_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await response.json();
                    if (result.status === 'success') count++;
                    else console.error(`[ZKTeco] Sync Failed:`, result);
                }
            }
            console.log(`[ZKTeco] Synced ${count} logs via Bridge`);
        } catch (error) {
            console.error('[ZKTeco] Bridge Error:', error);
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
app.use('/personnel/api', createProxyMiddleware(proxyConfig));
app.use('/att/api', createProxyMiddleware(proxyConfig));
app.use('/jwt-api-token-auth', createProxyMiddleware(proxyConfig));

// Serve Static Files (Build Output)
app.use(express.static(path.join(__dirname, 'dist')));

// Handle Client-Side Routing (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
