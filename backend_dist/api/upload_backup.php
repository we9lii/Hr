<?php
// upload_backup.php - Upload ZK USB Backup files (user.dat, template.fp10) directly to Server
// This allows restoring data when the device fails to read the USB.

header("Access-Control-Allow-Origin: *");
require_once '../db_connect.php';

$message = "";

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $files = ['user_dat', 'fp_dat'];

    foreach ($files as $fileKey) {
        if (!isset($_FILES[$fileKey]) || $_FILES[$fileKey]['error'] !== UPLOAD_ERR_OK) {
            continue;
        }

        $tmpName = $_FILES[$fileKey]['tmp_name'];
        $content = file_get_contents($tmpName);
        $lines = explode("\n", $content);
        $count = 0;

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line))
                continue;

            // Simple parser for ZK Key=Value format
            // e.g. PIN=1	Name=Admin ...
            $parts = preg_split('/\t/', $line);
            $data = [];
            foreach ($parts as $part) {
                $kv = explode('=', $part, 2);
                if (count($kv) == 2) {
                    $data[$kv[0]] = $kv[1];
                }
            }

            // A. User Data
            if ($fileKey === 'user_dat' && isset($data['PIN'])) {
                try {
                    $stmt = $pdo->prepare("INSERT INTO biometric_users (user_id, name, role, card_number, password, device_sn) 
                                           VALUES (?, ?, ?, ?, ?, 'UPLOAD') 
                                           ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), card_number=VALUES(card_number), password=VALUES(password)");
                    $stmt->execute([
                        $data['PIN'],
                        $data['Name'] ?? 'Unknown',
                        $data['Pri'] ?? 0,
                        $data['Card'] ?? '',
                        $data['Passwd'] ?? ''
                    ]);
                    $count++;
                } catch (Exception $e) {
                }
            }

            // B. Fingerprint Data
            if ($fileKey === 'fp_dat' && isset($data['PIN']) && isset($data['TMP'])) {
                try {
                    $stmt = $pdo->prepare("INSERT INTO fingerprint_templates (user_id, finger_id, template_data, size, device_sn, valid) 
                                           VALUES (?, ?, ?, ?, 'UPLOAD', ?) 
                                           ON DUPLICATE KEY UPDATE template_data=VALUES(template_data), size=VALUES(size), valid=VALUES(valid)");
                    $stmt->execute([
                        $data['PIN'],
                        $data['FID'] ?? 0,
                        $data['TMP'],
                        $data['Size'] ?? strlen($data['TMP']),
                        $data['Valid'] ?? 1
                    ]);
                    $count++;
                } catch (Exception $e) {
                }
            }
        }
        $message .= "Processed " . ($fileKey === 'user_dat' ? "User" : "Fingerprint") . " file: $count records.<br>";
    }
}
?>

<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>رفع بيانات البصمة</title>
    <style>
        body {
            font-family: sans-serif;
            background: #f0f2f5;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }

        .card {
            background: white;
            padding: 2rem;
            border-radius: 1rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 400px;
            text-align: center;
        }

        h2 {
            color: #1a202c;
            margin-bottom: 1.5rem;
        }

        .upload-box {
            border: 2px dashed #cbd5e0;
            border-radius: 0.5rem;
            padding: 1.5rem;
            margin-bottom: 1rem;
            cursor: pointer;
            transition: 0.2s;
        }

        .upload-box:hover {
            border-color: #4299e1;
            background: #ebf8ff;
        }

        input[type="file"] {
            display: none;
        }

        .btn {
            background: #3182ce;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            font-size: 1rem;
        }

        .btn:hover {
            background: #2b6cb0;
        }

        .alert {
            padding: 1rem;
            background: #c6f6d5;
            color: #22543d;
            border-radius: 0.5rem;
            margin-bottom: 1rem;
        }

        label {
            display: block;
            color: #4a5568;
            margin-bottom: 0.5rem;
            font-weight: bold;
        }
    </style>
</head>

<body>
    <div class="card">
        <h2>📂 رفع النسخة الاحتياطية</h2>

        <?php if ($message): ?>
            <div class="alert">
                <?php echo $message; ?>
            </div>
        <?php endif; ?>

        <form method="POST" enctype="multipart/form-data">
            <div>
                <label>ملف المستخدمين (user.dat)</label>
                <div class="upload-box" onclick="document.getElementById('u').click()">
                    <span id="u-txt">اختر الملف...</span>
                    <input type="file" id="u" name="user_dat"
                        onchange="document.getElementById('u-txt').innerText = this.files[0].name" accept=".dat">
                </div>
            </div>

            <div>
                <label>ملف البصمات (template.fp10)</label>
                <div class="upload-box" onclick="document.getElementById('f').click()">
                    <span id="f-txt">اختر الملف...</span>
                    <input type="file" id="f" name="fp_dat"
                        onchange="document.getElementById('f-txt').innerText = this.files[0].name" accept=".fp10,.dat">
                </div>
            </div>

            <button type="submit" class="btn">🚀 رفع ومعالجة</button>
        </form>
        <p style="margin-top: 1rem; color: #718096; font-size: 0.875rem;">
            بعد الرفع، استخدم أداة Dispatch في الدليل لإرسال البيانات للجهاز الجديد.
        </p>
    </div>
</body>

</html>