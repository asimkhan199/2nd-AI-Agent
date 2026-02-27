# Production-Grade AI Cold-Calling Architecture: Sarah AI + VICIdial

This document outlines the transition from a browser-based MVP to a scalable, production-ready server-side architecture using Asterisk ARI and Gemini Live API.

---

## 1️⃣ Final Recommended Architecture (ARI-Centric)

The browser is removed from the critical audio path. All media processing happens server-side for maximum reliability and minimum latency.

```text
[ PSTN / SIP Trunk ]
       |
       v
[ Asterisk / VICIdial ] <--- (Signaling: SIP/AMI) ---> [ VICIdial DB/Web ]
       |
       | (Media: Internal RTP / Snoop)
       v
[ Node.js AI Bridge Cluster ] <--- (Control: ARI / WebSockets)
       |
       | (Media: PCM16 @ 16kHz)
       v
[ Gemini Live API (Google) ]
```

### Why this design is superior:
- **Zero Browser Dependency**: Eliminates ICE/NAT issues and browser crashes.
- **Deterministic Latency**: Audio is streamed directly from Asterisk memory to the AI Bridge.
- **Security**: Gemini API keys and VICIdial credentials live only in the protected backend.
- **Scaling**: Node.js workers can be horizontally scaled behind a load balancer.

---

## 2️⃣ Call Flow (Deterministic Sequence)

1.  **Trigger**: VICIdial places an outbound call via `Auto-Dialer`.
2.  **Invite**: Asterisk sends SIP INVITE to the customer.
3.  **Stasis**: Upon answer, Asterisk Dialplan sends the call to `Stasis(sarah_app)`.
4.  **Event**: Node.js receives `StasisStart` event via ARI WebSocket.
5.  **Snoop**: Node.js issues ARI command to `snoop` the channel (bidirectional).
6.  **Stream**: Node.js opens a WebSocket to Gemini Live API.
7.  **Loop**: 
    - Asterisk RTP -> Node.js -> Gemini (User Audio)
    - Gemini -> Node.js -> Asterisk (AI Audio)
8.  **Hangup**: ARI receives `StasisEnd`. Node.js closes Gemini session.
9.  **Disposition**: Node.js calls VICIdial `non_agent_api.php` with the final status.

---

## 3️⃣ Server-Side Audio Bridge Design (ARI + Node.js)

### ARI Snoop Mechanism
We use the `channels/externalMedia` or `channels/{channelId}/snoop` ARI endpoint. Snoop allows us to tap into the audio without interrupting the VICIdial session.

### Node.js Pseudocode (Conceptual)

```typescript
import client from 'ari-client';
import { GoogleGenAI } from "@google/genai";

const ari = await client.connect('http://asterisk:8088', 'user', 'pass');

ari.on('StasisStart', async (event, channel) => {
  // 1. Create Snoop Channel
  const snoop = await ari.channels.snoopChannel({
    channelId: channel.id,
    spy: 'both', // Hear customer and AI
    whisper: 'both', // Speak to customer
    app: 'sarah_bridge'
  });

  // 2. Setup Gemini Live
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const session = await ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    config: { responseModalities: ['AUDIO'] }
  });

  // 3. Audio Bridge (Asterisk -> Gemini)
  // Use a library like 'rtp-parser' or stream raw PCM via ARI externalMedia
  snoop.on('RtpPacket', (packet) => {
    session.sendRealtimeInput({
      media: { data: packet.payload.toString('base64'), mimeType: 'audio/pcm;rate=16000' }
    });
  });

  // 4. Audio Bridge (Gemini -> Asterisk)
  session.on('message', (msg) => {
    if (msg.serverContent?.modelTurn?.parts[0]?.inlineData) {
      const audio = Buffer.from(msg.serverContent.modelTurn.parts[0].inlineData.data, 'base64');
      ari.channels.play({ channelId: channel.id, media: `sound:${saveToTemp(audio)}` });
      // Note: In production, use a continuous RTP stream back to Asterisk
    }
  });
});
```

