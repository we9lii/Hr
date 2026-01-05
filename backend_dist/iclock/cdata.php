<?php
// iclock/cdata.php - The Main Listener for ZKTeco ADMS
// Receives Push Data from Device

header("Content-Type: text/plain");
require_once '../db_connect.php'; // Go up one level to find db_connect

// Debugging & Diagnostics
$logFile = "debug_log.txt";

// 0. Browser Diagnostic Mode (When you open this specific file in browser)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && empty($_GET['SN']) && empty($_GET['options'])) {
    echo "<h1>🔌 ZKTeco Listener Status</h1>";
    echo "<p>Server receiving requests...</p>";

    // Check Permissions
    if (is_writable(__DIR__)) {
        echo "<p style='color:green'>✅ Write Permission: OK</p>";
    } else {
        echo "<p style='color:red'>❌ Write Permission: FAILED (Cannot write logs)</p>";
    }

    // Show Logs
    if (file_exists($logFile)) {
        echo "<h3>📜 Recent Logs:</h3>";
        echo "<pre style='background:#f4f4f4;padding:10px;border:1px solid #ccc'>" . file_get_contents($logFile) . "</pre>";
    } else {
        echo "<p><i>No logs recorded yet. Waiting for device...</i></p>";
    }

    // PHP Info for connection
    echo "<hr>Your IP: " . $_SERVER['REMOTE_ADDR'];
    exit;
}

// 1. Log Incoming Request (Force Write)
$log = date("Y-m-d H:i:s") . " | IP: " . $_SERVER['REMOTE_ADDR'] . "\n";
$log .= "URI: " . $_SERVER['REQUEST_URI'] . "\n";
$log .= "Method: " . $_SERVER['REQUEST_METHOD'] . "\n";
if (!empty(file_get_contents('php://input'))) {
    $log .= "BODY: " . file_get_contents('php://input') . "\n";
}
$log .= "--------------------------------------------------\n";
file_put_contents($logFile, $log, FILE_APPEND);

// 2. Capture Device Info
$sn = $_GET['SN'] ?? '';
$table = $_GET['table'] ?? '';
$options = $_GET['options'] ?? '';

if (empty($sn)) {
    // If it's the device checking, it usually sends SN. If not, it's a stray request.
    die("ERROR: Missing SN");
}

// 2. Update Heartbeat
try {
    $ip = $_SERVER['REMOTE_ADDR'];
    $stmt = $pdo->prepare("INSERT INTO devices (serial_number, ip_address, last_activity, status) VALUES (?, ?, NOW(), 'ONLINE') ON DUPLICATE KEY UPDATE ip_address = VALUES(ip_address), last_activity = NOW(), status = 'ONLINE'");
    $stmt->execute([$sn, $ip]);
} catch (Exception $e) {
    // Silent fail for heartbeat
    file_put_contents("error_log.txt", $e->getMessage(), FILE_APPEND);
}

// 3. Process Attendance Logs (ATTLOG)
if ($table === 'ATTLOG') {
    $content = file_get_contents('php://input');
    // Format is usually: USERID \t TIME \t STATUS \t VERIFY \t WORKCODE ...
    // Example: 101    2023-10-25 08:00:00 0   1   0

    if (!empty($content)) {
        $lines = explode("\n", $content);
        $count = 0;

        $stmt = $pdo->prepare("INSERT IGNORE INTO attendance_logs (device_sn, user_id, check_time, status, verify_mode, work_code) VALUES (?, ?, ?, ?, ?, ?)");

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line))
                continue;

            $parts = preg_split('/\s+/', $line); // Split by whitespace/tab
            if (count($parts) >= 2) {
                $user_id = $parts[0];
                $time = $parts[1] . ' ' . $parts[2]; // Date + Time
                $status = $parts[3] ?? 0;
                $verify = $parts[4] ?? 1;
                $work = $parts[5] ?? 0;

                try {
                    $stmt->execute([$sn, $user_id, $time, $status, $verify, $work]);
                    $count++;
                } catch (Exception $e) {
                    file_put_contents("error_log.txt", "Insert Error: " . $e->getMessage() . "\n", FILE_APPEND);
                }
            }
        }
    }

    // ZKTeco expects "OK" to acknowledge receipt
    echo "OK";
    exit;
}

// 4. Process Operation Logs (OPERLOG) - Optional
if ($table === 'OPERLOG') {
    echo "OK";
    exit;
}

// 5. Initial Handshake / Registry (First connection usually sends options=all)
if ($options === 'all') {
    echo "GET OPTION FROM: $sn\n";
    echo "Stamp=9999\n";
    echo "OpStamp=9999\n";
    echo "ErrorDelay=60\n";
    echo "Delay=30\n";
    echo "TransTimes=00:00;14:05\n";
    echo "TransInterval=1\n";
    echo "TransFlag=1111000000\n";
    echo "Realtime=1\n";
    echo "Encrypt=0\n";
    exit;
}

echo "OK";
// No closing tag to prevent whitespace issues