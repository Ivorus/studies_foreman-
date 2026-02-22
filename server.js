import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "5mb" }));

// Railway Volume file path
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "server-data.json");

function readDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("readDB error:", e);
    return {};
  }
}

function writeDB(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

// ✅ ТВОЙ КОНТРАКТ: /api/data/:key
app.get("/api/data/:key", (req, res) => {
  const key = req.params.key;
  const db = readDB();
  res.json({ value: db[key] ?? null });
});

app.post("/api/data/:key", (req, res) => {
  const key = req.params.key;
  const { value } = req.body || {};
  const db = readDB();
  db[key] = value;
  writeDB(db);
  res.json({ ok: true });
});

// Serve Vite build
const DIST_DIR = path.join(__dirname, "dist");
app.use(express.static(DIST_DIR));

// SPA fallback (чтобы при обновлении страницы не выкидывало на главный экран)
app.get("*", (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
  console.log("DATA_FILE =", DATA_FILE);
});