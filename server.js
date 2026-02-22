import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || "./server-data.json";
const DIST_DIR = path.join(__dirname, "dist");

function readData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const next = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function serveStatic(reqPath, res) {
  const safePath = path.normalize(reqPath).replace(/^([.][.][/\\])+/, "");
  let filePath = path.join(DIST_DIR, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": getMimeType(filePath) });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("dist/index.html not found. Run: npm run build");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === "/api/data") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/data") {
    sendJson(res, 200, readData());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/data") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        res.writeHead(413);
        res.end("Payload too large");
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        writeData(parsed);
        sendJson(res, 200, { success: true });
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON" });
      }
    });
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(PORT, () => {
  console.log("Server started on port", PORT);
  console.log("DATA_FILE =", DATA_FILE);
});
