<?php
// transactions.php - Robust ADMS Proxy with UTF-8 Support
// Prevent any implicit output
ob_start();

// Disable error display to user (logs only)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// Security Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Fatal Error Handler
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        // Only clean if buffer active
        while (ob_get_level())
            ob_end_clean();
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

// Ensure data is valid UTF-8 to prevent json_encode failures
function utf8ize($d)
{
    if (is_array($d)) {
        foreach ($d as $k => $v) {
            $d[$k] = utf8ize($v);
        }
    } else if (is_string($d)) {
        return mb_convert_encoding($d, 'UTF-8', 'UTF-8');
    }
    return $d;
}

// ==========================================
// BioTime Web API Integration (Replaces ADMS)
// ==========================================

function getBioTimeToken()
{
    $url = "http://qssun.dyndns.org:8085/api-token-auth/";
    $credentials = [
        'username' => 'admin',
        'password' => 'Admin@123'
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($credentials));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        logDebug("Token Fetch Error: $curlError");
        return null;
    }

    $data = json_decode($response, true);
    if (isset($data['token'])) {
        return $data['token'];
    }

    logDebug("Token Fetch Failed (Code $httpCode): $response");
    return null;
}

function sendToBioTimeWebAPI($emp_code, $punch_time, $punch_state, $terminal_sn, $area_alias, $gps_location)
{
    // 1. Get Auth Token
    $token = getBioTimeToken();
    if (!$token) {
        return ['status' => 'error', 'message' => 'Failed to authenticate with BioTime'];
    }

    // 2. Prepare Payload
    // Correct Endpoint for Web Punches (found via Docs)
    $url = "http://qssun.dyndns.org:8085/att/api/webpunches/";

    // Mapping punch_state to BioTime standards
    // 0: Check In, 1: Check Out, 2: Break Out, 3: Break In

    // Ensure Verify Type is '1' (Fingerprint) or similar.
    // For Web Punch, usually source=1 or similar is used internally.

    $payload = [
        'emp_code' => $emp_code,
        'punch_time' => $punch_time,
        'punch_state' => $punch_state,
        'source' => 'MOBILE', // Explicitly mark as mobile
        'verify_type' => 1    // Fingerprint/Web
    ];

    if (!empty($terminal_sn)) {
        $payload['terminal_sn'] = $terminal_sn;
    }
    if (!empty($area_alias)) {
        $payload['area_alias'] = $area_alias;
    }

    // Optional: Add GPS if available
    if ($gps_location) {
        $payload['gps_location'] = $gps_location;
    }

    // 3. Send Request
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Token ' . $token
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    // 4. Log and Return
    logDebug("BioTime API Response [$httpCode]: $response");

    if ($curlError) {
        return ['status' => 'error', 'message' => "Curl Error: $curlError"];
    }

    if ($httpCode >= 200 && $httpCode < 300) {
        return ['status' => 'success', 'code' => $httpCode, 'body' => 'OK'];
    }

    return ['status' => 'error', 'code' => $httpCode, 'body' => $response];
}

