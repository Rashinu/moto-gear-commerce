// Alanya Racing Motors - sunucu
// Veri katmanı iki modda çalışır:
//   - DATABASE_URL ayarlıysa: Postgres (örn. Neon.tech ücretsiz plan) - kalıcı, restart'ta silinmez
//   - ayarlı değilse: yerel JSON dosyası (data/db.json) - basit, kurulum gerektirmez ama
//     Render gibi ücretsiz/ephemeral disk barındırıcılarda restart'ta sıfırlanabilir
// Görsel yükleme de iki modda çalışır:
//   - CLOUDINARY_* ayarlıysa: Cloudinary (kalıcı, bulut depolama)
//   - ayarlı değilse: yerel disk (public/uploads) - aynı ephemeral disk kısıtı geçerli

const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- mod tespiti ----------
const DATABASE_URL = process.env.DATABASE_URL || null;
const USE_DB = !!DATABASE_URL;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || null;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || null;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || null;
const USE_CLOUDINARY = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

let cloudinary = null;
if (USE_CLOUDINARY) {
  cloudinary = require("cloudinary").v2;
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
  });
}

// Bundled seed data (always ships in the repo, used to initialize a fresh disk or a fresh DB)
const BUNDLED_SEED_FILE = path.join(__dirname, "data", "db.json");
const DEFAULT_PASSWORD = "alanya2026";

// If DATA_DIR is set (e.g. a Render Persistent Disk mount path), store the JSON-file
// fallback there instead of inside the repo checkout, so it survives deploys/restarts.
// (Only relevant when USE_DB is false — if a real DB is configured, this path is unused.)
const DATA_ROOT = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_ROOT, "db.json");
const AUTH_FILE = path.join(DATA_ROOT, "auth.json");
const UPLOAD_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, "uploads")
  : path.join(__dirname, "public", "uploads");

if (!USE_DB) {
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
  if (process.env.DATA_DIR && !fs.existsSync(DATA_FILE) && fs.existsSync(BUNDLED_SEED_FILE)) {
    fs.copyFileSync(BUNDLED_SEED_FILE, DATA_FILE);
    console.log("Persistent disk had no data yet — seeded from bundled data/db.json");
  }
}
if (!USE_CLOUDINARY) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------- Postgres bağlantısı (varsa) ----------
let pool = null;
if (USE_DB) {
  const { Pool } = require("pg");
  const isLocalHost = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isLocalHost ? false : { rejectUnauthorized: false },
    max: 3
  });
  pool.on("error", (err) => console.error("Postgres pool error:", err.message));
}

