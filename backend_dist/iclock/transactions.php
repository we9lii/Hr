<?php
// transactions.php - ADMS Proxy with Redundancy
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Logging Helper
function logDebug($msg)
{
    $date = date('Y-m-d H:i:s');
    $logMsg = "[$date] $msg";
    // Try file log
    @file_put_contents('d:/ch/backend_dist/iclock/gps_debug_log.txt', $logMsg . "\n", FILE_APPEND);
    // Try system log
    error_log("GPS_DEBUG: $msg");
}

// Helper: CURL Request
function sendRequest($url, $postData)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3); // Fast timeout to try backup
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return ['code' => $httpCode, 'resp' => $response, 'err' => $error];
}

// ADMS Proxy with Fallback - UPDATED to return details
function sendToBioTimeADMS($badge, $time, $sn, $state, $verify)
{
    // 1. Primary URL (Public)
    $url1 = "http://qssun.dyndns.org:8085/iclock/cdata?SN=" . $sn . "&table=ATTLOG&Stamp=9999";
    // 2. Backup URL (Localhost - avoids NAT Loopback issues)
    $url2 = "http://127.0.0.1:8085/iclock/cdata?SN=" . $sn . "&table=ATTLOG&Stamp=9999";

    // Format: user_id\tstate\tverify\ttime\n
    $postData = $badge . "\t" . $state . "\t" . $verify . "\t" . $time . "\t0\t0\t\t\n";

    // Try Primary
    $res = sendRequest($url1, $postData);
    logDebug("Try Public: Code={$res['code']} Err={$res['err']}");

    $success = ($res['code'] == 200 && strpos($res['resp'], 'OK') !== false);
    $source = "Public";

    if (!$success) {
        // Try Backup
        $res = sendRequest($url2, $postData);
        logDebug("Try Local: Code={$res['code']} Err={$res['err']}");
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

// Main Logic
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    header("Access-Control-Allow-Origin: *");
    header("Content-Type: application/json");

    // DB Connection (Optional for BioTime Testing)
    $host = "localhost";
    $db_name = "qssunsolar_qssunsolar_hr";
    $username = "qssunsol_qssun_user";
    $password = "g3QL]cRAHvny";
    $pdo = null;

    try {
        $dsn = "mysql:host=$host;dbname=$db_name;charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        $pdo = new PDO($dsn, $username, $password, $options);
    } catch (Exception $e) {
        // DB Failed - Continue anyway for BioTime testing
        logDebug("DB Connection Failed (Ignoring for Test): " . $e->getMessage());
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);

        // DELETE
        if (isset($data['action']) && $data['action'] === 'delete') {
            if ($pdo && isset($data['id'])) {
                $stmt = $pdo->prepare("DELETE FROM attendance_logs WHERE id=? AND verify_mode=15");
                $stmt->execute([$data['id']]);
                echo json_encode(['status' => ($stmt->rowCount() > 0 ? 'success' : 'error')]);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'DB unavailable or missing ID']);
            }
            exit;
        }

        // CREATE
        if (!isset($data['emp_code']) || !isset($data['punch_time'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            exit;
        }

        // Timezone
        date_default_timezone_set('Asia/Riyadh');
        $inputTime = $data['punch_time'] ?? date('Y-m-d H:i:s');
        if (strpos($inputTime, 'Z') === false && strpos($inputTime, '+') === false)
            $inputTime .= ' UTC';
        $localTime = date('Y-m-d H:i:s', strtotime($inputTime));

        $isRemote = $data['is_remote'] ?? false;
        $sn = $data['terminal_sn'] ?: ($isRemote ? 'AF4C232560143' : 'MANUAL');
        $verify = $isRemote ? 1 : 15;
        $state = $data['punch_state'] ?? 0;

        // Save to Custom DB (App History) - Only if DB is active
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("INSERT INTO attendance_logs (user_id, check_time, status, verify_mode, device_sn, latitude, longitude, image_proof) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE check_time=VALUES(check_time)");
                $stmt->execute([$data['emp_code'], $localTime, $state, $verify, $sn, $data['latitude'] ?? 0, $data['longitude'] ?? 0, $data['image_proof'] ?? '']);
                logDebug("Custom Insert OK: {$data['emp_code']}");
            } catch (Exception $e) {
                logDebug("Custom Fail: " . $e->getMessage());
            }
        }

        // Proxy to BioTime
        $validBadge = $data['emp_code'];
        // Lookup Mapping (National ID -> Badge)
        if ($pdo) {
            try {
                $q = $pdo->prepare("SELECT card_number FROM biometric_users WHERE user_id=? LIMIT 1");
                $q->execute([$validBadge]); // Mapping from user_id (National ID) to card_number (Badge)
                $u = $q->fetch(PDO::FETCH_ASSOC);
                if ($u && $u['card_number']) {
                    $validBadge = $u['card_number'];
                    logDebug("Mapped {$data['emp_code']} -> $validBadge");
                } else {
                    logDebug("No mapping for {$data['emp_code']}");
                }
            } catch (Exception $e) {
                logDebug("Lookup Err: " . $e->getMessage());
            }
        }

        // Send
        $bioSn = 'AF4C232560143';
        $bioResult = sendToBioTimeADMS($validBadge, $localTime, $bioSn, $state, $verify);

        echo json_encode(['status' => 'success', 'message' => 'Recorded', 'bio_result' => $bioResult]);
        exit;
    }

    // GET Logic
    $start = $_GET['punch_time__gte'] ?? date('Y-m-d 00:00:00');
    $end = $_GET['punch_time__lte'] ?? date('Y-m-d 23:59:59');
    $pParams = [$start, $end];
    $sql = "SELECT l.*, u.name as real_name, u.card_number FROM attendance_logs l LEFT JOIN biometric_users u ON l.user_id=u.user_id WHERE l.check_time >= ? AND l.check_time <= ?";

    // Filters (Simplified for rewrite, functionally identical)
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
    echo json_encode($res);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>