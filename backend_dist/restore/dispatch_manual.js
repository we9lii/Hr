import fs from 'fs';

const BASE_URL = 'https://hr-bnyq.onrender.com/iclock/trigger_full_sync';
const TARGET_SN = 'AF4C232560143';

const dispatch = async () => {
    try {
        const payload = { sn: TARGET_SN, users: [], fingerprints: [] };

        // 1. Read Users
        if (fs.existsSync('user.dat')) {
            const content = fs.readFileSync('user.dat', 'utf-8');
            console.log(`[UserId] Reading user.dat, size: ${content.length}`);

            const lines = content.split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;
                const parts = line.split('\t');
                const d = {};
                parts.forEach(p => {
                    const [k, v] = p.split('=', 2);
                    if (k) d[k.trim()] = v ? v.trim() : '';
                });

                if (d['PIN']) {
                    payload.users.push({
                        user_id: d['PIN'],
                        name: d['Name'] || '',
                        role: d['Pri'] || 0,
                        password: d['Passwd'] || '',
                        card_number: d['Card'] || ''
                    });
                } else {
                    console.log("[Warn] Line missing PIN:", line);
                }
            });
            console.log(`[UserId] Parsed ${payload.users.length} users.`);
        } else {
            console.log("[Error] user.dat not found!");
        }

        // 2. Read Fingerprints
        const fpFiles = ['template.fp10', 'template.fp10.1'];
        for (const f of fpFiles) {
            if (fs.existsSync(f)) {
                const content = fs.readFileSync(f, 'utf-8');
                console.log(`[FP] Reading ${f}, size: ${content.length}`);

                const lines = content.split('\n');
                lines.forEach(line => {
                    if (!line.trim()) return;
                    const parts = line.split('\t');
                    const d = {};
                    parts.forEach(p => {
                        const [k, v] = p.split('=', 2);
                        if (k) d[k.trim()] = v ? v.trim() : '';
                    });

                    if (d['PIN'] && d['TMP']) {
                        payload.fingerprints.push({
                            user_id: d['PIN'],
                            finger_id: d['FID'] || 0,
                            template_data: d['TMP'],
                            size: d['Size'] || d['TMP'].length,
                            valid: d['Valid'] || 1
                        });
                    }
                });
                console.log(`[FP] Parsed ${payload.fingerprints.length} fingerprints from ${f}.`);
            }
        }

        if (payload.users.length === 0 && payload.fingerprints.length === 0) {
            console.log("❌ No data found to send. Aborting.");
            return;
        }

        console.log(`🚀 Sending ${payload.users.length} users and ${payload.fingerprints.length} fingerprints...`);

        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const txt = await res.text();
            console.log(`❌ Server Error (${res.status}):`, txt);
            return;
        }

        const json = await res.json();
        console.log("Server Response:", json);
        if (json.status === 'success') console.log("✅ Commands Queued Successfully! Reboot your device now.");
        else console.log("❌ Partial Failure:", json);

    } catch (e) {
        console.error("Error:", e.message);
    }
};

dispatch();
