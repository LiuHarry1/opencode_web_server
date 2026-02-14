import express from "express";
import { fileURLToPath } from "url";
import { dirname, join, basename, extname, resolve } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, createReadStream } from "fs";
import dotenv from "dotenv";
import { EventSource } from "eventsource";
import multer from "multer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(__dirname, "public")));

// -----------------------------------------------
// Security: Basic rate limiting (in-memory)
// -----------------------------------------------
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60;      // max requests per window

function rateLimit(req, res, next) {
  const key = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  return next();
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

app.use(rateLimit);

// -----------------------------------------------
// Configuration
// -----------------------------------------------
const OPENCODE_SERVER_URL =
  process.env.OPENCODE_SERVER_URL || "http://localhost:4096";
const UPLOAD_DIR = "/workspace/uploads";
const OUTPUT_DIR = "/workspace/outputs";
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024;

console.log(`[INFO] OpenCode Server URL: ${OPENCODE_SERVER_URL}`);
console.log(`[INFO] Upload Dir: ${UPLOAD_DIR}`);
console.log(`[INFO] Output Dir: ${OUTPUT_DIR}`);
console.log(`[INFO] Max File Size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);

// Ensure directories exist
[UPLOAD_DIR, OUTPUT_DIR].forEach((dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

// -----------------------------------------------
// File Upload (multer)
// -----------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Preserve original filename, add timestamp to avoid conflicts
    const ext = extname(file.originalname);
    const name = basename(file.originalname, ext);
    const ts = Date.now();
    cb(null, `${name}_${ts}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowed = [
      ".pdf", ".xlsx", ".xls", ".csv", ".txt", ".json", ".xml",
      ".doc", ".docx", ".ppt", ".pptx",
      ".png", ".jpg", ".jpeg", ".gif", ".svg",
      ".py", ".js", ".ts", ".html", ".css", ".md",
      ".zip", ".tar", ".gz",
    ];
    const ext = extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  },
});

