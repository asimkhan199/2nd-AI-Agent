
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { io, Socket } from 'socket.io-client';
import { getSystemInstructions, CHECK_CALENDAR_TOOL, BOOK_APPOINTMENT_TOOL, END_CALL_TOOL } from './constants';
import { CallSession, CallDisposition } from './types';
import { OrchestrationDashboard } from './src/components/Dashboard';
import { Play, PhoneOff, Users, X, Settings } from 'lucide-react';

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode.apply(null, bytes as any));
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
  // Use a DataView or explicit offset/length to ensure alignment
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
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

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'>('Kore');
  const [showSettings, setShowSettings] = useState(false);
  const [callLogs, setCallLogs] = useState<{ id: string; reason: string; timestamp: string }[]>([]);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [silenceDuration, setSilenceDuration] = useState(0);
  const [isSafetyHangup, setIsSafetyHangup] = useState(false);
  const [leadInfo, setLeadInfo] = useState<{ id: string; name: string; phone: string; address: string } | null>(null);
  
  // Orchestration State
  const [activeCalls, setActiveCalls] = useState<CallSession[]>([]);
  const [dispositions, setDispositions] = useState<CallDisposition[]>([]);
  const [isCampaignActive, setIsCampaignActive] = useState(false);
  const [listeningToId, setListeningToId] = useState<string | null>(null);
  const [uploadedLeads, setUploadedLeads] = useState<any[]>([]);
  const [customRebuttals, setCustomRebuttals] = useState<string>("");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0 });
  const [dailyCost, setDailyCost] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const voiceCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const spokenLinesRef = useRef<Set<string>>(new Set());

  // --- Real-Time Backend Sync ---
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('init', (data) => {
      setUploadedLeads(new Array(data.leads.total).fill({}));
      setActiveCalls(data.activeCalls);
      setDispositions(data.dispositions);
      setAppointments(data.appointments);
    });

    socket.on('call:started', (call) => {
      setActiveCalls(prev => [call, ...prev]);
    });

    socket.on('call:ended', (disposition) => {
      setActiveCalls(prev => prev.filter(c => c.id !== disposition.id));
      setDispositions(prev => [disposition, ...prev].slice(0, 100));
    });

    socket.on('leads:update', (data) => {
      setUploadedLeads(new Array(data.total).fill({}));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Handle simulation audio with high-quality Gemini TTS to match Test Call quality
  useEffect(() => {
    if (!listeningToId || !isCampaignActive) {
      window.speechSynthesis.cancel();
      return;
    }
    
    const call = activeCalls.find(c => c.id === listeningToId);
    if (!call || call.transcript.length === 0) return;
    
    const lastLine = call.transcript[call.transcript.length - 1];
    const lineId = `${call.id}-${call.transcript.length}-${lastLine}`;
    
    if (!spokenLinesRef.current.has(lineId)) {
      spokenLinesRef.current.add(lineId);
      const parts = lastLine.split(': ');
      const speaker = parts[0];
      const text = parts.slice(1).join(': ');
      if (!text) return;

      const playHighQualityTts = async () => {
        const isSarah = speaker === 'Sarah';
        const voiceName = isSarah ? selectedVoice : (selectedVoice === 'Zephyr' ? 'Kore' : 'Zephyr');
        const cacheKey = `${voiceName}-${text.toLowerCase().trim()}`;

        // 1. Check Intelligent Cache first to save API costs
        if (voiceCacheRef.current.has(cacheKey)) {
          const cachedBuffer = voiceCacheRef.current.get(cacheKey)!;
          const ctx = outputAudioContextRef.current!;
          const source = ctx.createBufferSource();
          source.buffer = cachedBuffer;
          source.connect(ctx.destination);
          source.start();
          setCacheStats(prev => ({ ...prev, hits: prev.hits + 1 }));
          return;
        }

        try {
          setCacheStats(prev => ({ ...prev, misses: prev.misses + 1 }));
          const ttsCost = 0.005; // $0.005 per TTS generation
          setDailyCost(prev => prev + ttsCost);
          
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          // Use the high-quality TTS model to match the "Test Call" Sarah
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          });

          if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
            const base64Audio = response.candidates[0].content.parts[0].inlineData.data;
            const audioData = decode(base64Audio);
            
            if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
              outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            const ctx = outputAudioContextRef.current;
            
            const audioBuffer = await decodeAudioData(audioData, ctx, 24000, 1);
            
            // 2. Train the system: Store in cache for future reuse
            voiceCacheRef.current.set(cacheKey, audioBuffer);
            
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.start();
          } else {
            throw new Error("No audio data");
          }
        } catch (error: any) {
          // Check for rate limit (429) and fallback silently to system TTS
          if (error?.message?.includes('429') || error?.status === 429) {
            console.warn("Gemini TTS Rate Limit hit, falling back to system voice.");
          } else {
            console.error("TTS Error:", error);
          }
          
          const utterance = new SpeechSynthesisUtterance(text);
          // Use more natural sounding system voices if available
          const voices = window.speechSynthesis.getVoices();
          const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Premium')) || voices[0];
          if (preferredVoice) utterance.voice = preferredVoice;
          
          utterance.pitch = speaker === 'Sarah' ? 1.1 : 0.9;
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      };

      playHighQualityTts();
    }
  }, [activeCalls, listeningToId, selectedVoice, isCampaignActive]);

  const sessionRef = useRef<any>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  useEffect(() => {
    // Simulate fetching lead data from VICIdial URL parameters
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get('lead_id');
    if (leadId) {
      setLeadInfo({
        id: leadId,
        name: params.get('name') || "John Doe",
        phone: params.get('phone') || "555-0123",
        address: params.get('address') || "123 Neighborhood St"
      });
    } else {
      // Demo data if no params
      setLeadInfo({
        id: "DEMO-99",
        name: "Prospective Homeowner",
        phone: "416-555-0199",
        address: "Oakville, ON"
      });
    }
  }, []);

  const stopSession = useCallback(() => {
    setIsActive(false);
    setIsModelSpeaking(false);
    setIsUserSpeaking(false);
    setListeningToId(null);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      try { inputAudioContextRef.current.close(); } catch (e) {}
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      try { outputAudioContextRef.current.close(); } catch (e) {}
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    // If silence persists for too long and Sarah hasn't acted, the client takes over
    if (silenceDuration > 12 && isActive) {
      setIsSafetyHangup(true);
      setLastAction("Neural Timeout: Sarah failed to detect hangup. Forcing disconnect.");
      setCallLogs(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        reason: 'hung_up_auto',
        timestamp: new Date().toLocaleTimeString()
      }, ...prev]);
      
      setTimeout(() => {
        stopSession();
        setIsSafetyHangup(false);
        setLastAction(null);
      }, 3000);
    }
  }, [silenceDuration, isActive, stopSession]);

  // Campaign Simulation Logic removed in favor of backend dialer
  useEffect(() => {
    if (!isCampaignActive) {
      setActiveCalls(prev => prev.filter(c => c.isLive));
      setListeningToId(null);
      window.speechSynthesis.cancel();
      spokenLinesRef.current.clear();
    }
  }, [isCampaignActive]);

  const startSession = async () => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key not found. Please ensure it is set in the environment.");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Setup Recording
      const recorderDest = outputCtx.createMediaStreamDestination();
      const userSource = outputCtx.createMediaStreamSource(stream);
      userSource.connect(recorderDest);
      analyser.connect(recorderDest);

      const mediaRecorder = new MediaRecorder(recorderDest.stream);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        
        // Update the last disposition if it was waiting for a recording
        setDispositions(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          if (updated[0].recordingUrl === 'generating...') {
            updated[0] = { ...updated[0], recordingUrl: url };
          }
          return updated;
        });

        // Update the last appointment if it was waiting for a recording
        setAppointments(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          if (updated[0].recordingUrl === 'generating...') {
            updated[0] = { ...updated[0], recordingUrl: url };
          }
          return updated;
        });
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: getSystemInstructions(customRebuttals),
          tools: [{ functionDeclarations: [CHECK_CALENDAR_TOOL, BOOK_APPOINTMENT_TOOL, END_CALL_TOOL] }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { 
                voiceName: selectedVoice
              } 
            },
          },
        },
        callbacks: {
          onopen: () => {
            sessionPromise.then(session => {
              // Trigger Sarah to start the conversation
              try {
                (session as any).sendRealtimeInput({
                  text: "Hi Sarah, you are now live on a call with a homeowner. Please start the conversation by introducing yourself and your offer as per your instructions."
                });
              } catch (e) {
                console.warn("Could not send initial text trigger:", e);
              }

              const source = inputCtx.createMediaStreamSource(stream);
              const scriptProcessor = inputCtx.createScriptProcessor(2048, 1, 1);
              scriptProcessorRef.current = scriptProcessor;
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const sum = inputData.reduce((a, b) => a + Math.abs(b), 0);
                const volume = sum / inputData.length;
                const isSpeaking = volume > 0.01;
                setIsUserSpeaking(isSpeaking);
                
                if (!isSpeaking && isActive) {
                  setSilenceDuration(prev => prev + (2048 / 16000));
                } else {
                  setSilenceDuration(0);
                }
                
                const int16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  // Add tiny dither to keep the model's VAD active during silence
                  const dither = (Math.random() - 0.5) * 0.0002;
                  int16[i] = (inputData[i] + dither) * 32768;
                }
                
                session.sendRealtimeInput({ 
                  media: { 
                    data: encode(new Uint8Array(int16.buffer)), 
                    mimeType: 'audio/pcm;rate=16000' 
                  } 
                });
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputCtx.destination);
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            console.log("[Sarah] Message received:", message);
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputCtx && analyserRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const decodedData = decode(audioData);
              const buffer = await decodeAudioData(decodedData, outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              
              source.connect(analyserRef.current);
              analyserRef.current.connect(outputCtx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsModelSpeaking(false);
                }
              });
              
              setIsModelSpeaking(true);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            if ((message as any).serverContent?.modelTurn?.parts[0]?.text) {
              const text = (message as any).serverContent.modelTurn.parts[0].text;
              currentOutputTranscription.current += text;
              setActiveCalls(prev => prev.map(c => c.id === 'live-session' ? {
                ...c,
                status: 'AI_SPEAKING',
                transcript: [...c.transcript.slice(-10), `Sarah: ${text}`]
              } : c));
            }

            if ((message as any).serverContent?.userTurn?.parts[0]?.text) {
              const text = (message as any).serverContent.userTurn.parts[0].text;
              currentInputTranscription.current += text;
              setActiveCalls(prev => prev.map(c => c.id === 'live-session' ? {
                ...c,
                status: 'CUSTOMER_SPEAKING',
                transcript: [...c.transcript.slice(-10), `Customer: ${text}`]
              } : c));
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'end_call') {
                  const reason = (fc.args as any).reason || 'unknown';
                  setLastAction(`Sarah detected: ${reason.replace('_', ' ')}`);
                  setCallLogs(prev => [{
                    id: Math.random().toString(36).substr(2, 9),
                    reason: reason,
                    timestamp: new Date().toLocaleTimeString()
                  }, ...prev]);
                  
                  // Generate disposition
                  const isBooked = reason === 'completed';
                  const finalRecordingUrl = isBooked ? (recordingUrl || (mediaRecorderRef.current?.state === 'inactive' ? undefined : 'generating...')) : undefined;
                  
                  setDispositions(d => [{
                    LeadName: leadInfo?.name || "Prospective Homeowner",
                    Phone: leadInfo?.phone || "416-555-0199",
                    Disposition: isBooked ? 'Hot' : 'Not Interested',
                    ConvertibleScore: isBooked ? 95 : 20,
                    BookingProbability: isBooked ? "High" : "Low",
                    ObjectionType: reason === 'hung_up' ? "Disconnected" : "None",
                    Sentiment: 'Neutral',
                    AppointmentBooked: isBooked,
                    AppointmentDate: isBooked ? "2024-03-25" : "",
                    FollowUpRequired: !isBooked,
                    CallDurationSeconds: Math.floor(silenceDuration),
                    Summary: `Call ended with status: ${reason}.`,
                    recordingUrl: finalRecordingUrl || undefined
                  }, ...d]);

                  setActiveCalls(prev => prev.filter(c => c.id !== 'live-session'));
                  
                  setTimeout(() => {
                    stopSession();
                    setLastAction(null);
                  }, 3000);
                  continue;
                }

                if (fc.name === 'book_appointment') {
                  const args = fc.args as any;
                  const newAppt = {
                    id: Math.random().toString(36).substr(2, 9),
                    firstName: args.first_name,
                    lastName: args.last_name,
                    address: args.full_address,
                    phone: args.home_phone,
                    time: args.appointment_time,
                    price: args.price,
                    recordingUrl: recordingUrl || 'generating...',
                    description: `Air Duct Cleaning for ${args.first_name} ${args.last_name}. Price: ${args.price}. Driveway: ${args.has_driveway ? 'Yes' : 'No'}. DNC Permission: ${args.dnc_permission_granted ? 'Yes' : 'No'}.`
                  };
                  setAppointments(prev => [newAppt, ...prev]);
                  setLastAction(`Booking Confirmed for ${args.first_name}!`);
                }

                setTimeout(() => {
                  let result = { status: "success", message: "Action completed." };
                  sessionPromise.then(session => {
                    session.sendToolResponse({ 
                      functionResponses: { id: fc.id, name: fc.name, response: { result } } 
                    });
                  });
                }, 1000);
              }
            }
          },
          onerror: (e) => {
            console.error("Live session error:", e);
            stopSession();
          },
          onclose: () => {
            console.log("Live session closed.");
            stopSession();
          }
        }
      });
            sessionRef.current = await sessionPromise;
            setIsActive(true);

            // Add to active calls, ensuring no duplicates
            const newCall: CallSession = {
              id: 'live-session',
              leadName: leadInfo?.name || "Prospective Homeowner",
              phone: leadInfo?.phone || "416-555-0199",
              address: leadInfo?.address || "Oakville, ON",
              startTime: Date.now(),
              duration: 0,
              status: 'AI_SPEAKING',
              transcript: [],
              sentiment: 'Neutral',
              convertibleScore: 50,
              isLive: true,
              cost: 0
            };
            setActiveCalls(prev => {
              const exists = prev.some(c => c.id === 'live-session');
              if (exists) return prev;
              return [newCall, ...prev];
            });
    } catch (err: any) {
      console.error("Start session failed:", err);
      alert("Microphone access is required for the voice agent.");
    }
  };

  const handleWhisper = (id: string) => {
    setLastAction(`Whispering to agent on call ${id}...`);
    setActiveCalls(prev => prev.map(c => c.id === id ? { ...c, status: 'WHISPER' } : c));
    setTimeout(() => setLastAction(null), 3000);
  };

  const handleTakeover = (id: string) => {
    setLastAction(`Taking over call ${id}...`);
    setActiveCalls(prev => prev.map(c => c.id === id ? { 
      ...c, 
      status: 'TAKEOVER',
      transcript: [...c.transcript, "Sarah: Let me transfer you to my supervisor to finalize this."]
    } : c));
    
    // In a real takeover, we would bridge the supervisor's audio here.
    // For the demo, we just update the transcript to show the handoff.
    
    setTimeout(() => setLastAction(null), 3000);
  };

  const handleStopCall = (id: string) => {
    if (id === listeningToId) {
      setListeningToId(null);
      window.speechSynthesis.cancel();
    }
    
    if (id === 'live-session') {
      stopSession();
    } else {
      setActiveCalls(prev => prev.filter(c => c.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col overflow-hidden">
      {/* Orchestration Dashboard */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <OrchestrationDashboard 
          activeCalls={activeCalls}
          dispositions={dispositions}
          onWhisper={handleWhisper}
          onTakeover={handleTakeover}
          onListen={(id) => {
            setListeningToId(id === listeningToId ? null : id);
            setLastAction(id === listeningToId ? "Stopped listening" : `Listening to call ${id}...`);
          }}
          onStop={handleStopCall}
          onStartLive={startSession}
          onStopLive={stopSession}
          cacheStats={cacheStats}
          onUploadLeads={async (leads) => {
            try {
              const res = await fetch('/api/leads/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leads })
              });
              if (res.ok) {
                setLastAction(`Database Updated: ${leads.length} Leads Ready for Sarah.`);
              }
            } catch (err) {
              console.error("Upload failed:", err);
            }
            setTimeout(() => setLastAction(null), 3000);
          }}
          customRebuttals={customRebuttals}
          onUpdateRebuttals={(text) => {
            setCustomRebuttals(text);
            setLastAction("Sarah's Brain Updated with New Rebuttals.");
            setTimeout(() => setLastAction(null), 3000);
          }}
          dailyCost={dailyCost}
          isLiveActive={isActive}
          listeningToId={listeningToId}
          appointments={appointments}
          onUpdateAppointments={setAppointments}
          uploadedLeads={uploadedLeads}
        />
      </div>

      {/* Control Bar */}
      <div className="bg-black/40 border-t border-white/5 p-6 flex items-center justify-between backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <button
            onClick={isActive ? stopSession : startSession}
            className={`px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-3 shadow-2xl ${
              isActive 
                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' 
                : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-indigo-500/20'
            }`}
          >
            {isActive ? <PhoneOff className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isActive ? "End Live Session" : "Start Live Session"}
          </button>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-white/30 uppercase font-black">System Load</span>
            <span className="text-xs font-mono font-bold text-emerald-400">Optimal</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-white/30 uppercase font-black">AI Agents</span>
            <span className="text-xs font-mono font-bold text-white">20 Ready</span>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all"
          >
            <Settings className="w-5 h-5 text-white/40" />
          </button>
        </div>
      </div>

      {/* Settings Overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-md rounded-[2.5rem] p-10 relative shadow-2xl">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-8 right-8 text-white/20 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-8">Agent Config</h2>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block">Voice Profile</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map((voice) => (
                    <button
                      key={voice}
                      onClick={() => setSelectedVoice(voice as any)}
                      className={`py-3 rounded-xl text-[10px] font-bold uppercase transition-all border ${
                        selectedVoice === voice ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' : 'bg-white/5 border-white/5 text-white/40 hover:text-white'
                      }`}
                    >
                      {voice}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Intelligence / Action Toast */}
      {lastAction && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] bg-indigo-500 text-white px-8 py-4 rounded-2xl shadow-2xl animate-bounce font-black text-xs uppercase tracking-widest">
          {lastAction}
        </div>
      )}
    </div>
  );
};

export default App;