async function initStorage() {
  if (!USE_DB) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store (
      id INT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_config (
      id INT PRIMARY KEY,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL
    )
  `);

  const storeRow = await pool.query("SELECT 1 FROM store WHERE id = 1");
  if (storeRow.rowCount === 0) {
    const seed = JSON.parse(fs.readFileSync(BUNDLED_SEED_FILE, "utf-8"));
    await pool.query("INSERT INTO store (id, data) VALUES (1, $1)", [JSON.stringify(seed)]);
    console.log("Postgres store was empty — seeded from bundled data/db.json");
  }

  const authRow = await pool.query("SELECT 1 FROM auth_config WHERE id = 1");
  if (authRow.rowCount === 0) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(DEFAULT_PASSWORD, salt);
    await pool.query("INSERT INTO auth_config (id, salt, hash) VALUES (1, $1, $2)", [salt, hash]);
    printDefaultPasswordNotice();
  }
}

// ---------- basit parola hash (scrypt) ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function printDefaultPasswordNotice() {
  console.log("=".repeat(60));
  console.log("İlk çalıştırma: admin şifresi otomatik oluşturuldu.");
  console.log(`Varsayılan şifre: ${DEFAULT_PASSWORD}`);
  console.log("Lütfen admin panelinden giriş yaptıktan sonra bu şifreyi değiştirin.");
  console.log("=".repeat(60));
}
function ensureAuthFileLocal() {
  if (!fs.existsSync(AUTH_FILE)) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(DEFAULT_PASSWORD, salt);
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash }, null, 2));
    printDefaultPasswordNotice();
  }
}
if (!USE_DB) ensureAuthFileLocal();

async function checkPassword(password) {
  if (USE_DB) {
    const { rows } = await pool.query("SELECT salt, hash FROM auth_config WHERE id = 1");
    if (rows.length === 0) return false;
    return hashPassword(password, rows[0].salt) === rows[0].hash;
  }
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
  return hashPassword(password, auth.salt) === auth.hash;
}
async function setPassword(newPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(newPassword, salt);
  if (USE_DB) {
    await pool.query("UPDATE auth_config SET salt = $1, hash = $2 WHERE id = 1", [salt, hash]);
    return;
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash }, null, 2));
}

// ---------- oturumlar (bellekte) ----------
const sessions = new Map(); // token -> expiry timestamp
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}
function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  const expiry = sessions.get(token);
  if (Date.now() > expiry) { sessions.delete(token); return false; }
  return true;
}
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.arm_session;
  if (!isValidSession(token)) {
    return res.status(401).json({ error: "Yetkisiz. Lütfen giriş yapın." });
  }
  next();
}

// ---------- veri okuma/yazma (Postgres ya da JSON dosyası) ----------
async function readDB() {
  if (USE_DB) {
    const { rows } = await pool.query("SELECT data FROM store WHERE id = 1");
    return rows[0].data;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}
async function writeDB(db) {
  if (USE_DB) {
    await pool.query("UPDATE store SET data = $1 WHERE id = 1", [JSON.stringify(db)]);
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
function asyncRoute(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Sunucu hatası: " + err.message });
    });
  };
}

// ---------- middleware ----------
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
if (!USE_CLOUDINARY) {
  app.use("/uploads", express.static(UPLOAD_DIR));
}
app.use(express.static(path.join(__dirname, "public")));

// Görsel yükleme: Cloudinary varsa bellekte tut ve buluta gönder, yoksa diske yaz
const upload = USE_CLOUDINARY
  ? multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
        cb(ok ? null : new Error("Sadece resim dosyaları yüklenebilir (jpg, png, webp, gif)."), ok);
      }
    })
  : multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
        }
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
        cb(ok ? null : new Error("Sadece resim dosyaları yüklenebilir (jpg, png, webp, gif)."), ok);
      }
    });

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "arm-uploads", resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    Readable.from(buffer).pipe(stream);
  });
}

// =================== PUBLIC API (vitrin) ===================

app.get("/api/storefront", asyncRoute(async (req, res) => {
  const db = await readDB();
  const categories = [...db.categories].sort((a, b) => a.order - b.order);
  const products = [...db.products].sort((a, b) => a.order - b.order);
  res.json({ settings: db.settings, categories, products });
}));

// =================== AUTH ===================

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { password } = req.body || {};
  if (!password || !(await checkPassword(password))) {
    return res.status(401).json({ error: "Şifre yanlış." });
  }
  const token = createSession();
  res.cookie("arm_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS
  });
  res.json({ ok: true });
}));

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies && req.cookies.arm_session;
  if (token) sessions.delete(token);
  res.clearCookie("arm_session");
  res.json({ ok: true });
});

app.get("/api/auth/check", (req, res) => {
  const token = req.cookies && req.cookies.arm_session;
  res.json({ authenticated: isValidSession(token) });
});

app.post("/api/auth/change-password", requireAuth, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !(await checkPassword(currentPassword))) {
    return res.status(401).json({ error: "Mevcut şifre yanlış." });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Yeni şifre en az 6 karakter olmalı." });
  }
  await setPassword(newPassword);
  res.json({ ok: true });
}));

// =================== ADMIN: ÜRÜNLER ===================

app.get("/api/admin/products", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  res.json([...db.products].sort((a, b) => a.order - b.order));
}));

app.post("/api/admin/products", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const body = req.body || {};
  if (!body.name || !body.category) {
    return res.status(400).json({ error: "Ürün adı ve kategori zorunludur." });
  }
  const maxOrder = db.products.reduce((m, p) => Math.max(m, p.order || 0), 0);
  const product = {
    id: genId("p"),
    name: body.name,
    category: body.category,
    price: Number(body.price) || 0,
    oldPrice: body.oldPrice ? Number(body.oldPrice) : null,
    badge: body.badge || null,
    stock: Number(body.stock) || 0,
    img: body.img || "https://placehold.co/500x500/1a1a1a/e6b800?text=Urun",
    order: maxOrder + 1
  };
  db.products.push(product);
  await writeDB(db);
  res.status(201).json(product);
}));

app.put("/api/admin/products/:id", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const idx = db.products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Ürün bulunamadı." });
  const body = req.body || {};
  const existing = db.products[idx];
  db.products[idx] = {
    ...existing,
    name: body.name ?? existing.name,
    category: body.category ?? existing.category,
    price: body.price !== undefined ? Number(body.price) : existing.price,
    oldPrice: body.oldPrice !== undefined ? (body.oldPrice === null || body.oldPrice === "" ? null : Number(body.oldPrice)) : existing.oldPrice,
    badge: body.badge !== undefined ? (body.badge || null) : existing.badge,
    stock: body.stock !== undefined ? Number(body.stock) : existing.stock,
    img: body.img ?? existing.img
  };
  await writeDB(db);
  res.json(db.products[idx]);
}));

app.delete("/api/admin/products/:id", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const before = db.products.length;
  db.products = db.products.filter(p => p.id !== req.params.id);
  if (db.products.length === before) return res.status(404).json({ error: "Ürün bulunamadı." });
  await writeDB(db);
  res.json({ ok: true });
}));

// Sıralama: body = { order: ["p-3","p-1","p-2", ...] } (id listesi, yeni sıraya göre)
app.put("/api/admin/products/reorder/all", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const orderList = (req.body && req.body.order) || [];
  orderList.forEach((id, i) => {
    const p = db.products.find(x => x.id === id);
    if (p) p.order = i + 1;
  });
  await writeDB(db);
  res.json({ ok: true });
}));

// =================== ADMIN: KATEGORİLER ===================

app.get("/api/admin/categories", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  res.json([...db.categories].sort((a, b) => a.order - b.order));
}));

app.post("/api/admin/categories", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const name = (req.body && req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Kategori adı zorunludur." });
  if (db.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: "Bu kategori zaten var." });
  }
  const maxOrder = db.categories.reduce((m, c) => Math.max(m, c.order || 0), 0);
  const category = { id: genId("cat"), name, order: maxOrder + 1 };
  db.categories.push(category);
  await writeDB(db);
  res.status(201).json(category);
}));

app.put("/api/admin/categories/:id", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cat = db.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: "Kategori bulunamadı." });
  const newName = (req.body && req.body.name || "").trim();
  if (!newName) return res.status(400).json({ error: "Kategori adı boş olamaz." });
  const oldName = cat.name;
  cat.name = newName;
  db.products.forEach(p => { if (p.category === oldName) p.category = newName; });
  await writeDB(db);
  res.json(cat);
}));

app.delete("/api/admin/categories/:id", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cat = db.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: "Kategori bulunamadı." });
  const affected = db.products.filter(p => p.category === cat.name).length;
  if (affected > 0 && req.query.force !== "true") {
    return res.status(409).json({
      error: `Bu kategoride ${affected} ürün var. Silmek için force=true gönderin (ürünler "Kategorisiz" olarak işaretlenecek).`,
      affected
    });
  }
  db.products.forEach(p => { if (p.category === cat.name) p.category = "Kategorisiz"; });
  db.categories = db.categories.filter(c => c.id !== cat.id);
  await writeDB(db);
  res.json({ ok: true });
}));

app.put("/api/admin/categories/reorder/all", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  const orderList = (req.body && req.body.order) || [];
  orderList.forEach((id, i) => {
    const c = db.categories.find(x => x.id === id);
    if (c) c.order = i + 1;
  });
  await writeDB(db);
  res.json({ ok: true });
}));

// =================== ADMIN: AYARLAR (banner, iletişim) ===================

app.get("/api/admin/settings", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  res.json(db.settings);
}));

app.put("/api/admin/settings", requireAuth, asyncRoute(async (req, res) => {
  const db = await readDB();
  db.settings = { ...db.settings, ...req.body };
  await writeDB(db);
  res.json(db.settings);
}));

// =================== ADMIN: GÖRSEL YÜKLEME ===================

app.post("/api/admin/upload", requireAuth, (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Dosya bulunamadı." });

    if (USE_CLOUDINARY) {
      try {
        const result = await uploadToCloudinary(req.file.buffer);
        return res.json({ url: result.secure_url });
      } catch (e) {
        return res.status(500).json({ error: "Cloudinary yükleme hatası: " + e.message });
      }
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// =================== BAŞLAT ===================

initStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Alanya Racing Motors sunucusu çalışıyor: http://localhost:${PORT}`);
      console.log(`Admin paneli: http://localhost:${PORT}/admin.html`);
      console.log(`Veri katmanı: ${USE_DB ? "Postgres (kalıcı)" : "yerel JSON dosyası"}`);
      console.log(`Görsel deposu: ${USE_CLOUDINARY ? "Cloudinary (kalıcı)" : "yerel disk"}`);
    });
  })
  .catch((err) => {
    console.error("Başlatma hatası:", err.message);
    process.exit(1);
  });
