import express from "express";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// -----------------------------------------------
// OpenCode SDK Client
// -----------------------------------------------
// Default to localhost for local dev, use service name in Docker
const OPENCODE_SERVER_URL =
  process.env.OPENCODE_SERVER_URL || 
  (process.env.NODE_ENV === 'production' ? "http://opencode-server:4096" : "http://localhost:4096");

function getClient() {
  const client = createOpencodeClient({
    baseUrl: OPENCODE_SERVER_URL,
  });
  
  // Log for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEBUG] OpenCode Client created with baseUrl: ${OPENCODE_SERVER_URL}`);
  }
  
  return client;
}

// -----------------------------------------------
// API Routes
// -----------------------------------------------

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const client = getClient();
    
    // Try different possible API structures
    let health;
    try {
      // Try client.global.health() first (SDK docs)
      if (client.global && typeof client.global.health === 'function') {
        health = await client.global.health();
      } 
      // Fallback to client.health()
      else if (typeof client.health === 'function') {
        health = await client.health();
      }
      // Last resort: direct HTTP check with correct endpoint
      else {
        // Try /global/health (correct API endpoint)
        let response = await fetch(`${OPENCODE_SERVER_URL}/global/health`);
        if (!response.ok) {
          // Fallback to /health
          response = await fetch(`${OPENCODE_SERVER_URL}/health`);
        }
        if (response.ok) {
          health = await response.json();
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }
      
      res.json({ status: "ok", opencode: health });
    } catch (apiErr) {
      console.error("[ERROR] API call failed:", apiErr.message);
      // Try direct HTTP as fallback
      try {
        const response = await fetch(`${OPENCODE_SERVER_URL}`);
        if (response.ok) {
          res.json({ 
            status: "ok", 
            opencode: { 
              healthy: true, 
              note: "Server reachable but health endpoint may differ" 
            } 
          });
        } else {
          throw apiErr;
        }
      } catch {
        throw apiErr;
      }
    }
  } catch (err) {
    console.error("[ERROR] Health check failed:", err.message);
    console.error("[ERROR] Server URL:", OPENCODE_SERVER_URL);
    res.status(503).json({
      status: "error",
      message: "Cannot connect to OpenCode server",
      detail: err.message,
      serverUrl: OPENCODE_SERVER_URL,
    });
  }
});

// List available agents
app.get("/api/agents", async (req, res) => {
  try {
    const client = getClient();
    const agents = await client.app.agents();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new session
app.post("/api/sessions", async (req, res) => {
  try {
    const client = getClient();
    const session = await client.session.create();
    
    // Ensure session has an id field
    const sessionData = {
      id: session.id || session.sessionID || session.session_id || session.data?.id,
      ...session
    };
    
    if (!sessionData.id) {
      console.error("[ERROR] Session created but no ID:", session);
      return res.status(500).json({ error: "Session created but no ID returned" });
    }
    
    res.json(sessionData);
  } catch (err) {
    console.error("[ERROR] Failed to create session:", err);
    res.status(500).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
  }
});

// List sessions
app.get("/api/sessions", async (req, res) => {
  try {
    const client = getClient();
    const sessions = await client.session.list();
    
    // Ensure we always return an array
    const sessionsArray = Array.isArray(sessions) 
      ? sessions 
      : (sessions?.sessions || sessions?.data || []);
    
    res.json(sessionsArray);
  } catch (err) {
    console.error("[ERROR] Failed to list sessions:", err);
    // Return empty array on error instead of error object
    res.json([]);
  }
});

// Get a specific session
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const client = getClient();
    const session = await client.session.get(req.params.id);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a prompt — streams the response back via SSE
app.post("/api/sessions/:id/prompt", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: "content is required" });
  }

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  try {
    const client = getClient();

    // Subscribe to events before sending prompt
    const unsubscribe = client.event.subscribe((event) => {
      // Filter events for this session
      if (event.properties?.sessionID === id || !event.properties?.sessionID) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // Check for completion events
      if (
        event.type === "message.complete" ||
        event.type === "session.complete" ||
        event.type === "assistant.message.complete"
      ) {
        if (
          !event.properties?.sessionID ||
          event.properties?.sessionID === id
        ) {
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          setTimeout(() => {
            unsubscribe?.();
            res.end();
          }, 100);
        }
      }
    });

    // Send the prompt
    await client.session.prompt({
      sessionID: id,
      content: content,
    });

    // Timeout safety — close stream after 5 minutes
    const timeout = setTimeout(() => {
      res.write(
        `data: ${JSON.stringify({ type: "timeout", message: "Response timed out" })}\n\n`
      );
      unsubscribe?.();
      res.end();
    }, 5 * 60 * 1000);

    req.on("close", () => {
      clearTimeout(timeout);
      unsubscribe?.();
    });
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
    );
    res.end();
  }
});

// -----------------------------------------------
// Fallback — serve index.html for SPA
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
║       OpenCode Server: ${OPENCODE_SERVER_URL}    ║
╚══════════════════════════════════════════════╝
  `);
});
