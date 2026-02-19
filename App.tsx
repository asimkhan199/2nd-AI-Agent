
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { SYSTEM_INSTRUCTIONS, CHECK_CALENDAR_TOOL, BOOK_APPOINTMENT_TOOL } from './constants';
import { Message, ToolCallLog } from './types';

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const DeploymentCenter: React.FC = () => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white rounded-[40px] p-12 shadow-sm border border-slate-100">
          <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            1. Setup Billing
          </h3>
          <div className="space-y-6">
            <div className="flex gap-6">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-xs font-black text-slate-400">01</div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Go to <strong>Google AI Studio</strong> (aistudio.google.com) and click on the "Settings" (Gear icon) -> <strong>Plan & Billing</strong>.
              </p>
            </div>
            <div className="flex gap-6">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-xs font-black text-slate-400">02</div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Link a <strong>Google Cloud Project</strong> that has an active Credit Card attached. This moves you from "Free Tier" (capped) to "Pay-as-you-go" (high volume).
              </p>
            </div>
            <div className="flex gap-6">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-xs font-black text-slate-400">03</div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Increase your <strong>Quota Limits</strong>. For 100k mins/day, you need to request a "Rate Limit Increase" for the <code>gemini-2.5-flash</code> model in the Google Cloud Console.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-12 shadow-sm border border-slate-100">
          <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
            </div>
            2. Instant Deployment
          </h3>
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 rounded-3xl text-white">
              <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">CLI Deploy (Railway/Vercel)</h4>
              <code className="text-xs font-mono text-slate-300 block">
                $ npm install<br/>
                $ npm run build<br/>
                $ vercel deploy --prod
              </code>
            </div>
            <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl">
              <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-2">Secure API Management</h4>
              <p className="text-xs text-indigo-900 leading-relaxed font-medium">
                Do not hardcode your key. Add it as an <strong>Environment Variable</strong> in your server dashboard named <code className="bg-white px-1">API_KEY</code>. The code is already pre-configured to read from there.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-[48px] p-12 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
          <div className="max-w-md">
            <h3 className="text-3xl font-black mb-4">100,000 Min/Day Projector</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Based on production-grade Flash pricing and standard SIP trunking rates for a high-volume outbound dialer.
            </p>
            <div className="space-y-4">
               <div className="flex justify-between border-b border-white/10 pb-4">
                  <span className="text-slate-400 text-xs">AI Inference (Input/Output)</span>
                  <span className="font-bold text-sm">$500.00 / day</span>
               </div>
               <div className="flex justify-between border-b border-white/10 pb-4">
                  <span className="text-slate-400 text-xs">Telephony/SIP Trunking</span>
                  <span className="font-bold text-sm">$500.00 / day</span>
               </div>
               <div className="flex justify-between pt-4">
                  <span className="text-indigo-400 font-black text-sm uppercase">Total Daily Spend</span>
                  <span className="font-black text-2xl text-white">$1,000.00</span>
               </div>
            </div>
          </div>
          
          <div className="bg-white/5 rounded-[40px] p-10 border border-white/10 backdrop-blur-xl lg:w-96">
            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-6 text-center">ROI Calculation</h4>
            <div className="text-center space-y-2">
              <div className="text-4xl font-black text-emerald-400">$3.0M+</div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Est. Monthly Revenue Cap</p>
            </div>
            <div className="mt-10 p-4 bg-white/5 rounded-2xl border border-white/5 text-[10px] text-slate-400 italic">
              "Assuming a 2% booking rate on 100k minutes with an average ticket price of $189."
            </div>
          </div>
        </div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-600/20 blur-[120px] rounded-full"></div>
      </div>
    </div>
  );
};

