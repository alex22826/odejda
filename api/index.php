<?php
/*
 * API магазина odejda — один файл без зависимостей, совместим с PHP 5.6+.
 *
 * Данные хранятся в JSON-файлах в /storage (закрыта от браузера через .htaccess),
 * загруженные фото — в /uploads. Если storage пуст, каталог и настройки берутся
 * из assets/data/*.json (то же, что видит статическая версия сайта).
 *
 * Вызов: api/index.php?action=products.list
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

define('ROOT', dirname(__DIR__));
define('STORAGE', ROOT . '/storage');
define('UPLOADS', ROOT . '/uploads');
define('SEED', ROOT . '/assets/data');
define('SESSION_NAME', 'odj_admin');
define('SESSION_HOURS', 12);
define('MAX_UPLOAD', 8 * 1024 * 1024);

// Учётка по умолчанию — действует, пока в storage/accounts.json никого нет.
// Пароль лежит в ADMIN-ACCESS.txt (не в git). При первом входе хеш заменится на bcrypt.
$DEFAULT_ACCOUNTS = [
    [
        'login' => 'admin',
        'name' => 'Администратор',
        'role' => 'owner',
        'hash' => 'sha256:88b492d31d7696821b97c23f2fb6ffc647757ea35499953aaafa252f18cefa2e',
    ],
];

$CATEGORIES = ['women', 'men', 'shoes', 'accessories'];
$LINKS = ['all', 'women', 'men', 'shoes', 'accessories', 'new', 'sale', 'look'];
$ORDER_STATUSES = ['new', 'work', 'done', 'cancel'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/* ---------- ответы и ввод ---------- */

function out($data)
{
    $data['ok'] = true;
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail($message, $code = 400)
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function body()
{
    static $data = null;
    if ($data === null) {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
        }
    }
    return $data;
}

function get($arr, $key, $default = '')
{
    return is_array($arr) && array_key_exists($key, $arr) ? $arr[$key] : $default;
}

