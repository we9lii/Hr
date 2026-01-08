
const API_CONFIG = {
    baseUrl: 'http://qssun.dyndns.org:8085',
    username: 'admin',
    password: 'Admim@123'
};

async function run() {
    console.log("Authenticating...");
    const authRes = await fetch(`${API_CONFIG.baseUrl}/jwt-api-token-auth/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: API_CONFIG.username, password: API_CONFIG.password })
    });

    if (!authRes.ok) {
        console.error('Auth Failed:', authRes.status);
        return;
    }

    const { token } = await authRes.json();
    const headers = { 'Authorization': `JWT ${token}`, 'Content-Type': 'application/json' };

    const endpoints = [
        { name: 'Departments', url: '/personnel/api/departments/' },
        { name: 'Areas', url: '/personnel/api/areas/' },
        { name: 'Positions', url: '/personnel/api/positions/' }
    ];

    for (const ep of endpoints) {
        console.log(`\n--- Fetching ${ep.name} ---`);
        try {
            const res = await fetch(`${API_CONFIG.baseUrl}${ep.url}?page_size=2`, { headers });
            if (!res.ok) {
                console.log(`Failed: ${res.status}`);
                continue;
            }
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.data || data.results;
            console.log(`Count: ${data.count || list.length}`);
            if (list.length > 0) {
                console.log('Sample Item:', JSON.stringify(list[0], null, 2));
            } else {
                console.log('Empty List');
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
}

run();