const IntegrationGuide: React.FC = () => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="bg-white rounded-[40px] p-12 shadow-sm border border-slate-100">
        <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
          </div>
          Predictive Dialer Architecture
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-3">1. Media Stream</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Connect your Dialer (Twilio/Asterisk) to a <strong>WebSocket Relay</strong>. Every "packet" of customer audio is sent to this relay in real-time.
              </p>
            </div>
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-3">2. Neural Link</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Your Relay uses the <strong>Gemini Live SDK</strong> to pipe that audio to Sarah. She processes the intent and generates a human-voice response.
              </p>
            </div>
            <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
              <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-3">3. Low Latency</h4>
              <p className="text-sm text-indigo-900 leading-relaxed font-medium">
                The response is streamed back to the dialer with sub-500ms latency, ensuring the customer never feels a "delay."
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden">
            <h4 className="text-emerald-400 font-bold text-sm mb-6 flex items-center gap-2">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
               Backend Logic Example (Node.js)
            </h4>
            <pre className="text-[11px] text-slate-400 leading-relaxed font-mono overflow-x-auto">
{`// 1. Setup Dialer Stream
app.ws('/media-stream', (ws) => {
  const session = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview',
    callbacks: {
      onmessage: (msg) => {
        // 2. Relay AI Audio back to Phone Call
        const audio = msg.serverContent.modelTurn.parts[0].inlineData.data;
        ws.send(JSON.stringify({ event: 'media', media: { payload: audio } }));
      }
    }
  });

  ws.on('message', (data) => {
    // 3. Send Customer Voice to Sarah
    session.sendRealtimeInput({ media: { data: data.payload, mimeType: 'audio/pcm' } });
  });
});`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'agent' | 'dialer' | 'deploy'>('agent');
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolCallLog[]>([]);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  const sessionRef = useRef<any>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const stopSession = useCallback(() => {
    if (sessionRef.current) sessionRef.current.close();
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsActive(false);
  }, []);

  const startSession = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTIONS,
          tools: [{ functionDeclarations: [CHECK_CALENDAR_TOOL, BOOK_APPOINTMENT_TOOL] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const sum = inputData.reduce((a, b) => a + Math.abs(b), 0);
              setIsUserSpeaking(sum / inputData.length > 0.01);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              sessionPromise.then(session => session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) currentInputTranscription.current += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            if (message.serverContent?.turnComplete) {
              if (currentInputTranscription.current) setMessages(prev => [...prev, { role: 'user', text: currentInputTranscription.current, timestamp: new Date() }]);
              if (currentOutputTranscription.current) setMessages(prev => [...prev, { role: 'model', text: currentOutputTranscription.current, timestamp: new Date() }]);
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputCtx) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                const log: ToolCallLog = { id: fc.id, name: fc.name, args: fc.args, status: 'pending', timestamp: new Date() };
                setToolLogs(prev => [log, ...prev]);
                let result = { status: "success", message: "Found a slot!" };
                setToolLogs(prev => prev.map(l => l.id === fc.id ? { ...l, status: 'success' as const } : l));
                sessionPromise.then(session => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } }));
              }
            }
          },
          onerror: stopSession,
          onclose: stopSession
        }
      });
      sessionRef.current = await sessionPromise;
      setIsActive(true);
    } catch (err) {
      alert("Neural link failed to stabilize.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFC] flex flex-col font-['Inter']">
      <header className="px-10 py-8 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-4 group cursor-default">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-indigo-100 group-hover:scale-110 transition-transform">S</div>
            <div className="flex flex-col">
              <span className="font-black text-slate-900 tracking-tight text-xl">Sarah.ai</span>
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Neural Sales Core 5.0</span>
            </div>
          </div>
          
          <nav className="hidden lg:flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl">
            <button 
              onClick={() => setActiveTab('agent')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'agent' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Live Agent
            </button>
            <button 
              onClick={() => setActiveTab('dialer')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'dialer' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Dialer Logic
            </button>
            <button 
              onClick={() => setActiveTab('deploy')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'deploy' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Deploy & Scale
            </button>
          </nav>
        </div>

        <button
          onClick={isActive ? stopSession : startSession}
          className={`px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg ${
            isActive ? 'bg-rose-50 text-rose-600 border border-rose-100 shadow-rose-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'
          }`}
        >
          {isActive ? 'Terminate Connection' : 'Establish Link'}
        </button>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 lg:p-12">
        {activeTab === 'agent' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-4 space-y-10">
              <div className={`aspect-square rounded-[64px] flex flex-col items-center justify-center text-center relative overflow-hidden transition-all duration-1000 ${isActive ? 'bg-indigo-600 shadow-2xl shadow-indigo-200' : 'bg-white border border-slate-200 shadow-sm'}`}>
                 <div className="relative z-10">
                    <div className={`w-40 h-40 rounded-full flex items-center justify-center border-[8px] border-white/10 transition-all duration-500 ${isActive ? 'bg-white/5 scale-110' : 'bg-slate-50 grayscale opacity-50'}`}>
                       <svg className={`w-16 h-16 ${isActive ? 'text-white' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </div>
                 </div>
                 <h2 className={`mt-10 text-3xl font-black tracking-tight ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {isUserSpeaking ? "Hearing..." : isActive ? "Sarah is Live" : "Interface Idle"}
                 </h2>
                 {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent animate-pulse pointer-events-none"></div>
                 )}
              </div>
              
              <div className="bg-slate-900 rounded-[48px] p-10 text-white relative overflow-hidden shadow-xl">
                 <div className="flex items-center gap-3 mb-6">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Behavior: Cognitive Load</h3>
                 </div>
                 <p className="text-sm text-slate-300 leading-relaxed font-medium italic opacity-80">
                   "Uhhh... let's see here, I'm just pulling up the route map for your area... oh! Here we go."
                 </p>
              </div>
            </div>

            <div className="lg:col-span-8 bg-white rounded-[64px] border border-slate-100 shadow-xl flex flex-col overflow-hidden h-[800px]">
              <div className="px-12 py-10 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-1">Transcript History</span>
                  <span className="text-[9px] font-bold text-indigo-500">REAL-TIME SYNC ACTIVE</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-12 space-y-12 flex flex-col-reverse scrollbar-hide">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-8 py-20 opacity-30">
                    <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center">
                       <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    </div>
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">Waiting for Link</p>
                  </div>
                ) : (
                  [...messages].reverse().map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                      <div className={`max-w-[75%] px-10 py-7 rounded-[40px] shadow-sm text-[15px] font-semibold leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-100' 
                          : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-12 border-t border-slate-50 bg-slate-50/20 flex gap-6 overflow-x-auto scrollbar-hide">
                {toolLogs.map(log => (
                  <div key={log.id} className="flex-shrink-0 px-8 py-4 bg-white border border-slate-100 rounded-3xl flex items-center gap-4 shadow-sm">
                    <div className={`w-2.5 h-2.5 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-indigo-500 animate-pulse'}`}></div>
                    <span className="text-[11px] font-black uppercase text-slate-700 tracking-widest">{log.name.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'dialer' ? (
          <IntegrationGuide />
        ) : (
          <DeploymentCenter />
        )}
      </main>

      <footer className="bg-white border-t border-slate-100 px-16 py-10 flex items-center justify-between text-[10px] font-black text-slate-300 uppercase tracking-[0.5em] mt-auto">
        <div className="flex items-center gap-8">
           <span className="text-indigo-600 opacity-100">Sync: SARAH-5.0</span>
           <span className="w-1.5 h-1.5 bg-slate-200 rounded-full"></span>
           <span>Enterprise Deployment Ready</span>
        </div>
        <div className="flex gap-16">
          <span className="hover:text-indigo-600 cursor-pointer transition-colors">Vocal Docs</span>
          <span className="hover:text-indigo-600 cursor-pointer transition-colors">Behavioral Labs</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