function cut($value, $max)
{
    $value = trim(is_scalar($value) ? (string) $value : '');
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

function ulen($value)
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function rand_bytes($n)
{
    return function_exists('random_bytes') ? random_bytes($n) : openssl_random_pseudo_bytes($n);
}

/* ---------- хранилище ---------- */

function storage_ready()
{
    if (!is_dir(STORAGE)) {
        @mkdir(STORAGE, 0755, true);
    }
    if (!is_dir(STORAGE) || !is_writable(STORAGE)) {
        fail('Папка storage недоступна для записи', 500);
    }
}

// Одна блокировка на запрос: все изменения файлов идут строго по очереди
function lock_storage()
{
    static $handle = null;
    if ($handle === null) {
        storage_ready();
        $handle = fopen(STORAGE . '/.lock', 'c');
        flock($handle, LOCK_EX);
    }
}

function decode_file($file)
{
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

// файл из storage; если его ещё нет — стартовые данные из assets/data
function read_json($name, $seed = null)
{
    $data = decode_file(STORAGE . '/' . $name . '.json');
    if ($data === null && $seed !== null) {
        $data = decode_file(SEED . '/' . $seed . '.json');
    }
    return $data === null ? [] : $data;
}

function write_json($name, $data)
{
    storage_ready();
    $file = STORAGE . '/' . $name . '.json';
    $tmp = $file . '.' . bin2hex(rand_bytes(4)) . '.tmp';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false || file_put_contents($tmp, $json) === false) {
        fail('Не удалось сохранить данные', 500);
    }
    rename($tmp, $file); // атомарная замена: читатель никогда не увидит полузаписанный файл
}

function load_settings()
{
    $seed = decode_file(SEED . '/settings.json');
    return array_merge($seed === null ? [] : $seed, read_json('settings'));
}

/* ---------- защита от перебора ---------- */

function client_ip()
{
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0';
}

function throttle_check($bucket, $limit, $window)
{
    lock_storage();
    $all = read_json('throttle');
    $key = $bucket . ':' . client_ip();
    $now = time();
    $recent = 0;
    if (isset($all[$key])) {
        foreach ($all[$key] as $t) {
            if ($t > $now - $window) {
                $recent++;
            }
        }
    }
    if ($recent >= $limit) {
        fail('Слишком много попыток. Подождите несколько минут.', 429);
    }
}

function throttle_hit($bucket)
{
    lock_storage();
    $all = read_json('throttle');
    $now = time();
    foreach ($all as $k => $times) {
        $all[$k] = array_values(array_filter($times, function ($t) use ($now) {
            return $t > $now - 3600;
        }));
        if (!$all[$k]) {
            unset($all[$k]);
        }
    }
    $all[$bucket . ':' . client_ip()][] = $now;
    write_json('throttle', $all);
}

/* ---------- учётки и сессии ---------- */

function accounts()
{
    global $DEFAULT_ACCOUNTS;
    $list = read_json('accounts');
    return $list ? $list : $DEFAULT_ACCOUNTS;
}

function find_account($login)
{
    foreach (accounts() as $acc) {
        if (strtolower($acc['login']) === strtolower(trim((string) $login))) {
            return $acc;
        }
    }
    return null;
}

function public_user($acc)
{
    return ['login' => $acc['login'], 'name' => $acc['name'], 'role' => $acc['role']];
}

function check_password($password, $hash)
{
    if (strpos($hash, 'sha256:') === 0) {
        return hash_equals(substr($hash, 7), hash('sha256', (string) $password));
    }
    return password_verify((string) $password, $hash);
}

function owners_left($list)
{
    foreach ($list as $acc) {
        if ($acc['role'] === 'owner') {
            return true;
        }
    }
    return false;
}

function session_begin()
{
    if (session_id() !== '') {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    session_name(SESSION_NAME);
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    } else {
        session_set_cookie_params(0, '/; samesite=Lax', '', $https, true);
    }
    session_start();
}

function current_user()
{
    // покупателям сессия не нужна — не создаём её, пока нет cookie
    if (empty($_COOKIE[SESSION_NAME])) {
        return null;
    }
    session_begin();
    if (empty($_SESSION['login']) || empty($_SESSION['time']) || time() - $_SESSION['time'] > SESSION_HOURS * 3600) {
        return null;
    }
    $acc = find_account($_SESSION['login']);
    return $acc ? public_user($acc) : null;
}

function require_user($role = null)
{
    $user = current_user();
    if (!$user) {
        fail('Сессия истекла — войдите заново', 401);
    }
    if ($role && $user['role'] !== $role) {
        fail('Недостаточно прав', 403);
    }
    return $user;
}

/* ---------- проверка данных ---------- */

function clean_id($value)
{
    $value = (string) $value;
    return preg_match('/^[a-zA-Z0-9-]{1,40}$/', $value) ? $value : '';
}

// разрешены только свои пути и обычные ссылки — никаких javascript: и data:
function clean_src($value)
{
    $value = trim((string) $value);
    if ($value === '' || strlen($value) > 1000) {
        return '';
    }
    return preg_match('~^(https?://|uploads/|assets/)~i', $value) ? $value : '';
}

function clean_link($value)
{
    global $LINKS;
    return in_array($value, $LINKS, true) ? $value : 'all';
}

function clean_product($p)
{
    global $CATEGORIES;
    if (!is_array($p)) {
        fail('Нет данных товара');
    }
    $title = cut(get($p, 'title'), 120);
    $price = (int) round((float) get($p, 'price', 0));
    if (ulen($title) < 2) {
        fail('Введите название товара');
    }
    if ($price <= 0) {
        fail('Укажите цену');
    }
    $old = get($p, 'oldPrice', null);
    $old = $old === null || $old === '' ? null : (int) round((float) $old);
    $stock = get($p, 'stock', null);
    $stock = $stock === null || $stock === '' ? null : max(0, (int) $stock);

    $images = [];
    foreach ((array) get($p, 'images', []) as $src) {
        $src = clean_src($src);
        if ($src !== '' && count($images) < 12) {
            $images[] = $src;
        }
    }
    $sizes = [];
    foreach ((array) get($p, 'sizes', []) as $size) {
        $size = cut($size, 20);
        if ($size !== '' && !in_array($size, $sizes, true) && count($sizes) < 24) {
            $sizes[] = $size;
        }
    }
    $colors = [];
    foreach ((array) get($p, 'colors', []) as $c) {
        $name = cut(get($c, 'name'), 40);
        $hex = (string) get($c, 'hex');
        if ($name !== '' && count($colors) < 12) {
            $colors[] = ['name' => $name, 'hex' => preg_match('/^#[0-9a-fA-F]{3,8}$/', $hex) ? $hex : '#cccccc'];
        }
    }
    $id = clean_id(get($p, 'id'));
    $created = (string) get($p, 'createdAt');

    return [
        'id' => $id !== '' ? $id : 'p-' . base_convert((string) time(), 10, 36) . bin2hex(rand_bytes(2)),
        'title' => $title,
        'category' => in_array(get($p, 'category'), $CATEGORIES, true) ? get($p, 'category') : 'women',
        'price' => $price,
        'oldPrice' => $old !== null && $old > $price ? $old : null,
        'images' => $images,
        'sizes' => $sizes,
        'colors' => $colors,
        'description' => cut(get($p, 'description'), 2000),
        'stock' => $stock,
        'isNew' => (bool) get($p, 'isNew', false),
        'isHit' => (bool) get($p, 'isHit', false),
        'visible' => get($p, 'visible', true) !== false,
        'createdAt' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $created) ? $created : date('Y-m-d'),
    ];
}

