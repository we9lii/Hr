import fetch from 'node-fetch'; // Standard fetch in Node 18+

const BASE_URL = 'https://hr-bnyq.onrender.com/iclock/trigger_pull';
const TARGET_SN = 'AF4C232560143';

const triggerPull = async () => {
    console.log(`🚀 Triggering Device -> Server Sync for ${TARGET_SN}...`);
    try {
        const res = await fetch(`${BASE_URL}?sn=${TARGET_SN}`);
        const json = await res.json();

        console.log("Server Response:", json);

        if (json.status === 'success') {
            console.log("\n✅ Success! Commands Queued.");
            console.log("⚡ Action Required: REBOOT YOUR DEVICE NOW.");
            console.log("(After reboot, the device will upload all users and fingerprints to the server automatically)");
        } else {
            console.log("❌ Failed:", json);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
};

triggerPull();
