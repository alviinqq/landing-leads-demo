// Local preview without Vercel: node dev-server.js -> http://localhost:3000
// Reads .env if present, so you can test real Telegram delivery locally.
const http = require("http");
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const handler = require("./api/lead");
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  if (req.url.startsWith("/api/lead")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      req.body = raw;
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
      handler(req, res);
    });
    return;
  }
  fs.readFile(path.join(__dirname, "index.html"), (err, html) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
