import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Database Connection
const pool = mysql.createPool(process.env.DATABASE_URL || {
    // Fallback for dev (replace with real vars later or use env)
    host: 'localhost',
    user: 'root',
    database: 'test'
});

// Proxy Configuration (Existing)
const target = 'http://qssun.dyndns.org:8085';
const proxyConfig = {
    target,
    changeOrigin: true,
    secure: false,
};

// ZKTeco ADMS Listener (Must be BEFORE proxies)
// 1. Handshake & Data Push
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
                    // Insert into DB
                    await pool.execute(
                        `INSERT IGNORE INTO attendance_logs (device_sn, user_id, check_time, status, verify_mode, work_code) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [SN, userId, time, status || 0, verify || 1, workCode || 0]
                    );

                    // Update Device Status
                    await pool.execute(
                        `INSERT INTO devices (serial_number, last_activity, status) 
                         VALUES (?, NOW(), 'ONLINE') 
                         ON DUPLICATE KEY UPDATE last_activity = NOW(), status = 'ONLINE'`,
                        [SN]
                    );
                    count++;
                }
            }
            console.log(`[ZKTeco] Saved ${count} logs`);
        } catch (error) {
            console.error('[ZKTeco] DB Error:', error);
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
