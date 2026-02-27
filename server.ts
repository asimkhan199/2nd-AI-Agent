import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- VICIdial Integration Endpoints ---

  /**
   * Endpoint for VICIdial's "Start Call URL" or "External Web Variable"
   * VICIdial hits this when a call is connected to the Remote Agent.
   */
  app.get("/api/vicidial/call-start", (req, res) => {
    const { lead_id, phone_number, user, campaign, list_id } = req.query;
    
    console.log(`[VICIdial] Call Started - Lead: ${lead_id}, Phone: ${phone_number}`);
    
    // In a real production app, you might store this in a database or 
    // broadcast it to a specific client session via WebSockets.
    // For this demo, we'll just return a success message.
    res.json({ 
      status: "success", 
      message: "Call received by Sarah AI",
      data: { lead_id, phone_number, user, campaign }
    });
  });

  /**
   * Endpoint for Sarah to send disposition back to VICIdial
   */
  app.post("/api/vicidial/disposition", async (req, res) => {
    const { lead_id, status, user, pass } = req.body;
    
    console.log(`[VICIdial] Sending Disposition - Lead: ${lead_id}, Status: ${status}`);

    // In production, you would make a request to VICIdial's non_agent_api.php
    // Example:
    // const viciUrl = `http://vici-server/vicidial/non_agent_api.php?source=sarah&user=${user}&pass=${pass}&function=external_status&value=${status}&lead_id=${lead_id}`;
    // await fetch(viciUrl);

    res.json({ status: "success", message: `Disposition ${status} logged for lead ${lead_id}` });
  });

  /**
   * Health check for VICIdial to monitor Sarah's availability
   */
  app.get("/api/vicidial/health", (req, res) => {
    res.json({ 
      status: "online", 
      agent: "Sarah AI", 
      concurrency_limit: 200, 
      active_calls: 0 
    });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sarah AI Server running on http://0.0.0.0:${PORT}`);
    console.log(`VICIdial Endpoints:`);
    console.log(` - Start Call: http://<APP_URL>/api/vicidial/call-start`);
    console.log(` - Disposition: http://<APP_URL>/api/vicidial/disposition`);
    console.log(` - Health: http://<APP_URL>/api/vicidial/health`);
  });
}

startServer();
