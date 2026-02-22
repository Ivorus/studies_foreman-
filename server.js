import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "server-data.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "12345"; // поменяешь в Railway Variables

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { submissions: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("readStore error:", e);
    return { submissions: [] };
  }
}

function writeStore(store) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("writeStore error:", e);
    throw e;
  }
}

// --- API для пользователей (сохраняем ответы) ---
app.post("/api/submit", (req, res) => {
  const payload = req.body || {};
  const store = readStore();

  store.submissions.unshift({
    id: cryptoRandomId(),
    createdAt: new Date().toISOString(),
    ...payload,
  });

  writeStore(store);
  res.json({ ok: true });
});

// --- API для админа (получить все ответы) ---
app.get("/api/admin/submissions", (req, res) => {
  const pass = req.headers["x-admin-password"];
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const store = readStore();
  res.json(store.submissions || []);
});

// --- Мини-админка прямо с сервера: /admin ---
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(adminHtml());
});

// --- Раздача React сборки ---
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
  console.log("DATA_FILE =", DATA_FILE);
});

function cryptoRandomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function adminHtml() {
  return `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Admin — Submissions</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:16px}
    input,button{font-size:16px;padding:10px;margin:6px 0}
    .card{border:1px solid #ddd;border-radius:10px;padding:12px;margin:10px 0}
    pre{white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:10px;border-radius:8px}
  </style>
</head>
<body>
  <h2>Личный кабинет — ответы пользователей</h2>
  <div>
    <div>Пароль админа:</div>
    <input id="pass" type="password" placeholder="ADMIN_PASSWORD" />
    <button id="load">Загрузить ответы</button>
  </div>
  <div id="status"></div>
  <div id="list"></div>

<script>
  const statusEl = document.getElementById("status");
  const listEl = document.getElementById("list");
  document.getElementById("load").onclick = async () => {
    statusEl.textContent = "Загрузка...";
    listEl.innerHTML = "";
    const pass = document.getElementById("pass").value;
    const r = await fetch("/api/admin/submissions", { headers: { "x-admin-password": pass }});
    if (!r.ok) {
      statusEl.textContent = "Ошибка: неверный пароль или сервер недоступен (" + r.status + ")";
      return;
    }
    const data = await r.json();
    statusEl.textContent = "Найдено: " + data.length;
    data.forEach(item => {
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = "<b>" + (item.createdAt || "") + "</b><pre>" + escapeHtml(JSON.stringify(item, null, 2)) + "</pre>";
      listEl.appendChild(div);
    });
  };

  function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
</script>
</body>
</html>`;
}