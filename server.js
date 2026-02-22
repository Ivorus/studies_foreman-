import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const DATA_FILE = process.env.DATA_FILE || "./server-data.json";

function readData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const next = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2));
}

app.get("/api/data", (req, res) => {
  res.json(readData());
});

app.post("/api/data", (req, res) => {
  writeData(req.body);
  res.json({ success: true });
});

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
  console.log("DATA_FILE =", DATA_FILE);
});