function sendToBioTimeManualLog($emp_code, $punch_time, $state, $reason = 'Mobile Punch')
{
    $token = getBioTimeToken();
    if (!$token)
        return ['status' => 'error', 'message' => 'Auth Failed'];

    $url = "http://qssun.dyndns.org:8085/att/api/manuallogs/";

    // Manual Logs use different keys: 'employee' instead of 'emp_code'
    $payload = [
        'employee' => $emp_code,
        'punch_time' => $punch_time,
        'punch_state' => (string) $state,
        'apply_reason' => $reason
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Token ' . $token
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    logDebug("BioTime ManualLog Response [$httpCode]: $response");

    if ($httpCode >= 200 && $httpCode < 300) {
        return ['status' => 'success', 'code' => $httpCode, 'body' => 'OK'];
    }
    return ['status' => 'error', 'code' => $httpCode, 'body' => $response];
}

function safeJsonExit($data, $code = 200)
{
    // Clear buffer of any previous warnings/text
    while (ob_get_level())
        ob_end_clean();

    // Re-start buffer to ensure clean output
    ob_start();
    http_response_code($code);

    // Sanitize and Encode
    $cleanData = utf8ize($data);
    $json = json_encode($cleanData);

    if ($json === false) {
        $json = json_encode(['error' => 'JSON Encode Failed', 'details' => json_last_error_msg()]);
    }

    echo $json;
    ob_end_flush(); // Send to browser
    exit;
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
        if (strpos($inputTime, 'Z') !== false) {
            $d = new DateTime($inputTime);
            $d->setTimezone(new DateTimeZone('Asia/Riyadh'));
            $localTime = $d->format('Y-m-d H:i:s');
        } else {
            // App sends ISO string stripped of 'T' and 'Z' (e.g. "2026-01-21 06:59:21")
            // This is UTC time. We must convert it to Riyadh.
            $d = new DateTime($inputTime, new DateTimeZone('UTC'));
            $d->setTimezone(new DateTimeZone('Asia/Riyadh'));
            $localTime = $d->format('Y-m-d H:i:s');
        }

        $isRemote = $data['is_remote'] ?? false;

        // --- NEW SN LOGIC ---
        // If app sends a specific SN, use it. If "Web/Virtual", use empty to let BioTime decide or map.
        $sn = $data['terminal_sn'] ?: ($isRemote ? '' : '');
        // User hated forced SN, so let's default to empty/null for API if not present.

        // Use 1 (Fingerprint) as a standard accepted method for Virtual Devices.
        $verify = 1;
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
                    $data['terminal_sn'] ?: 'MOBILE', // Log 'MOBILE' for local DB clarity
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

        // 3. Send to BioTime Web API
        $bioSn = $sn; // Can be empty
        $area = '';   // Default empty, let BioTime handle
        $gps = (isset($data['latitude']) && isset($data['longitude']))
            ? $data['latitude'] . ',' . $data['longitude']
            : '';

        $bioResult = sendToBioTimeWebAPI($validBadge, $localTime, $state, $bioSn, $area, $gps);

        safeJsonExit(['status' => 'success', 'message' => 'Recorded', 'bio_result' => $bioResult]);
    }

    // GET Request (Fetch Logs)
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {

        // --- DEBUG TOOLS ---
        if (isset($_GET['test_auth'])) {
            $url = "http://qssun.dyndns.org:8085/api-token-auth/";
            $credentials = ['username' => 'admin', 'password' => 'Admin@123'];

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_POST, 1);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($credentials));
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);

            $response = curl_exec($ch);
            $info = curl_getinfo($ch);
            $err = curl_error($ch);
            curl_close($ch);

            safeJsonExit([
                'test' => 'BioTime Auth',
                'url' => $url,
                'http_code' => $info['http_code'],
                'curl_error' => $err,
                'response' => json_decode($response, true) ?? $response
            ]);
        }

        // --- TEST PUNCH ---
        if (isset($_GET['test_punch'])) {
            $emp = $_GET['emp'] ?? '1093394672'; // Default to Faisal
            // Use current time
            $time = date('Y-m-d H:i:s');
            $mode = $_GET['mode'] ?? 'web'; // 'web' or 'manual'

            if ($mode === 'manual') {
                // Test Manual Log Endpoint
                $result = sendToBioTimeManualLog($emp, $time, 0, 'MobileTest');
                safeJsonExit([
                    'test' => 'BioTime Manual Log',
                    'emp' => $emp,
                    'time' => $time,
                    'api_url' => "http://qssun.dyndns.org:8085/att/api/manuallogs/",
                    'api_result' => $result
                ]);
            } else {
                // Test Web Punch Endpoint (Default)
                // Allow dynamic SN/Area testing via URL
                // Default to empty to see if BioTime accepts "Web Punch" without SN
                $sn = $_GET['sn'] ?? '';
                $area = $_GET['area'] ?? '';

                $gps = '24.7136,46.6753';

                // Call the function
                $result = sendToBioTimeWebAPI($emp, $time, 0, $sn, $area, $gps);

                // Create clickable map link for verification
                $mapLink = "https://www.google.com/maps?q=" . str_replace(' ', '', $gps);

                safeJsonExit([
                    'test' => 'BioTime Web Punch',
                    'emp' => $emp,
                    'time' => $time,
                    'used_sn' => $sn,
                    'used_area' => $area,
                    'gps_sent' => $gps,
                    'google_maps_link' => $mapLink,
                    'api_url' => "http://qssun.dyndns.org:8085/att/api/webpunches/",
                    'api_result' => $result
                ]);
            }
        }

        if (isset($_GET['view_logs'])) {
            $logFile = __DIR__ . '/gps_debug_log.txt';
            if (file_exists($logFile)) {
                // Determine if we need to clear logs
                if (isset($_GET['clear'])) {
                    file_put_contents($logFile, "");
                    echo "Logs Cleared.";
                    exit;
                }
                echo "<h3>Debug Log (" . date('Y-m-d H:i:s') . ")</h3>";
                echo "<pre>" . htmlspecialchars(file_get_contents($logFile)) . "</pre>";
                exit;
            } else {
                echo "No log file found at $logFile";
                exit;
            }
        }

        // --- PROXY MANUAL LOGS ---
        if (isset($_GET['mode']) && $_GET['mode'] === 'manual_logs') {
            $token = getBioTimeToken();
            if (!$token)
                safeJsonExit(['results' => []]);

            $baseUrl = "http://qssun.dyndns.org:8085/att/api/manuallogs/";
            $params = [
                'page_size' => 1000
            ];

            if (isset($_GET['punch_time__gte']))
                $params['punch_time__gte'] = $_GET['punch_time__gte'];
            if (isset($_GET['punch_time__lte']))
                $params['punch_time__lte'] = $_GET['punch_time__lte'];

            // BioTime 'employee' field filtering. Try 'employee__emp_code' for code match.
            if (isset($_GET['emp_code']) && $_GET['emp_code'] !== 'ALL') {
                $params['employee__emp_code'] = $_GET['emp_code'];
            }

            $url = $baseUrl . "?" . http_build_query($params);

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Authorization: Token ' . $token
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);

            $json = curl_exec($ch);

            // Verify if error
            if (curl_errno($ch)) {
                safeJsonExit(['results' => [], 'error' => curl_error($ch)]);
            }
            curl_close($ch);

            // Pass through the BioTime JSON directly
            // Ensure valid JSON before echoing
            $test = json_decode($json);
            if ($test) {
                echo $json;
            } else {
                safeJsonExit(['results' => [], 'error' => 'Invalid Upstream Response']);
            }
            exit;
        }

        // -------------------

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