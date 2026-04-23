const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function proxyMovie(targetUrl, req, res) {
  const url = new URL(targetUrl);
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://vidsrc.xyz/",
      "Origin": "https://vidsrc.xyz"
    }
  };

  const protocol = url.protocol === "https:" ? https : http;
  const proxyReq = protocol.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    delete headers["x-frame-options"];
    delete headers["content-security-policy"];
    headers["Access-Control-Allow-Origin"] = "*";

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Proxy error: " + err.message);
  });
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];

  // Handle movie proxy requests
  if (urlPath === "/proxy-movie") {
    const urlParams = new URLSearchParams(req.url.split("?")[1]);
    const movieUrl = urlParams.get("url");
    if (movieUrl) {
      console.log("Proxying movie:", movieUrl);
      proxyMovie(movieUrl, req, res);
      return;
    } else {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing url parameter");
      return;
    }
  }

  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath === "/games") urlPath = "/games.html";
  if (urlPath === "/movies" || urlPath === "/movies/") urlPath = "/movies/index.html";

  const rootAttempt    = path.join(__dirname, urlPath);
  const appsAttempt    = path.join(__dirname, "apps", urlPath);
  const lithiumAttempt = path.join(__dirname, "lithium-js", urlPath);

  function serveFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const headers = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    };
    if (ext === ".html") {
      headers["X-Frame-Options"] = "ALLOWALL";
      headers["Content-Security-Policy"] = "frame-ancestors *";
      headers["Cache-Control"] = "no-cache";
    }
    if (ext === ".wasm") {
      headers["Cache-Control"] = "public, max-age=86400";
    }
    if (filePath.includes("sw.js") || filePath.includes("bareworker.js")) {
      headers["Service-Worker-Allowed"] = "/";
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  }

  if (fs.existsSync(rootAttempt) && fs.statSync(rootAttempt).isFile()) {
    serveFile(rootAttempt);
  } else if (
    fs.existsSync(lithiumAttempt) &&
    fs.statSync(lithiumAttempt).isFile()
  ) {
    serveFile(lithiumAttempt);
  } else if (
    fs.existsSync(appsAttempt) &&
    fs.statSync(appsAttempt).isFile()
  ) {
    serveFile(appsAttempt);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found: " + urlPath);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
