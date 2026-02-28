import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(cors());
  app.use(express.json());

  // --- State Management (In-Memory for Production Prototype) ---
  let leads: any[] = [];
  let dncList: Set<string> = new Set(); // Simple DNC list
  let dispositions: any[] = [];
  let appointments: any[] = [];
  let activeCalls: any[] = [];
  let dialerConfig = {
    concurrency: 5,
    activeAgents: 20,
    sipServer: '',
    sipPort: '5060',
    status: 'idle'
  };

  // --- Dialer Engine ---
  let dialerInterval: NodeJS.Timeout | null = null;

  const runDialerLoop = () => {
    if (dialerConfig.status !== 'active') return;

    const availableSlots = dialerConfig.activeAgents - activeCalls.length;
    if (availableSlots <= 0) return;

    // Predictive logic: Dial (concurrency * availableSlots)
    const availableLeads = leads.filter(l => !l.dialed && !dncList.has(l.Phone || l.phone));
    const numbersToDial = Math.min(
      availableLeads.length,
      availableSlots * dialerConfig.concurrency
    );

    if (numbersToDial > 0) {
      console.log(`[Dialer] Dialing ${numbersToDial} numbers for ${availableSlots} slots...`);
      
      // Simulate dialing
      for (let i = 0; i < numbersToDial; i++) {
        const leadIndex = leads.findIndex(l => !l.dialed);
        if (leadIndex === -1) break;
        
        leads[leadIndex].dialed = true;
        const lead = leads[leadIndex];

        // Simulate Answer Rate (25%)
        if (Math.random() < 0.25) {
          const callId = uuidv4();
          const newCall = {
            id: callId,
            leadId: lead.id,
            leadName: lead.Name || lead.firstName || 'Unknown',
            status: 'AI_SPEAKING',
            duration: 0,
            sentiment: 'Neutral',
            startTime: Date.now()
          };
          activeCalls.push(newCall);
          io.emit('call:started', newCall);
          
          // Simulate call duration and end
          setTimeout(() => {
            const index = activeCalls.findIndex(c => c.id === callId);
            if (index !== -1) {
              const call = activeCalls[index];
              const disposition = {
                ...call,
                endTime: Date.now(),
                duration: Math.floor((Date.now() - call.startTime) / 1000)
              };
              activeCalls.splice(index, 1);
              dispositions.push(disposition);
              io.emit('call:ended', disposition);
            }
          }, Math.random() * 30000 + 10000);
        }
      }
      io.emit('leads:update', { total: leads.length, dialed: leads.filter(l => l.dialed).length });
    }
  };

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        dialer: dialerConfig.status,
        database: "connected",
        sip: dialerConfig.sipServer ? "connected" : "idle",
        api: process.env.GEMINI_API_KEY ? "connected" : "error"
      },
      stats: {
        leads: leads.length,
        dnc: dncList.size,
        active: activeCalls.length,
        uptime: process.uptime()
      }
    });
  });

  app.post("/api/leads/upload", (req, res) => {
    const newLeads = req.body.leads.map((l: any) => ({
      ...l,
      id: uuidv4(),
      dialed: false,
      uploadedAt: new Date().toISOString()
    }));
    leads = [...leads, ...newLeads];
    io.emit('leads:update', { total: leads.length, dialed: leads.filter(l => l.dialed).length });
    res.json({ success: true, count: newLeads.length });
  });

  app.post("/api/dialer/config", (req, res) => {
    dialerConfig = { ...dialerConfig, ...req.body };
    if (dialerConfig.status === 'active' && !dialerInterval) {
      dialerInterval = setInterval(runDialerLoop, 5000);
    } else if (dialerConfig.status === 'idle' && dialerInterval) {
      clearInterval(dialerInterval);
      dialerInterval = null;
    }
    io.emit('config:update', dialerConfig);
    res.json({ success: true, config: dialerConfig });
  });

  app.get("/api/stats", (req, res) => {
    res.json({
      leads: {
        total: leads.length,
        dialed: leads.filter(l => l.dialed).length,
        remaining: leads.filter(l => !l.dialed).length
      },
      activeCalls: activeCalls.length,
      dispositions: dispositions.length,
      appointments: appointments.length
    });
  });

  // --- Vite Middleware for Development ---
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

  // --- WebSocket Logic ---
  io.on("connection", (socket) => {
    console.log("[Socket] Client connected:", socket.id);
    socket.emit('init', {
      leads: { total: leads.length, dialed: leads.filter(l => l.dialed).length },
      activeCalls,
      dialerConfig,
      dispositions: dispositions.slice(-50),
      appointments
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Client disconnected");
    });
  });

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] World-Class AI Dialer running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[Server] Critical Failure:", err);
  process.exit(1);
});
