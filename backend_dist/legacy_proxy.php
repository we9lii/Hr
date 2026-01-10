<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Target Legacy Server Base URL
$legacy_base = "http://qssun.dyndns.org:8085";

// Get requested path from query param, e.g. ?path=/api-token-auth/
$path = isset($_GET['path']) ? $_GET['path'] : '';

if (empty($path)) {
    http_response_code(400);
    echo json_encode(["error" => "No path provided"]);
    exit;
}

// Construct Full URL
$url = rtrim($legacy_base, '/') . '/' . ltrim($path, '/');

// Initialize cURL
$ch = curl_init($url);

// Forward Method
$method = $_SERVER['REQUEST_METHOD'];
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

// Forward Headers (ignoring Host and Content-Length to let cURL handle them)
$request_headers = getallheaders();
$headers_to_send = [];
foreach ($request_headers as $key => $value) {
    if (strtolower($key) !== 'host' && strtolower($key) !== 'content-length' && strtolower($key) !== 'origin' && strtolower($key) !== 'referer') {
        $headers_to_send[] = "$key: $value";
    }
}
// Add standard content type if missing
$headers_to_send[] = "Content-Type: application/json";
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers_to_send);

// Forward Body (if any)
$input = file_get_contents("php://input");
if (!empty($input)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
}

// Return Response
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true); // We want headers to forward status code

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$header_text = substr($response, 0, $header_size);
$body = substr($response, $header_size);

curl_close($ch);

// Set Response Code
http_response_code($http_code);
echo $body;
?>