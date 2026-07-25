// Alanya Racing Motors - basit sunucu
// Statik vitrin + JSON dosya "veritabanı" + şifre korumalı admin API

const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "data", "db.json");
const AUTH_FILE = path.join(__dirname, "data", "auth.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const DEFAULT_PASSWORD = "alanya2026";

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- basit parola hash (scrypt) ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function ensureAuthFile() {
  if (!fs.existsSync(AUTH_FILE)) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(DEFAULT_PASSWORD, salt);
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash }, null, 2));
    console.log("=".repeat(60));
    console.log("İlk çalıştırma: admin şifresi otomatik oluşturuldu.");
    console.log(`Varsayılan şifre: ${DEFAULT_PASSWORD}`);
    console.log("Lütfen admin panelinden giriş yaptıktan sonra bu şifreyi değiştirin.");
    console.log("=".repeat(60));
  }
}
ensureAuthFile();

function checkPassword(password) {
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
  const hash = hashPassword(password, auth.salt);
  return hash === auth.hash;
}
function setPassword(newPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(newPassword, salt);
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

// ---------- veri okuma/yazma ----------
function readDB() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}
function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---------- middleware ----------
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
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

// =================== PUBLIC API (vitrin) ===================

app.get("/api/storefront", (req, res) => {
  const db = readDB();
  const categories = [...db.categories].sort((a, b) => a.order - b.order);
  const products = [...db.products].sort((a, b) => a.order - b.order);
  res.json({ settings: db.settings, categories, products });
});

// =================== AUTH ===================

app.post("/api/auth/login", (req, res) => {
  const { password } = req.body || {};
  if (!password || !checkPassword(password)) {
    return res.status(401).json({ error: "Şifre yanlış." });
  }
  const token = createSession();
  res.cookie("arm_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS
  });
  res.json({ ok: true });
});

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

app.post("/api/auth/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !checkPassword(currentPassword)) {
    return res.status(401).json({ error: "Mevcut şifre yanlış." });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Yeni şifre en az 6 karakter olmalı." });
  }
  setPassword(newPassword);
  res.json({ ok: true });
});

// =================== ADMIN: ÜRÜNLER ===================

app.get("/api/admin/products", requireAuth, (req, res) => {
  const db = readDB();
  res.json([...db.products].sort((a, b) => a.order - b.order));
});

app.post("/api/admin/products", requireAuth, (req, res) => {
  const db = readDB();
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
  writeDB(db);
  res.status(201).json(product);
});

app.put("/api/admin/products/:id", requireAuth, (req, res) => {
  const db = readDB();
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
  writeDB(db);
  res.json(db.products[idx]);
});

app.delete("/api/admin/products/:id", requireAuth, (req, res) => {
  const db = readDB();
  const before = db.products.length;
  db.products = db.products.filter(p => p.id !== req.params.id);
  if (db.products.length === before) return res.status(404).json({ error: "Ürün bulunamadı." });
  writeDB(db);
  res.json({ ok: true });
});

// Sıralama: body = { order: ["p-3","p-1","p-2", ...] } (id listesi, yeni sıraya göre)
app.put("/api/admin/products/reorder/all", requireAuth, (req, res) => {
  const db = readDB();
  const orderList = (req.body && req.body.order) || [];
  orderList.forEach((id, i) => {
    const p = db.products.find(x => x.id === id);
    if (p) p.order = i + 1;
  });
  writeDB(db);
  res.json({ ok: true });
});

// =================== ADMIN: KATEGORİLER ===================

app.get("/api/admin/categories", requireAuth, (req, res) => {
  const db = readDB();
  res.json([...db.categories].sort((a, b) => a.order - b.order));
});

app.post("/api/admin/categories", requireAuth, (req, res) => {
  const db = readDB();
  const name = (req.body && req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Kategori adı zorunludur." });
  if (db.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: "Bu kategori zaten var." });
  }
  const maxOrder = db.categories.reduce((m, c) => Math.max(m, c.order || 0), 0);
  const category = { id: genId("cat"), name, order: maxOrder + 1 };
  db.categories.push(category);
  writeDB(db);
  res.status(201).json(category);
});

app.put("/api/admin/categories/:id", requireAuth, (req, res) => {
  const db = readDB();
  const cat = db.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: "Kategori bulunamadı." });
  const newName = (req.body && req.body.name || "").trim();
  if (!newName) return res.status(400).json({ error: "Kategori adı boş olamaz." });
  const oldName = cat.name;
  cat.name = newName;
  // bu kategorideki ürünlerin category alanını da güncelle
  db.products.forEach(p => { if (p.category === oldName) p.category = newName; });
  writeDB(db);
  res.json(cat);
});

app.delete("/api/admin/categories/:id", requireAuth, (req, res) => {
  const db = readDB();
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
  writeDB(db);
  res.json({ ok: true });
});

app.put("/api/admin/categories/reorder/all", requireAuth, (req, res) => {
  const db = readDB();
  const orderList = (req.body && req.body.order) || [];
  orderList.forEach((id, i) => {
    const c = db.categories.find(x => x.id === id);
    if (c) c.order = i + 1;
  });
  writeDB(db);
  res.json({ ok: true });
});

// =================== ADMIN: AYARLAR (banner, iletişim) ===================

app.get("/api/admin/settings", requireAuth, (req, res) => {
  const db = readDB();
  res.json(db.settings);
});

app.put("/api/admin/settings", requireAuth, (req, res) => {
  const db = readDB();
  db.settings = { ...db.settings, ...req.body };
  writeDB(db);
  res.json(db.settings);
});

// =================== ADMIN: GÖRSEL YÜKLEME ===================

app.post("/api/admin/upload", requireAuth, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Dosya bulunamadı." });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

app.listen(PORT, () => {
  console.log(`Alanya Racing Motors sunucusu çalışıyor: http://localhost:${PORT}`);
  console.log(`Admin paneli: http://localhost:${PORT}/admin.html`);
});