function clean_settings($s, $current)
{
    if (!is_array($s)) {
        fail('Нет данных настроек');
    }
    $strings = [
        'storeName' => 60, 'announcement' => 200, 'phone' => 40, 'email' => 120, 'address' => 200,
        'hours' => 120, 'telegram' => 64, 'instagram' => 64, 'whatsapp' => 32,
    ];
    foreach ($strings as $key => $max) {
        if (array_key_exists($key, $s)) {
            $current[$key] = cut($s[$key], $max);
        }
    }
    foreach (['freeShippingFrom', 'deliveryPrice'] as $key) {
        if (array_key_exists($key, $s)) {
            $current[$key] = max(0, (int) $s[$key]);
        }
    }
    foreach (['mapLat', 'mapLon'] as $key) {
        if (array_key_exists($key, $s)) {
            $current[$key] = is_numeric($s[$key]) ? (float) $s[$key] : '';
        }
    }
    if (isset($s['hero']) && is_array($s['hero'])) {
        $hero = [];
        foreach (array_slice($s['hero'], 0, 5) as $h) {
            if (!is_array($h)) {
                continue;
            }
            $hero[] = [
                'eyebrow' => cut(get($h, 'eyebrow'), 80),
                'title' => cut(get($h, 'title'), 120),
                'text' => cut(get($h, 'text'), 300),
                'image' => clean_src(get($h, 'image')),
                'button' => cut(get($h, 'button'), 40),
                'link' => clean_link(get($h, 'link')),
                'productId' => clean_id(get($h, 'productId')),
            ];
        }
        $current['hero'] = $hero;
    }
    if (isset($s['promo']) && is_array($s['promo'])) {
        $p = $s['promo'];
        $ends = (string) get($p, 'endsAt');
        $current['promo'] = [
            'eyebrow' => cut(get($p, 'eyebrow'), 80),
            'title' => cut(get($p, 'title'), 120),
            'text' => cut(get($p, 'text'), 300),
            'endsAt' => preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $ends) ? substr($ends, 0, 16) : '',
            'image' => clean_src(get($p, 'image')),
            'link' => clean_link(get($p, 'link')),
        ];
    }
    if (isset($s['look']) && is_array($s['look'])) {
        $l = $s['look'];
        $spots = [];
        foreach (array_slice((array) get($l, 'spots', []), 0, 12) as $spot) {
            $spots[] = [
                'x' => max(0, min(100, (float) get($spot, 'x', 50))),
                'y' => max(0, min(100, (float) get($spot, 'y', 50))),
                'productId' => clean_id(get($spot, 'productId')),
            ];
        }
        $current['look'] = [
            'title' => cut(get($l, 'title'), 120),
            'text' => cut(get($l, 'text'), 400),
            'image' => clean_src(get($l, 'image')),
            'spots' => $spots,
        ];
    }
    return $current;
}

