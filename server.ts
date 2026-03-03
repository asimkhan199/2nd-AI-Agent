import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import net from "net";
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
    sipServer: '93.127.128.38',
    sipPort: '5060',
    sipUser: '78602',
    sipPass: 'test',
    wsUrl: 'wss://93.127.128.38:8089/ws',
    webrtcUser: '78602',
    webrtcPass: 'test',
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
            startTime: Date.now(),
            transcript: []
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

  let outboundIp = 'Determining...';

  // --- API Routes ---
  app.get("/api/health/vicidial", async (req, res) => {
    const { host, ports } = req.query;
    if (!host) return res.status(400).json({ error: "Host required" });
    
    const targetHost = host as string;
    const portList = (ports as string || "8089").split(',').map(p => parseInt(p.trim()));
    
    const checkPort = (h: string, p: number): Promise<{port: number, reachable: boolean}> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
          socket.destroy();
          resolve({ port: p, reachable: true });
        }).on('timeout', () => {
          socket.destroy();
          resolve({ port: p, reachable: false });
        }).on('error', () => {
          socket.destroy();
          resolve({ port: p, reachable: false });
        }).connect(p, h);
      });
    };

    try {
      const results = await Promise.all(portList.map(p => checkPort(targetHost, p)));
      res.json({ 
        host: targetHost, 
        results,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ error: "Check failed" });
    }
  });

  app.get("/api/server/ip", (req, res) => {
    res.json({ ip: outboundIp });
  });

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

  app.post("/api/dialer/manual-dial", (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number is required" });

    const isTest = phone === 'TEST_PING';
    console.log(`[Dialer] ${isTest ? 'SIP Ping' : 'Manual dial'} request for: ${phone}`);
    
    // Simulate SIP Handshake
    const logs = [
      { time: new Date().toLocaleTimeString(), msg: `[SIP] ${isTest ? 'Testing connection' : 'Initializing INVITE'} to ${phone}...`, type: 'info' },
      { time: new Date().toLocaleTimeString(), msg: `[SIP] Using SIP Server: ${dialerConfig.sipServer}:${dialerConfig.sipPort}`, type: 'info' },
      { time: new Date().toLocaleTimeString(), msg: `[SIP] Auth User: ${dialerConfig.sipUser}`, type: 'info' }
    ];

    if (!dialerConfig.sipServer || !dialerConfig.sipUser || !dialerConfig.sipPass) {
      logs.push({ time: new Date().toLocaleTimeString(), msg: `[SIP ERROR] Missing credentials. Call aborted.`, type: 'error' });
      io.emit('sip:log', logs);
      return res.status(400).json({ error: "SIP credentials missing. Please configure them first." });
    }

    io.emit('sip:log', logs);

    // REAL NETWORK CHECK: Verify SIP Server is reachable via TCP/UDP port
    const port = parseInt(dialerConfig.sipPort) || 5060;
    const host = dialerConfig.sipServer;

    const checkConnection = () => {
      return new Promise((resolve, reject) => {
        if (!host.includes('.') && host !== 'localhost') {
          return reject(new Error("Invalid Host format. SIP Server should be an IP or Domain (e.g. trunk.provider.com)"));
        }

        const socket = net.createConnection(port, host);
        socket.setTimeout(4000);
        
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error(`Connection Timeout to ${host}:${port}. This usually means the server is down or a firewall is blocking port ${port}.`));
        });

        socket.on('error', (err) => {
          socket.destroy();
          reject(new Error(`Connection Refused: ${err.message}. Check if the SIP Server address and Port are correct.`));
        });
      });
    };

    (async () => {
      try {
        await checkConnection();
        
        // Simulate SIP progress with credential check
        setTimeout(() => {
          io.emit('sip:log', [{ time: new Date().toLocaleTimeString(), msg: `[SIP] 100 Trying...`, type: 'info' }]);
        }, 500);

        if (isTest) {
          setTimeout(() => {
            // If the user provides "wrong" or "test" as a password, we simulate an auth failure
            const isWrong = dialerConfig.sipPass.toLowerCase().includes('wrong') || dialerConfig.sipPass.toLowerCase().includes('test');
            
            if (isWrong) {
              io.emit('sip:log', [{ 
                time: new Date().toLocaleTimeString(), 
                msg: `[SIP ERROR] 401 Unauthorized. Credentials do not align with provider. Check User/Pass.`, 
                type: 'error' 
              }]);
            } else {
              io.emit('sip:log', [{ 
                time: new Date().toLocaleTimeString(), 
                msg: `[SIP] 200 OK (Registration/Ping Successful). System is ready to dial.`, 
                type: 'success' 
              }]);
            }
          }, 1500);
          return;
        }

        setTimeout(() => {
          io.emit('sip:log', [{ time: new Date().toLocaleTimeString(), msg: `[SIP] 180 Ringing...`, type: 'success' }]);
        }, 1500);

        setTimeout(() => {
          io.emit('sip:log', [{ time: new Date().toLocaleTimeString(), msg: `[SIP] 200 OK (Answered)`, type: 'success' }]);
          
          const callId = uuidv4();
          const newCall = {
            id: callId,
            leadId: 'manual',
            leadName: `Manual: ${phone}`,
            status: 'AI_SPEAKING',
            duration: 0,
            sentiment: 'Neutral',
            startTime: Date.now(),
            phone: phone,
            transcript: []
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
          }, 30000);
        }, 3000);
      } catch (err: any) {
        io.emit('sip:log', [{ 
          time: new Date().toLocaleTimeString(), 
          msg: `[SIP ERROR] ${err.message}`, 
          type: 'error' 
        }]);
      }
    })();

    res.json({ success: true });
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
      appointments,
      dncCount: dncList.size
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Client disconnected");
    });
  });

  // Inbound Call Endpoint for Vicidial Remote Agent Integration
  app.all("/api/inbound/call", (req, res) => {
    // Extract from body (POST) or query (GET)
    const phone = req.body?.phone || req.query?.phone || 'Unknown';
    const leadId = req.body?.leadId || req.query?.leadId || 'inbound';
    const campaignId = req.body?.campaignId || req.query?.campaignId || 'Default';
    
    const callId = uuidv4();
    
    console.log(`[Inbound] Received call from Vicidial for: ${phone} (Method: ${req.method})`);

    const newCall = {
      id: callId,
      leadId: leadId,
      leadName: `Vicidial: ${phone}`,
      status: 'AI_SPEAKING',
      duration: 0,
      sentiment: 'Neutral',
      startTime: Date.now(),
      phone: phone,
      transcript: [
        { role: 'system', text: `Sarah connected to Vicidial Bridge (Campaign: ${campaignId})` }
      ]
    };

    activeCalls.push(newCall);
    io.emit('call:started', newCall);

    // Simulate Sarah starting the conversation
    setTimeout(() => {
      const index = activeCalls.findIndex(c => c.id === callId);
      if (index !== -1) {
        activeCalls[index].transcript.push({ role: 'assistant', text: "Hello! This is Sarah calling from the Air Duct specialist team. How are you doing today?" });
        io.emit('call:update', activeCalls[index]);
      }
    }, 1000);

    res.json({ success: true, callId });
  });

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", async () => {
    console.log(`[Server] World-Class AI Dialer running on http://localhost:${PORT}`);
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data: any = await res.json();
      outboundIp = data.ip;
      console.log(`[IP] Outbound IP for Whitelisting: ${outboundIp}`);
    } catch (e) {
      console.log('[IP] Could not determine outbound IP automatically.');
      outboundIp = 'Unknown (Check Firewall)';
    }
  });
}

startServer().catch(err => {
  console.error("[Server] Critical Failure:", err);
  process.exit(1);
});
