
const API_CONFIG = {
    baseUrl: 'http://qssun.dyndns.org:8085',
    username: 'admin',
    password: 'Admim@123'
};

async function run() {
    // 1. Auth
    console.log("Authenticating...");
    const authRes = await fetch(`${API_CONFIG.baseUrl}/jwt-api-token-auth/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: API_CONFIG.username, password: API_CONFIG.password })
    });

    if (!authRes.ok) {
        console.error('Auth Failed:', authRes.status, await authRes.text());
        return;
    }

    const authData = await authRes.json();
    const token = authData.token;
    console.log('Got Token:', token.substring(0, 10) + '...');

    const headers = {
        'Authorization': `JWT ${token}`,
        'Content-Type': 'application/json'
    };

    // 2. Test Endpoints
    const endpoints = [
        '/iclock/api/transactions/',
        '/iclock/api/transactions/add/',
        '/iclock/api/transactions/create/',
        '/personnel/api/transactions/',
        '/personnel/api/manual_log/',
        '/api/transactions/',
        '/api/att/transactions/'
    ];

    for (const ep of endpoints) {
        console.log(`\nTesting ${ep}...`);
        try {
            // OPTIONS
            const optRes = await fetch(`${API_CONFIG.baseUrl}${ep}`, { method: 'OPTIONS', headers });
            console.log(`  OPTIONS: ${optRes.status} Allow: ${optRes.headers.get('allow')}`);

            // POST (Dry run)
            // If 405, we know it's not allowed. If 404, not found.
            // If 400 or 500 or 201, we found something interesting.
            if (optRes.status !== 404) {
                const postRes = await fetch(`${API_CONFIG.baseUrl}${ep}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ emp_code: '1', punch_time: new Date().toISOString(), punch_state: '0', verify_mode: '15' })
                });
                console.log(`  POST: ${postRes.status} ${postRes.statusText}`);
                try { console.log("  Response:", await postRes.text()); } catch (e) { }
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }
}

run();
