# VOIP & Local Service Integration Guide

To connect the Sarah AI Orchestration Engine to local VOIP services (Asterisk, Twilio, Vicidial, etc.), follow these architectural steps.

## 1. Asterisk / ARI Integration (Recommended)
The most robust way to handle 20+ concurrent calls with low latency is using the **Asterisk REST Interface (ARI)**.

### Setup Steps:
1. **Bridge Creation**: Use ARI to create a mixing bridge for each call.
2. **External Media**: Use the `External Media` channel type in Asterisk to stream audio to/from the Sarah AI engine via UDP/RTP.
3. **Node.js Gateway**: Create a middleware (using `ari-client`) that:
   - Receives audio from Asterisk.
   - Forwards it to the Gemini Live API (as implemented in `App.tsx`).
   - Receives AI audio back and pushes it into the Asterisk bridge.

### Real Call Flow:
- **Inbound**: Customer calls your number -> Asterisk answers -> ARI triggers Sarah AI -> Sarah starts speaking.
- **Outbound**: Sarah AI triggers a dial via ARI -> Customer answers -> Sarah starts the pitch.

## 2. Twilio Media Streams
If you prefer a cloud-based VOIP:
1. Use Twilio `<Stream>` TwiML.
2. Connect the WebSocket stream directly to your Sarah AI backend.
3. Use the `audio/l16;rate=8000` or `16000` format to match Gemini's requirements.
4. **Latency Tip**: Host your Sarah AI engine in the same region as your Twilio/Asterisk server (e.g., US-East-1) to minimize delay.

## 3. Vicidial Integration
To integrate with an existing Vicidial setup:
1. Configure Vicidial to route "Human Answered" calls to a specific Asterisk context.
2. In that context, trigger an AGI script or ARI application that notifies the Sarah AI Orchestration Engine.
3. Sarah AI joins the call as an "Agent" via a SIP channel or ARI bridge.

## 4. Local Hardware (FXO/FXS)
If using physical phone lines:
1. Use an **FXO Gateway** (like Grandstream) to convert analog lines to SIP.
2. Register the Sarah AI Node.js server as a SIP User Agent (using `sip.js` or `pjsip`).
3. Handle the SIP INVITE and negotiate the SDP to establish the RTP stream.

---

## Environment Configuration
When moving to production VOIP, update your `.env`:
```env
VOIP_PROVIDER=asterisk
ARI_URL=http://your-asterisk-ip:8088
ARI_USER=sarah_engine
ARI_PASS=your_secure_password
RTP_PORT_RANGE=10000-20000
```