/* ==========================================================================
   Маршруты
   ========================================================================== */

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$reads = ['ping', 'products.list', 'settings.get', 'auth.me', 'orders.list', 'accounts.list'];

if (!in_array($action, $reads, true)) {
    // запись — только POST со своим заголовком: чужой сайт не сможет отправить такой запрос от имени админа
    if ($method !== 'POST') {
        fail('Метод не поддерживается', 405);
    }
    if (!isset($_SERVER['HTTP_X_REQUESTED_WITH']) || $_SERVER['HTTP_X_REQUESTED_WITH'] !== 'odejda') {
        fail('Запрос отклонён', 403);
    }
}

$b = body();

switch ($action) {
    case 'ping':
        out(['mode' => 'api']);

    /* --- товары --- */

    case 'products.list':
        $list = read_json('products', 'products');
        if (!current_user()) {
            $list = array_values(array_filter($list, function ($p) {
                return !isset($p['visible']) || $p['visible'] !== false;
            }));
        }
        out(['products' => $list]);

    case 'products.save':
        require_user();
        lock_storage();
        $product = clean_product(get($b, 'product', null));
        $list = read_json('products', 'products');
        $found = false;
        foreach ($list as $i => $p) {
            if ($p['id'] === $product['id']) {
                $product['createdAt'] = isset($p['createdAt']) ? $p['createdAt'] : $product['createdAt'];
                $list[$i] = $product;
                $found = true;
            }
        }
        if (!$found) {
            array_unshift($list, $product);
        }
        write_json('products', $list);
        out(['product' => $product]);

    case 'products.delete':
        require_user();
        lock_storage();
        $id = (string) get($b, 'id');
        $list = array_values(array_filter(read_json('products', 'products'), function ($p) use ($id) {
            return $p['id'] !== $id;
        }));
        write_json('products', $list);
        out([]);

    case 'upload':
        require_user();
        if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            fail('Файл не получен — возможно, он слишком большой');
        }
        $file = $_FILES['file'];
        if ($file['size'] > MAX_UPLOAD) {
            fail('Файл больше 8 МБ');
        }
        // тип определяем по содержимому, а не по имени файла
        $head = (string) file_get_contents($file['tmp_name'], false, null, 0, 16);
        $ext = null;
        if (substr($head, 0, 3) === "\xFF\xD8\xFF") {
            $ext = 'jpg';
        } elseif (substr($head, 0, 8) === "\x89PNG\r\n\x1a\n") {
            $ext = 'png';
        } elseif (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP') {
            $ext = 'webp';
        } elseif (substr($head, 0, 4) === 'GIF8') {
            $ext = 'gif';
        }
        if (!$ext) {
            fail('Поддерживаются JPG, PNG, WebP и GIF');
        }
        if (!is_dir(UPLOADS)) {
            @mkdir(UPLOADS, 0755, true);
        }
        $name = date('Ymd') . '-' . bin2hex(rand_bytes(6)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], UPLOADS . '/' . $name)) {
            fail('Не удалось сохранить файл', 500);
        }
        out(['url' => 'uploads/' . $name]);

    /* --- настройки --- */

    case 'settings.get':
        out(['settings' => load_settings()]);

    case 'settings.save':
        require_user();
        lock_storage();
        $settings = clean_settings(get($b, 'settings', null), load_settings());
        write_json('settings', $settings);
        out(['settings' => $settings]);

    /* --- заказы --- */

    case 'orders.create':
        $o = get($b, 'order', null);
        if (!is_array($o)) {
            fail('Пустой заказ');
        }
        if (get($o, 'website') !== '') {
            out(['order' => ['number' => 0]]); // ловушка для ботов: поле скрыто от людей
        }
        throttle_check('order', 5, 600);
        $c = get($o, 'customer', []);
        $name = cut(get($c, 'name'), 80);
        $phone = cut(get($c, 'phone'), 30);
        $delivery = get($c, 'delivery') === 'pickup' ? 'pickup' : 'courier';
        $address = $delivery === 'pickup' ? '' : cut(get($c, 'address'), 300);
        if (ulen($name) < 2) {
            fail('Укажите имя');
        }
        if (strlen(preg_replace('/\D/', '', $phone)) < 9) {
            fail('Укажите телефон');
        }
        if ($delivery === 'courier' && ulen($address) < 5) {
            fail('Укажите адрес доставки');
        }

        // цены и наличие пересчитываем по каталогу — данным из браузера не доверяем
        $catalog = [];
        foreach (read_json('products', 'products') as $p) {
            $catalog[$p['id']] = $p;
        }
        $items = [];
        $subtotal = 0;
        foreach (array_slice((array) get($o, 'items', []), 0, 50) as $it) {
            $id = (string) get($it, 'id');
            if (!isset($catalog[$id])) {
                continue;
            }
            $p = $catalog[$id];
            if ((isset($p['visible']) && $p['visible'] === false) || (isset($p['stock']) && $p['stock'] !== null && $p['stock'] <= 0)) {
                continue;
            }
            $qty = max(1, min(20, (int) get($it, 'qty', 1)));
            $items[] = [
                'id' => $id,
                'title' => $p['title'],
                'size' => cut(get($it, 'size'), 20),
                'color' => cut(get($it, 'color'), 40),
                'qty' => $qty,
                'price' => (int) $p['price'],
            ];
            $subtotal += (int) $p['price'] * $qty;
        }
        if (!$items) {
            fail('Товары из корзины закончились — обновите страницу');
        }
        $settings = load_settings();
        $free = (int) get($settings, 'freeShippingFrom', 0);
        $fee = (int) get($settings, 'deliveryPrice', 0);
        $shipping = $delivery === 'pickup' || ($free && $subtotal >= $free) ? 0 : $fee;

        lock_storage();
        $meta = read_json('meta');
        $number = isset($meta['lastOrder']) ? (int) $meta['lastOrder'] + 1 : 1001;
        $order = [
            'id' => 'o-' . bin2hex(rand_bytes(6)),
            'number' => $number,
            'status' => 'new',
            'createdAt' => gmdate('c'),
            'customer' => [
                'name' => $name,
                'phone' => $phone,
                'delivery' => $delivery,
                'address' => $address,
                'comment' => cut(get($c, 'comment'), 500),
            ],
            'items' => $items,
            'subtotal' => $subtotal,
            'shipping' => $shipping,
            'total' => $subtotal + $shipping,
        ];
        $orders = read_json('orders');
        array_unshift($orders, $order);
        write_json('orders', array_slice($orders, 0, 5000));
        $meta['lastOrder'] = $number;
        write_json('meta', $meta);
        throttle_hit('order');
        out(['order' => ['number' => $number, 'total' => $order['total']]]);

    case 'orders.list':
        require_user();
        out(['orders' => read_json('orders')]);

    case 'orders.status':
        require_user();
        lock_storage();
        $id = (string) get($b, 'id');
        $status = (string) get($b, 'status');
        if (!in_array($status, $ORDER_STATUSES, true)) {
            fail('Неизвестный статус');
        }
        $orders = read_json('orders');
        foreach ($orders as $i => $o) {
            if ($o['id'] === $id) {
                $orders[$i]['status'] = $status;
            }
        }
        write_json('orders', $orders);
        out([]);

    /* --- вход --- */

    case 'auth.login':
        throttle_check('login', 6, 600);
        $acc = find_account(get($b, 'login'));
        if (!$acc || !check_password(get($b, 'password'), $acc['hash'])) {
            throttle_hit('login');
            fail('Неверный логин или пароль', 403);
        }
        if (strpos($acc['hash'], 'sha256:') === 0) {
            // переводим учётку по умолчанию на bcrypt
            lock_storage();
            $list = accounts();
            foreach ($list as $i => $a) {
                if ($a['login'] === $acc['login']) {
                    $list[$i]['hash'] = password_hash((string) get($b, 'password'), PASSWORD_DEFAULT);
                }
            }
            write_json('accounts', $list);
        }
        session_begin();
        session_regenerate_id(true);
        $_SESSION['login'] = $acc['login'];
        $_SESSION['time'] = time();
        out(['user' => public_user($acc)]);

    case 'auth.me':
        out(['user' => current_user()]);

    case 'auth.logout':
        if (!empty($_COOKIE[SESSION_NAME])) {
            session_begin();
            $_SESSION = [];
            session_destroy();
            setcookie(SESSION_NAME, '', time() - 3600, '/');
        }
        out([]);

    case 'auth.password':
        $user = require_user();
        lock_storage();
        $new = (string) get($b, 'newPassword');
        if (strlen($new) < 8) {
            fail('Новый пароль — минимум 8 символов');
        }
        $list = accounts();
        foreach ($list as $i => $a) {
            if ($a['login'] === $user['login']) {
                if (!check_password(get($b, 'oldPassword'), $a['hash'])) {
                    fail('Текущий пароль указан неверно', 403);
                }
                $list[$i]['hash'] = password_hash($new, PASSWORD_DEFAULT);
            }
        }
        write_json('accounts', $list);
        out([]);

    /* --- доступы (только владелец) --- */

    case 'accounts.list':
        require_user('owner');
        out(['accounts' => array_map('public_user', accounts())]);

    case 'accounts.save':
        require_user('owner');
        lock_storage();
        $a = get($b, 'account', []);
        $login = trim((string) get($a, 'login'));
        if (!preg_match('/^[a-zA-Z0-9._-]{3,32}$/', $login)) {
            fail('Логин: 3–32 символа, латиница, цифры, . _ -');
        }
        $password = (string) get($a, 'password');
        if ($password !== '' && strlen($password) < 8) {
            fail('Пароль — минимум 8 символов');
        }
        $list = accounts();
        $index = null;
        foreach ($list as $i => $acc) {
            if (strtolower($acc['login']) === strtolower($login)) {
                $index = $i;
            }
        }
        if ($index === null) {
            if ($password === '') {
                fail('Для новой учётки нужен пароль');
            }
            $list[] = ['login' => $login, 'name' => '', 'role' => 'manager', 'hash' => ''];
            $index = count($list) - 1;
        }
        $list[$index]['name'] = cut(get($a, 'name', $login), 60);
        $list[$index]['role'] = get($a, 'role') === 'owner' ? 'owner' : 'manager';
        if ($password !== '') {
            $list[$index]['hash'] = password_hash($password, PASSWORD_DEFAULT);
        }
        if (!owners_left($list)) {
            fail('Должен остаться хотя бы один владелец');
        }
        write_json('accounts', $list);
        out([]);

    case 'accounts.delete':
        $user = require_user('owner');
        lock_storage();
        $login = (string) get($b, 'login');
        if (strtolower($login) === strtolower($user['login'])) {
            fail('Нельзя удалить самого себя');
        }
        $list = array_values(array_filter(accounts(), function ($acc) use ($login) {
            return strtolower($acc['login']) !== strtolower($login);
        }));
        if (!owners_left($list)) {
            fail('Должен остаться хотя бы один владелец');
        }
        write_json('accounts', $list);
        out([]);

    /* --- резервная копия --- */

    case 'data.import':
        require_user('owner');
        lock_storage();
        $products = get($b, 'products', null);
        if (!is_array($products)) {
            fail('В файле нет списка товаров');
        }
        write_json('products', array_map('clean_product', array_slice($products, 0, 2000)));
        $settings = get($b, 'settings', null);
        if (is_array($settings)) {
            write_json('settings', clean_settings($settings, load_settings()));
        }
        out([]);

    default:
        fail('Неизвестное действие', 404);
}
