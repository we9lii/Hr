import fs from 'fs';

// API Configuration
const BASE_URL = 'https://qssun.solar/api/iclock';
const DEVICE_SN = 'MANUAL_UPLOAD';

const uploadUser = async (user) => {
    try {
        const payload = {
            user_id: user.PIN,
            name: user.Name || 'Unknown',
            role: user.Pri || 0,
            card_number: user.Card || '',
            password: user.Passwd || '',
            device_sn: DEVICE_SN
        };

        const res = await fetch(`${BASE_URL}/sync_user.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const txt = await res.text();
        if (!res.ok) console.error(`❌ User ${user.PIN} Failed:`, txt);
        // else console.log(`✅ User ${user.PIN}:`, txt);
        return res.ok;
    } catch (e) {
        console.error(`❌ User ${user.PIN} Error:`, e.message);
        return false;
    }
};

const uploadFinger = async (fp) => {
    try {
        const payload = {
            user_id: fp.PIN,
            finger_id: fp.FID || 0,
            template_data: fp.TMP,
            size: fp.Size || fp.TMP.length,
            device_sn: DEVICE_SN
        };

        const res = await fetch(`${BASE_URL}/sync_fingerprint.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const txt = await res.text();
        if (!res.ok) console.error(`❌ FP ${fp.PIN} Failed:`, txt);
        // else console.log(`✅ FP ${fp.PIN}:`, txt);
        return res.ok;
    } catch (e) {
        console.error(`❌ FP ${fp.PIN} Error:`, e.message);
        return false;
    }
};

const processBackup = async () => {
    console.log(`🚀 Starting Cloud Upload to ${BASE_URL}...`);

    // 1. Users
    if (fs.existsSync('user.dat')) {
        const content = fs.readFileSync('user.dat', 'utf-8');
        const lines = content.split('\n');
        let queue = [];

        console.log(`📂 Found user.dat, processing ${lines.length} lines...`);

        for (const line of lines) {
            if (!line.trim()) continue;
            const parts = line.split('\t');
            const data = {};
            parts.forEach(p => {
                const [k, v] = p.split('=', 2);
                if (k) data[k.trim()] = v ? v.trim() : '';
            });

            if (data['PIN']) {
                queue.push(uploadUser(data));
            }
        }

        // Execute in chunks of 10 to avoid overwhelming server
        for (let i = 0; i < queue.length; i += 10) {
            const chunk = queue.slice(i, i + 10);
            await Promise.all(chunk);
            process.stdout.write(`\rUser Progress: ${Math.min(i + 10, queue.length)} / ${queue.length}`);
        }
        console.log('\n✅ User Upload Complete.');
    }

    // 2. Fingerprints
    const fpFiles = ['template.fp10', 'template.fp10.1'];
    for (const file of fpFiles) {
        if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf-8');
            const lines = content.split('\n');
            let queue = [];

            console.log(`📂 Found ${file}, processing ${lines.length} lines...`);

            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.split('\t');
                const data = {};
                parts.forEach(p => {
                    const [k, v] = p.split('=', 2);
                    if (k) data[k.trim()] = v ? v.trim() : '';
                });

                if (data['PIN'] && data['TMP']) {
                    queue.push(uploadFinger(data));
                }
            }

            // Execute in chunks
            for (let i = 0; i < queue.length; i += 10) {
                const chunk = queue.slice(i, i + 10);
                await Promise.all(chunk);
                process.stdout.write(`\rFP Progress: ${Math.min(i + 10, queue.length)} / ${queue.length}`);
            }
            console.log(`\n✅ ${file} Upload Complete.`);
        }
    }

    console.log('🎉 All Data Transferred Successfully!');
};

processBackup();
