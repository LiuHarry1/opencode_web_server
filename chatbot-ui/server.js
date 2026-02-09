import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import { EventSource } from "eventsource";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// -----------------------------------------------
// OpenCode Server URL
// -----------------------------------------------
const OPENCODE_SERVER_URL =
  process.env.OPENCODE_SERVER_URL || "http://localhost:4096";

console.log(`[INFO] OpenCode Server URL: ${OPENCODE_SERVER_URL}`);

// -----------------------------------------------
// Helper: call OpenCode API directly
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
// API Routes
// -----------------------------------------------

// Health check — GET /global/health
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

// List agents — GET /agent
app.get("/api/agents", async (req, res) => {
  try {
    const agents = await opencodeAPI("/agent");
    res.json(agents);
  } catch (err) {
    console.error("[ERROR] List agents:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// List sessions — GET /session
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

// Create session — POST /session
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

// Get session — GET /session/:id
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const session = await opencodeAPI(`/session/${req.params.id}`);
    res.json(session);
  } catch (err) {
    console.error("[ERROR] Get session:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get session messages — GET /session/:id/message
app.get("/api/sessions/:id/messages", async (req, res) => {
  try {
    const messages = await opencodeAPI(
      `/session/${req.params.id}/message`
    );
    const arr = Array.isArray(messages) ? messages : [];
    res.json(arr);
  } catch (err) {
    console.error("[ERROR] Get messages:", err.message);
    res.json([]);
  }
});

// -----------------------------------------------
// Send prompt — POST /session/:id/prompt_async
// Then stream events via SSE from /event
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

  const cleanup = () => {
    if (!finished) {
      finished = true;
      if (eventSource) {
        try { eventSource.close(); } catch {}
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

        // Only forward events for our session
        if (data.properties?.sessionID && data.properties.sessionID !== id) {
          return;
        }

        // Forward the event to the client
        res.write(`data: ${JSON.stringify(data)}\n\n`);

        // Detect completion: "session.idle" means the agent finished
        if (data.type === "session.idle") {
          // Small delay to let final message parts arrive
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

    eventSource.onerror = (err) => {
      if (!finished) {
        console.error("[ERROR] SSE connection error");
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "SSE connection lost" })}\n\n`
        );
        cleanup();
        res.end();
      }
    };

    // 2. Send the prompt via prompt_async (requires "parts" array)
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

    // Timeout safety — 5 minutes
    const timeout = setTimeout(() => {
      if (!finished) {
        res.write(
          `data: ${JSON.stringify({ type: "timeout", message: "Response timed out" })}\n\n`
        );
        cleanup();
        res.end();
      }
    }, 5 * 60 * 1000);

    req.on("close", () => clearTimeout(timeout));
  } catch (err) {
    console.error("[ERROR] Prompt failed:", err.message);
    res.write(
      `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
    );
    cleanup();
    res.end();
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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════╗
║       OpenCode Chatbot UI                    ║
║       http://localhost:${PORT}                  ║
║       OpenCode Server: ${OPENCODE_SERVER_URL}  ║
╚══════════════════════════════════════════════╝
  `);
});
