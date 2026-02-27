# VICIdial Integration Guide for Sarah AI

Connecting Sarah (Gemini Live AI) to VICIdial allows you to automate outbound cold calling or inbound support using your existing dialer infrastructure.

## Architecture Overview

1. **VICIdial (Asterisk)**: Handles the telephony (SIP/PSTN).
2. **WebRTC/SIP Bridge**: Connects the Asterisk audio stream to the browser.
3. **Sarah AI (Browser)**: Receives the audio via WebRTC, sends it to Gemini Live API, and plays back the response.
4. **VICIdial API**: Sarah uses the VICIdial API to update lead status (dispositions) and fetch lead details.

---

## Step 1: VICIdial Configuration

### 1.1 Create a Remote Agent or User
In VICIdial, create a user that Sarah will "log in" as. This user should have permissions to handle calls in the desired campaign.

### 1.2 Set up the External Web Variable
In your Campaign settings, set the **External Web Variable** to point to your Sarah AI URL.
Example: `https://your-sarah-app.run.app/?lead_id=--A--lead_id--B--&phone=--A--phone_number--B--`

---

## Step 2: Telephony Integration (The Bridge)

Since Gemini Live API runs in the browser, you have two main options:

### Option A: WebRTC (Recommended)
Use a WebRTC-to-SIP gateway (like **Janus Gateway** or **Asterisk's built-in WebRTC support**).
- Sarah's browser interface will register as a WebRTC phone.
- When VICIdial sends a call to the agent, the browser's `ontrack` event provides the audio stream.
- You pipe this stream into the `Gemini Live API` instead of the local microphone.

### Option B: Audio Socket Bridge
If you want to run Sarah on a server (Node.js):
- Use **Asterisk ARI (Asterisk REST Interface)** to "snoop" on a channel.
- Stream the raw PCM audio via WebSockets to a Node.js server.
- The server connects to Gemini Live API and pipes the audio back to Asterisk.

---

## Step 3: Sarah AI Code Modifications

### 3.1 Fetching Lead Data
Sarah should automatically pull lead info from the URL parameters provided by VICIdial:

```javascript
const urlParams = new URLSearchParams(window.location.search);
const leadId = urlParams.get('lead_id');
const phoneNumber = urlParams.get('phone');
```

### 3.2 Automated Dispositioning
When Sarah detects a "Hang up" or "Completed" call, she should call the VICIdial API to set the disposition (e.g., `SALE`, `NI` for Not Interested, `DNC`).

**Sarah AI Endpoints:**
- **Start Call**: `GET /api/vicidial/call-start`
- **Disposition**: `POST /api/vicidial/disposition`
- **Health Check**: `GET /api/vicidial/health`

---

## Step 4: Concurrency & Scaling

### How many concurrent agents can work?
The number of concurrent Sarah AI agents depends on three factors:

1. **Gemini API Quota**: 
   - **Free Tier**: Limited to 3 RPM (Requests Per Minute). Not suitable for production.
   - **Paid Tier**: Can be scaled to **200+ concurrent calls** by requesting a quota increase from Google Cloud.
2. **Server Resources**:
   - Each concurrent call requires approximately **50-100MB of RAM** and **0.1 vCPU** for audio processing and WebSocket management.
   - For **200 concurrent calls**, we recommend a server with at least **16 vCPUs and 32GB RAM**.
3. **VICIdial Capacity**:
   - Ensure your VICIdial server (Asterisk) has enough bandwidth and CPU to handle the SIP/RTP traffic for 200 concurrent channels.

---

## Step 5: Setting up Remote Agents in VICIdial

1. Go to **VICIdial Admin** -> **Remote Agents**.
2. Click **Add New Remote Agent**.
3. Set **User ID** (e.g., `7777`).
4. Set **Number of Lines** to your desired concurrency (e.g., `50`).
5. Set **Extension** to the SIP extension that Sarah is registered to.
6. Set **Campaign** to your outbound campaign.
7. Set **Status** to `ACTIVE`.
8. In the **Campaign Settings**, set the **Start Call URL** to:
   `https://your-sarah-app.run.app/api/vicidial/call-start?lead_id=--A--lead_id--B--&phone_number=--A--phone_number--B--`

---

## Security Note
Always use HTTPS for the Sarah AI interface and ensure your VICIdial API credentials are kept secure (use a backend proxy to hide them from the browser).