---

## 4️⃣ Latency Optimization Plan

-   **Codec**: Use **L16 (Linear 16-bit PCM)** at 16kHz. Asterisk should transcode from G.711 (8kHz) to L16 (16kHz) internally. This avoids the overhead of compressed codecs like G.729.
-   **Jitter Buffer**: Disable Asterisk jitter buffers for the AI leg; the AI Bridge should handle minimal buffering (20ms chunks).
-   **Barge-in**: Use Gemini's built-in interruption detection. When `interrupted` event is received from Gemini, immediately issue `ari.channels.stopMedia` to Asterisk.
-   **VAD**: Use server-side VAD (Voice Activity Detection) to gate audio sent to Gemini, reducing API costs and noise processing.

---

## 5️⃣ Deterministic Call State Engine

| State | Trigger Event | Action |
| :--- | :--- | :--- |
| **INIT** | VICIdial API Call | Create Lead Record in Bridge DB |
| **DIALING** | `ChannelCreated` (ARI) | Monitor Progress |
| **STASIS** | `StasisStart` (ARI) | Start AI Session, Play Disclosure |
| **AI_SPEAKING** | Gemini `modelTurn` | Stream Audio to Asterisk |
| **USER_SPEAKING** | Gemini `inputTranscription` | Flag "User Talking" for Barge-in logic |
| **HANGUP** | `StasisEnd` (ARI) | Close Session, Trigger Disposition |
| **DISPOSED** | VICIdial API Success | Mark Lead as Processed |

---

## 6️⃣ Security Architecture

-   **API Proxy**: The frontend (if any) never sees the Gemini Key. All requests are proxied through the Node.js Bridge.
-   **VICIdial Auth**: Credentials stored in Environment Variables on the Bridge server.
-   **IP Whitelisting**: Asterisk ARI and VICIdial API should only accept connections from the Bridge Cluster IP range.

---

## 7️⃣ Scaling Strategy

-   **10 Calls**: Single Node.js instance + Single Asterisk server.
-   **50 Calls**: Cluster of 3 Node.js workers using PM2 or Docker.
-   **200+ Calls**: 
    - **Horizontal Scaling**: Multiple Asterisk "Media Gateways" managed by a central VICIdial server.
    - **Load Balancing**: Use **Kamailio** to distribute SIP traffic across Asterisk nodes.
    - **Resource Estimation**: ~1 CPU Core per 20 concurrent AI sessions (due to transcoding and WebSocket overhead).

---

## 8️⃣ Compliance Safeguards (TCPA/DNC)

-   **AI Disclosure**: The first 3 seconds of every call MUST play a pre-recorded: *"Hi, I'm Sarah, an automated assistant for Air Duct Services..."*
-   **DNC Enforcement**: Bridge checks a Redis-cached DNC list before allowing the ARI `snoop` to start.
-   **Human Takeover**: If the AI detects a "Transfer to manager" request, Node.js uses ARI to `redirect` the channel to a live VICIdial agent queue.

---

## 9️⃣ Monitoring & Observability

-   **Metrics**: Prometheus exporter for:
    - `ai_latency_ms`: Time from user audio end to AI audio start.
    - `concurrent_calls`: Active ARI sessions.
    - `gemini_error_rate`: 4xx/5xx responses from Google.
-   **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana) for full call transcripts and SIP traces.

---

## 🔟 Final Verdict

-   **Commercially Viable?** Yes, but only with a server-side (ARI) architecture.
-   **Browser-based at scale?** **No.** It will fail due to resource exhaustion and network instability.
-   **ARI Mandatory?** **Yes.** It is the only way to get the deterministic control required for 200+ calls.
-   **Biggest Risk?** **Latency.** If the round-trip time exceeds 1.5 seconds, the "human" feel is lost, and hang-up rates will skyrocket.