// -----------------------------------------------
// Helper: call OpenCode API
// -----------------------------------------------
async function opencodeAPI(path, options = {}) {
  const url = `${OPENCODE_SERVER_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`OpenCode API ${path} returned ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// -----------------------------------------------
// API: Health Check
// -----------------------------------------------
app.get("/api/health", async (req, res) => {
  try {
    const health = await opencodeAPI("/global/health");
    res.json({ status: "ok", opencode: health });
  } catch (err) {
    console.error("[ERROR] Health check:", err.message);
    res.status(503).json({
      status: "error",
      message: "Cannot connect to OpenCode server",
      detail: err.message,
    });
  }
});

// -----------------------------------------------
// API: List Available Skills
// -----------------------------------------------
app.get("/api/skills", (req, res) => {
  // Return pre-configured skills that users can use
  const skills = [
    {
      id: "pdf",
      name: "PDF Processing",
      icon: "file-text",
      description: "Extract text, merge/split, fill forms, create PDFs",
      prompts: [
        { label: "Extract text from PDF", prompt: "Please extract all text from the uploaded PDF file in /workspace/uploads/ and save it as a text file in /workspace/outputs/" },
        { label: "Merge PDFs", prompt: "Please merge all PDF files in /workspace/uploads/ into a single PDF and save it to /workspace/outputs/merged.pdf" },
        { label: "Fill PDF form", prompt: "I uploaded a PDF form to /workspace/uploads/. Please check if it has fillable fields and help me fill them." },
        { label: "PDF to images", prompt: "Please convert each page of the PDF in /workspace/uploads/ to PNG images and save them in /workspace/outputs/" },
      ],
    },
    {
      id: "xlsx",
      name: "Excel Processing",
      icon: "table",
      description: "Create, edit, analyze spreadsheets with formulas",
      prompts: [
        { label: "Analyze Excel", prompt: "Please analyze the Excel file in /workspace/uploads/ and give me a summary of its contents, sheets, and data." },
        { label: "Create Excel", prompt: "Please create an Excel spreadsheet with the data I describe and save it to /workspace/outputs/" },
        { label: "Recalculate formulas", prompt: "Please recalculate all formulas in the Excel file in /workspace/uploads/ using LibreOffice and save the result to /workspace/outputs/" },
      ],
    },
    {
      id: "code",
      name: "Python Script",
      icon: "code",
      description: "Write and execute Python scripts for data processing",
      prompts: [
        { label: "Run Python script", prompt: "Please write and execute a Python script to process the file(s) in /workspace/uploads/ and save results to /workspace/outputs/" },
        { label: "Data analysis", prompt: "Please write a Python script to analyze the data file in /workspace/uploads/ using pandas and generate a summary report in /workspace/outputs/" },
      ],
    },
  ];

  res.json(skills);
});

// -----------------------------------------------
// API: File Upload
// -----------------------------------------------
app.post("/api/upload", upload.array("files", 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const uploaded = req.files.map((f) => ({
    originalName: f.originalname,
    savedName: f.filename,
    size: f.size,
    path: `/workspace/uploads/${f.filename}`,
  }));

  console.log(`[INFO] Uploaded ${uploaded.length} file(s):`, uploaded.map(f => f.savedName));
  res.json({ files: uploaded });
});

// Handle multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// -----------------------------------------------
// API: List Files (uploads & outputs)
// -----------------------------------------------
app.get("/api/files", (req, res) => {
  const type = req.query.type || "all"; // "uploads", "outputs", or "all"

  const listDir = (dir, category) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => !f.startsWith("."))
      .map((f) => {
        const stat = statSync(join(dir, f));
        return {
          name: f,
          category,
          size: stat.size,
          modified: stat.mtime,
          downloadUrl: `/api/files/${category}/${encodeURIComponent(f)}`,
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
  };

  let files = [];
  if (type === "uploads" || type === "all") {
    files = files.concat(listDir(UPLOAD_DIR, "uploads"));
  }
  if (type === "outputs" || type === "all") {
    files = files.concat(listDir(OUTPUT_DIR, "outputs"));
  }

  res.json(files);
});

// -----------------------------------------------
// API: Download File
// -----------------------------------------------
app.get("/api/files/:category/:filename", (req, res) => {
  const { category, filename } = req.params;

  // Only allow known categories
  if (category !== "uploads" && category !== "outputs") {
    return res.status(400).json({ error: "Invalid file category" });
  }

  const dir = category === "outputs" ? OUTPUT_DIR : UPLOAD_DIR;
  const decodedFilename = decodeURIComponent(filename);

  // Security: reject filenames with path separators or traversal patterns
  if (decodedFilename.includes("/") || decodedFilename.includes("\\") || decodedFilename.includes("..")) {
    return res.status(403).json({ error: "Access denied" });
  }

  const filePath = resolve(dir, decodedFilename);

  // Security: ensure resolved path is strictly within the target directory
  if (!filePath.startsWith(resolve(dir) + "/") && filePath !== resolve(dir)) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath);
});

// -----------------------------------------------
// API: List Agents
// -----------------------------------------------
app.get("/api/agents", async (req, res) => {
  try {
    const agents = await opencodeAPI("/agent");
    res.json(agents);
  } catch (err) {
    console.error("[ERROR] List agents:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------
// API: Sessions
// -----------------------------------------------
app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await opencodeAPI("/session");
    const arr = Array.isArray(sessions) ? sessions : [];
    res.json(arr);
  } catch (err) {
    console.error("[ERROR] List sessions:", err.message);
    res.json([]);
  }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const session = await opencodeAPI("/session", {
      method: "POST",
      body: JSON.stringify({}),
    });
    res.json(session);
  } catch (err) {
    console.error("[ERROR] Create session:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    const session = await opencodeAPI(`/session/${req.params.id}`);
    res.json(session);
  } catch (err) {
    console.error("[ERROR] Get session:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions/:id/messages", async (req, res) => {
  try {
    const messages = await opencodeAPI(`/session/${req.params.id}/message`);
    const arr = Array.isArray(messages) ? messages : [];
    res.json(arr);
  } catch (err) {
    console.error("[ERROR] Get messages:", err.message);
    res.json([]);
  }
});

// -----------------------------------------------
// API: Send Prompt (SSE streaming)
// -----------------------------------------------
app.post("/api/sessions/:id/prompt", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: "content is required" });
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let eventSource;
  let finished = false;
  let safetyTimeout = null;

  const cleanup = () => {
    if (!finished) {
      finished = true;
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
      }
      if (eventSource) {
        try { eventSource.close(); } catch {}
        eventSource = null;
      }
    }
  };

  req.on("close", cleanup);

  try {
    // 1. Subscribe to SSE event stream BEFORE sending the prompt
    eventSource = new EventSource(`${OPENCODE_SERVER_URL}/event`);

    eventSource.onmessage = (event) => {
      if (finished) return;

      try {
        const data = JSON.parse(event.data);

        // Only forward events for our session — drop events for other sessions
        if (data.properties?.sessionID && data.properties.sessionID !== id) {
          return;
        }

        // Forward the event to the client
        res.write(`data: ${JSON.stringify(data)}\n\n`);

        // Detect completion
        if (data.type === "session.idle") {
          setTimeout(() => {
            if (!finished) {
              res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
              cleanup();
              res.end();
            }
          }, 300);
        }
      } catch {}
    };

    eventSource.onerror = () => {
      if (!finished) {
        console.error("[ERROR] SSE connection error");
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "SSE connection lost" })}\n\n`
        );
        cleanup();
        res.end();
      }
    };

    // 2. Send the prompt
    await opencodeAPI(`/session/${id}/prompt_async`, {
      method: "POST",
      body: JSON.stringify({
        parts: [{ type: "text", text: content }],
        model: {
          providerID: "github-copilot",
          modelID: "gpt-5.2",
        },
      }),
    });

    // Timeout safety — 5 minutes max per request
    safetyTimeout = setTimeout(() => {
      if (!finished) {
        res.write(
          `data: ${JSON.stringify({ type: "timeout", message: "Response timed out after 5 minutes" })}\n\n`
        );
        cleanup();
        res.end();
      }
    }, 5 * 60 * 1000);
  } catch (err) {
    console.error("[ERROR] Prompt failed:", err.message);
    if (!finished) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
      );
      cleanup();
      res.end();
    }
  }
});

// -----------------------------------------------
// Fallback — serve index.html
// -----------------------------------------------
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

// -----------------------------------------------
// Start server
// -----------------------------------------------
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║       OpenCode Chatbot UI (Multi-User)           ║
║       http://localhost:${PORT}                       ║
║       OpenCode Server: ${OPENCODE_SERVER_URL}    ║
║       Upload Dir: ${UPLOAD_DIR}                  ║
╚══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[INFO] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.log("[INFO] Server closed.");
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error("[WARN] Forcing exit after timeout.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
