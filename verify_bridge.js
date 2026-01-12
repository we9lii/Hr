
import fetch from 'node-fetch';

const API_URL = 'https://qssun.solar/api/iclock/sync_user.php';

async function testBridge() {
    console.log(`Testing Bridge: ${API_URL}`);
    try {
        const payload = {
            user_id: '999999',
            name: 'Test User Bridge',
            role: 1,
            card_number: '123456',
            password: '',
            device_sn: 'TEST_DEVICE'
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log('Response Status:', response.status);
        console.log('Response Body:', text);

        try {
            const json = JSON.parse(text);
            if (json.status === 'success') {
                console.log('SUCCESS: User inserted/updated.');
            } else {
                console.log('FAILURE: API returned error.');
            }
        } catch (e) {
            console.log('FAILURE: Invalid JSON response.');
        }

    } catch (e) {
        console.error('NETWORK ERROR:', e.message);
    }
}

testBridge();
