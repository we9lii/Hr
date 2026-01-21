<?php
// transactions.php - ADMS Proxy with Redundancy and Self-Contained DB Logic
// Prevent any implicit output
ob_start();

// Disable error display to user (logs only)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// Security Headers
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// Fatal Error Handler
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        ob_end_clean(); // Clean any garbage output (e.g. HTML error details)
        http_response_code(500);
        echo json_encode(['error' => 'Fatal Error', 'details' => $error['message'], 'line' => $error['line']]);
        exit;
    }
});

// --- Helper Functions ---

function logDebug($msg)
{
    try {
        $date = date('Y-m-d H:i:s');
        $logFile = __DIR__ . '/gps_debug_log.txt';
        @file_put_contents($logFile, "[$date] $msg\n", FILE_APPEND);
    } catch (Exception $e) { /* Ignore logging errors */
    }
}

function safeJsonExit($data, $code = 200)
{
    // Clear buffer of any previous warnings/text
    ob_end_clean();
    // Re-start buffer to ensure clean output
    ob_start();
    http_response_code($code);
    echo json_encode($data);
    ob_end_flush(); // Send to browser
    exit;
}

function sendRequest($url, $postData)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    // Ignore SSL for internal proxies if needed
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return ['code' => $httpCode, 'resp' => $response, 'err' => $error];
}

function sendToBioTimeADMS($badge, $time, $sn, $state, $verify)
{
    // 1. Primary URL
    $url1 = "http://qssun.dyndns.org:8085/iclock/cdata?SN=" . $sn . "&table=ATTLOG&Stamp=9999";
    // 2. Backup URL
    $url2 = "http://127.0.0.1:8085/iclock/cdata?SN=" . $sn . "&table=ATTLOG&Stamp=9999";

    $postData = $badge . "\t" . $state . "\t" . $verify . "\t" . $time . "\t0\t0\t\t\n";

    $res = sendRequest($url1, $postData);
    logDebug("Public ADMS: Code={$res['code']} Err={$res['err']}");

    $success = ($res['code'] == 200 && strpos($res['resp'], 'OK') !== false);
    $source = "Public";

    if (!$success) {
        $res = sendRequest($url2, $postData);
        logDebug("Local ADMS: Code={$res['code']} Err={$res['err']}");
        $success = ($res['code'] == 200 && strpos($res['resp'], 'OK') !== false);
        $source = "Local";
    }

    return [
        'success' => $success,
        'source' => $source,
        'code' => $res['code'],
        'response' => $res['resp'],
        'error' => $res['err']
    ];
}

// --- DB Connection (Inlined) ---
$pdo = null;
try {
    $host = "localhost";
    $db_name = "qssunsolar_qssunsolar_hr";
    $username = "qssunsol_qssun_user";
    $password = "g3QL]cRAHvny";

    $dsn = "mysql:host=$host;dbname=$db_name;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $pdo = new PDO($dsn, $username, $password, $options);
} catch (PDOException $e) {
    logDebug("DB Connection FAIL: " . $e->getMessage());
    // Proceed without DB if it fails (Fail-Open for Attendance)
    // Or die if critical? For attendance, BioTime is critical. DB is secondary log.
}

// --- Main Logic ---

try {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        safeJsonExit(['status' => 'ok']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);

        if (!$data) {
            safeJsonExit(['error' => 'Invalid JSON Body'], 400);
        }

        // Action: Delete
        if (isset($data['action']) && $data['action'] === 'delete') {
            if (!$pdo)
                safeJsonExit(['status' => 'error', 'message' => 'DB Unavailable']);

            if (isset($data['id'])) {
                $stmt = $pdo->prepare("DELETE FROM attendance_logs WHERE id=? AND verify_mode=15");
                $stmt->execute([$data['id']]);
                safeJsonExit(['status' => ($stmt->rowCount() > 0 ? 'success' : 'error')]);
            } else {
                safeJsonExit(['status' => 'error', 'message' => 'Missing ID']);
            }
        }

        // Action: Record Attendance
        if (!isset($data['emp_code']) || !isset($data['punch_time'])) {
            safeJsonExit(['error' => 'Missing emp_code or punch_time'], 400);
        }

        // Timezone Norm
        date_default_timezone_set('Asia/Riyadh');
        $inputTime = $data['punch_time'];
        // Assume input is UTC if ending in Z, else treat properly
        // Safer: If no timezone info, treat as UTC then convert
        if (strpos($inputTime, 'Z') !== false) {
            $localTime = date('Y-m-d H:i:s', strtotime($inputTime)); // Server TZ is Riyadh set above ? No, strtotime handles Z as UTC.
            // Wait, set TZ affects 'date'.
            // Let's be explicit
            $d = new DateTime($inputTime);
            $d->setTimezone(new DateTimeZone('Asia/Riyadh'));
            $localTime = $d->format('Y-m-d H:i:s');
        } else {
            // Already local or ambiguous. Trust input.
            $localTime = date('Y-m-d H:i:s', strtotime($inputTime));
        }

        $isRemote = $data['is_remote'] ?? false;
        $sn = $data['terminal_sn'] ?: ($isRemote ? 'AF4C232560143' : 'MANUAL');
        $verify = $isRemote ? 1 : 15; // 1=Finger/Bio, 15=Mobile/Face?
        $state = $data['punch_state'] ?? 0;

        // 1. Save to Local DB (if available)
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("INSERT INTO attendance_logs (user_id, check_time, status, verify_mode, device_sn, latitude, longitude, image_proof) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE check_time=VALUES(check_time)");
                $stmt->execute([
                    $data['emp_code'],
                    $localTime,
                    $state,
                    $verify,
                    $sn,
                    $data['latitude'] ?? 0,
                    $data['longitude'] ?? 0,
                    $data['image_proof'] ?? ''
                ]);
                logDebug("DB Insert OK: {$data['emp_code']}");
            } catch (Exception $e) {
                logDebug("DB Insert ERR: " . $e->getMessage());
            }
        }

        // 2. Map ID -> Badge (if DB avail)
        $validBadge = $data['emp_code'];
        if ($pdo) {
            try {
                $q = $pdo->prepare("SELECT card_number FROM biometric_users WHERE user_id=? LIMIT 1");
                $q->execute([$validBadge]);
                $u = $q->fetch(PDO::FETCH_ASSOC);
                if ($u && !empty($u['card_number'])) {
                    $validBadge = $u['card_number'];
                }
            } catch (Exception $e) { /* ignore */
            }
        }

        // 3. Send to BioTime
        $bioSn = 'AF4C232560143'; // Virtual SN for Mobile
        $bioResult = sendToBioTimeADMS($validBadge, $localTime, $bioSn, $state, $verify);

        safeJsonExit(['status' => 'success', 'message' => 'Recorded', 'bio_result' => $bioResult]);
    }

    // GET Request (Fetch Logs)
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (!$pdo)
            safeJsonExit(['error' => 'DB Unavailable'], 500);

        $start = $_GET['punch_time__gte'] ?? date('Y-m-d 00:00:00');
        $end = $_GET['punch_time__lte'] ?? date('Y-m-d 23:59:59');
        $pParams = [$start, $end];

        $sql = "SELECT l.*, u.name as real_name, u.card_number FROM attendance_logs l LEFT JOIN biometric_users u ON l.user_id=u.user_id WHERE l.check_time >= ? AND l.check_time <= ?";

        if (($c = $_GET['emp_code'] ?? '') && $c != 'ALL') {
            $sql .= " AND (l.user_id=? OR u.card_number=?)";
            $pParams[] = $c;
            $pParams[] = $c;
        }
        if (($s = $_GET['terminal_sn'] ?? $_GET['device_sn'] ?? '') && $s != 'ALL') {
            $sql .= " AND l.device_sn=?";
            $pParams[] = $s;
        }

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $size = 1000;
        $offset = ($page - 1) * $size;
        $sql .= " ORDER BY l.check_time DESC LIMIT $size OFFSET $offset";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($pParams);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $res = [];
        foreach ($rows as $r) {
            $res[] = [
                'id' => $r['id'],
                'emp_code' => ($r['card_number'] ?: $r['user_id']),
                'emp_name' => $r['real_name'] ?: ("User " . $r['user_id']),
                'punch_time' => $r['check_time'],
                'punch_state' => $r['status'],
                'verify_type_display' => ($r['device_sn'] == 'MANUAL' ? 'Manual' : ($r['verify_mode'] == 1 ? 'Finger' : 'Face')),
                'terminal_sn' => $r['device_sn'],
                'terminal_alias' => $r['device_sn'],
                'area_alias' => 'الفرع الرئيسي',
                'latitude' => $r['latitude'],
                'longitude' => $r['longitude'],
                'image_proof' => $r['image_proof']
            ];
        }
        safeJsonExit($res);
    }

} catch (Exception $e) {
    safeJsonExit(['error' => 'Internal Server Error: ' . $e->getMessage()], 500);
}
?>