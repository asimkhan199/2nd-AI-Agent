
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { io, Socket } from 'socket.io-client';
import JsSIP from 'jssip';
import { getSystemInstructions, CHECK_CALENDAR_TOOL, BOOK_APPOINTMENT_TOOL, END_CALL_TOOL } from './constants';
import { CallSession, CallDisposition } from './types';
import { OrchestrationDashboard } from './src/components/Dashboard';
import { Play, PhoneOff, Users, X, Settings, MicOff } from 'lucide-react';

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
  const [sensitivity, setSensitivity] = useState(2.5);
  const [showSettings, setShowSettings] = useState(false);
  const [callLogs, setCallLogs] = useState<{ id: string; reason: string; timestamp: string }[]>([]);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [silenceDuration, setSilenceDuration] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isSafetyHangup, setIsSafetyHangup] = useState(false);
  const [leadInfo, setLeadInfo] = useState<{ id: string; name: string; phone: string; address: string } | null>(null);
  
  // Orchestration State
  const [activeCalls, setActiveCalls] = useState<CallSession[]>([]);
  const [dispositions, setDispositions] = useState<CallDisposition[]>([]);
  const [isCampaignActive, setIsCampaignActive] = useState(false);
  const [listeningToId, setListeningToId] = useState<string | null>(null);
  const [uploadedLeads, setUploadedLeads] = useState<any[]>([]);
  const [customRebuttals, setCustomRebuttals] = useState<string>("");
  const [agentName, setAgentName] = useState<string>("Sarah");
  const [scriptOffer, setScriptOffer] = useState<string>("We're doing a full-house air duct cleaning for just $129.");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0 });
  const [dailyCost, setDailyCost] = useState(0);
  const [sipLogs, setSipLogs] = useState<any[]>([]);
  const [webrtcStatus, setWebrtcStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const lastConnectTimeRef = useRef<number>(0);
  const socketRef = useRef<Socket | null>(null);
  const voiceCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const spokenLinesRef = useRef<Set<string>>(new Set());

  const [dialerConfig, setDialerConfig] = useState<any>(() => {
    const saved = localStorage.getItem('dialer_config');
    if (saved) return JSON.parse(saved);
    return {
      concurrency: 5,
      activeAgents: 20,
      sipServer: '93.127.128.38',
      sipPort: '5060',
      sipUser: '78624',
      sipPass: 'test',
      wsUrl: 'wss://93.127.128.38:8089/ws',
      webrtcUser: '78624',
      webrtcPass: 'test',
      status: 'idle',
      profileName: 'Farrukh bhai'
    };
  });

  const [sipProfiles, setSipProfiles] = useState<any[]>(() => {
    const saved = localStorage.getItem('sip_profiles');
    if (saved) return JSON.parse(saved);
    return [{
      id: 'default-farrukh',
      name: 'Farrukh bhai',
      server: '93.127.128.38',
      port: '5060',
      user: '78624',
      pass: 'test',
      wsUrl: 'wss://93.127.128.38:8089/ws',
      webrtcUser: '78624',
      webrtcPass: 'test'
    }];
  });

  useEffect(() => {
    localStorage.setItem('dialer_config', JSON.stringify(dialerConfig));
  }, [dialerConfig]);

  useEffect(() => {
    localStorage.setItem('sip_profiles', JSON.stringify(sipProfiles));
  }, [sipProfiles]);

  useEffect(() => {
    // Auto-connect SIP on start
    const timer = setTimeout(() => {
      if (webrtcStatus === 'disconnected') {
        setReconnectTrigger(prev => prev + 1);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // --- Real-Time Backend Sync ---
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('init', (data) => {
      console.log("[SOCKET] Init data received:", data.dialerConfig);
      setUploadedLeads(new Array(data.leads?.total || 0).fill({}));
      setActiveCalls(data.activeCalls || []);
      setDispositions(data.dispositions || []);
      setAppointments(data.appointments || []);
      if (data.dialerConfig) {
        setDialerConfig(prev => {
          // If we have a local config that is different from server, 
          // we might want to prioritize server if it's a fresh load
          if (JSON.stringify(prev) === JSON.stringify(data.dialerConfig)) return prev;
          console.log("[SOCKET] Updating dialerConfig from server init");
          return data.dialerConfig;
        });
        setIsCampaignActive(data.dialerConfig.status === 'active');
      }
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

    socket.on('config:update', (config) => {
      setDialerConfig(prev => {
        if (JSON.stringify(prev) === JSON.stringify(config)) return prev;
        return config;
      });
      setIsCampaignActive(config.status === 'active');
    });

    socket.on('dialerConfigUpdate', (newConfig) => {
      setDialerConfig(prev => {
        if (JSON.stringify(prev) === JSON.stringify(newConfig)) return prev;
        return newConfig;
      });
    });

    socket.on('appointment:new', (appt) => {
      setAppointments(prev => {
        if (prev.some(a => a.id === appt.id)) return prev;
        return [appt, ...prev];
      });
      triggerNotification(
        `🎉 New Booking: ${appt.firstName}!`,
        `Appointment confirmed for ${appt.time} at ${appt.address}. Price: ${appt.price}`
      );
    });

    socket.on('sip:log', (logs) => {
      setSipLogs(prev => [...prev, ...(Array.isArray(logs) ? logs : [logs])].slice(-50));
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
    if (!call || !call.transcript || call.transcript.length === 0) return;
    
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
  const sipUaRef = useRef<any>(null);
  const sipSessionRef = useRef<any>(null);
  const sarahVoiceDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const isActiveRef = useRef(false);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  const isSipCallRef = useRef(false);
  const noiseFloorRef = useRef(0.001);

  const forceInterrupt = useCallback(() => {
    console.log("[Sarah] Manual interruption triggered.");
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsModelSpeaking(false);
    setLastAction("Sarah Silenced");
    setTimeout(() => setLastAction(""), 2000);
  }, []);

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
    console.log("[Sarah] Aggressive session stop initiated...");
    setIsActive(false);
    isActiveRef.current = false;
    setIsModelSpeaking(false);
    setIsUserSpeaking(false);
    setListeningToId(null);
    isSipCallRef.current = false;
    setActiveCalls(prev => prev.filter(c => c.id !== 'live-session'));
    window.speechSynthesis.cancel();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
      mediaRecorderRef.current = null;
    }
    if (sessionRef.current) {
      if ((sessionRef.current as any)._keepAliveInterval) {
        clearInterval((sessionRef.current as any)._keepAliveInterval);
      }
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    if (sipSessionRef.current) {
      const sessionToTerminate = sipSessionRef.current;
      sipSessionRef.current = null;
      try { 
        console.log("[SIP] Terminating session...");
        sessionToTerminate.terminate(); 
      } catch (e) {
        console.warn("[SIP] Session terminate failed:", e);
      }
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
    setSilenceDuration(0);
    
    // Clear any pending audio element
    const remoteAudio = document.getElementById('sarah-remote-audio') as HTMLAudioElement;
    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!isActive && activeCalls.some(c => c.id === 'live-session')) {
      setActiveCalls(prev => prev.filter(c => c.id !== 'live-session'));
    }
  }, [isActive, activeCalls]);

  useEffect(() => {
    // If silence persists for too long and Sarah hasn't acted, the client takes over
    if (silenceDuration > 45 && isActive) {
      setIsSafetyHangup(true);
      setLastAction("Neural Timeout: Silence detected. Forcing disconnect.");
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

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const triggerNotification = (title: string, body: string) => {
    setLastAction(title);
    setTimeout(() => setLastAction(null), 5000);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://picsum.photos/seed/sarah/100/100'
      });
    }
  };

  const getSilentStream = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dst = ctx.createMediaStreamDestination();
      // Generate a tiny bit of noise to keep the stream "alive" for some SIP stacks
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      return dst.stream;
    } catch (e) {
      console.error("Failed to create silent stream:", e);
      return null;
    }
  };

  const startSession = async (incomingStream?: MediaStream): Promise<void> => {
    if (isActiveRef.current) {
      console.warn("[Sarah] Session already active, ignoring start request.");
      return;
    }
    
    try {
      console.log("[Sarah] Starting session...", incomingStream ? "SIP Call" : "Local Test");
      isActiveRef.current = true;
      setIsActive(true);
      
      isSipCallRef.current = !!incomingStream;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key not found. Please ensure it is set in the environment.");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Ensure the incoming stream is compatible with the input context
      // If it's a SIP stream, we might need to pipe it through a MediaStreamSource in the same context
      await inputCtx.resume();
      await outputCtx.resume();
      
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      // Create a destination for Sarah's voice to send back to SIP
      const sarahVoiceDest = outputCtx.createMediaStreamDestination();
      sarahVoiceDestRef.current = sarahVoiceDest;

      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const stream = incomingStream || await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[Sarah] Using audio stream:", stream.id, "Tracks:", stream.getAudioTracks().length);
      if (incomingStream) {
        console.log("[Sarah] SIP Remote Stream tracks:", incomingStream.getAudioTracks().map(t => `${t.label} (${t.enabled ? 'enabled' : 'disabled'})`));
      }

      // Setup Recording (Both Sarah and User)
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
          systemInstruction: getSystemInstructions(customRebuttals, agentName, scriptOffer),
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
            // Keep-alive interval to prevent timeouts
            const keepAlive = setInterval(() => {
              if (sessionRef.current) {
                try {
                  (sessionRef.current as any).sendRealtimeInput({
                    text: "keep-alive"
                  });
                } catch (e) {}
              }
            }, 30000); // Every 30 seconds

            sessionPromise.then(session => {
              (session as any)._keepAliveInterval = keepAlive;
              // Trigger Sarah to start the conversation
              try {
                (session as any).sendRealtimeInput({
                  text: "Hi Sarah, you are now live on a call with a homeowner. Please start the conversation by introducing yourself and your offer as per your instructions."
                });
              } catch (e) {
                console.warn("Could not send initial text trigger:", e);
              }

              // Hard fix for remote audio: create a hidden audio element to keep the stream active
              // We use a global-ish element to avoid GC issues
              let remoteAudio = document.getElementById('sarah-remote-audio') as HTMLAudioElement;
              if (!remoteAudio) {
                remoteAudio = document.createElement('audio');
                remoteAudio.id = 'sarah-remote-audio';
                remoteAudio.style.display = 'none';
                document.body.appendChild(remoteAudio);
              }
              remoteAudio.srcObject = stream;
              remoteAudio.muted = false; // Try unmuted but volume 0
              remoteAudio.volume = 0;
              remoteAudio.play().catch(e => console.warn("[Sarah] Audio play failed:", e));

              const source = inputCtx.createMediaStreamSource(stream);
              
              // Add a compressor to normalize input (makes quiet voices louder)
              const compressor = inputCtx.createDynamicsCompressor();
              compressor.threshold.setValueAtTime(-60, inputCtx.currentTime); // More sensitive
              compressor.knee.setValueAtTime(30, inputCtx.currentTime);
              compressor.ratio.setValueAtTime(20, inputCtx.currentTime); // More aggressive compression
              compressor.attack.setValueAtTime(0.003, inputCtx.currentTime);
              compressor.release.setValueAtTime(0.25, inputCtx.currentTime);

              // Add a gain node to boost input significantly
              const inputGain = inputCtx.createGain();
              inputGain.gain.value = 8.0; // Strong but clean boost
              
              source.connect(compressor);
              compressor.connect(inputGain);
              
              // Add a limiter to prevent clipping after the gain
              const limiter = inputCtx.createDynamicsCompressor();
              limiter.threshold.setValueAtTime(-1, inputCtx.currentTime);
              limiter.knee.setValueAtTime(0, inputCtx.currentTime);
              limiter.ratio.setValueAtTime(20, inputCtx.currentTime);
              limiter.attack.setValueAtTime(0, inputCtx.currentTime);
              limiter.release.setValueAtTime(0.1, inputCtx.currentTime);
              
              inputGain.connect(limiter);

              const scriptProcessor = inputCtx.createScriptProcessor(1024, 1, 1);
              scriptProcessorRef.current = scriptProcessor;
              let debugCount = 0;
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const sum = inputData.reduce((a, b) => a + Math.abs(b), 0);
                const volume = sum / inputData.length;
                setCurrentVolume(volume);
                
                // Update noise floor slowly (adaptive VAD)
                noiseFloorRef.current = noiseFloorRef.current * 0.995 + volume * 0.005;
                
                // Sensitivity: User is speaking if volume is significantly above noise floor
                const isSpeaking = volume > (noiseFloorRef.current * sensitivity) + 0.0002;
                setIsUserSpeaking(isSpeaking);
                
                // CLIENT-SIDE BARGE-IN: If user speaks while Sarah is talking, silence her immediately
                if (isSpeaking && isModelSpeaking) {
                  console.log("[Sarah] Client-side barge-in detected. Silencing Sarah.");
                  sourcesRef.current.forEach(s => {
                    try { s.stop(); } catch (e) {}
                  });
                  sourcesRef.current.clear();
                  nextStartTimeRef.current = 0;
                  setIsModelSpeaking(false);
                }
                
                // Aggressive debug logging for first 50 frames
                if (debugCount < 50) {
                  console.log("[Sarah] Audio frame:", debugCount, "Volume:", volume.toFixed(6), "IsSpeaking:", isSpeaking);
                  debugCount++;
                } else if (Math.random() < 0.05 && volume > 0) {
                  console.log("[Sarah] Audio input detected, volume:", volume.toFixed(6));
                }
                
                if (!isSpeaking && isActiveRef.current) {
                  setSilenceDuration(prev => prev + (1024 / 16000));
                } else {
                  setSilenceDuration(0);
                }
                
                const int16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  // Clamp value and convert to Int16
                  let val = inputData[i];
                  if (val > 1) val = 1;
                  if (val < -1) val = -1;
                  int16[i] = Math.round(val * 32767);
                }
                
                // Ensure we only send the exact bytes for this frame
                const buffer = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
                
                session.sendRealtimeInput({ 
                  media: { 
                    data: encode(buffer), 
                    mimeType: 'audio/pcm;rate=16000' 
                  } 
                });
              };
              limiter.connect(scriptProcessor);
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
              
              // Bridge Sarah's voice back to the SIP caller
              if (sarahVoiceDestRef.current) {
                source.connect(sarahVoiceDestRef.current);
              }

              // Only play to local speakers if we are NOT in a SIP call 
              // or if we want to monitor the AI.
              if (!isSipCallRef.current) {
                analyserRef.current.connect(outputCtx.destination);
              }
              
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
      console.log("[Sarah] Model confirmed interruption.");
      sourcesRef.current.forEach(s => {
        try { s.stop(); } catch (e) {}
      });
      sourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      setIsModelSpeaking(false);
    }

            if ((message as any).serverContent?.modelTurn?.parts[0]?.text) {
              const text = (message as any).serverContent.modelTurn.parts[0].text;
              currentOutputTranscription.current += text;
              setActiveCalls(prev => prev.map(c => c.id === 'live-session' ? {
                ...c,
                status: 'AI_SPEAKING',
                transcript: [...(c.transcript || []).slice(-10), `Sarah: ${text}`]
              } : c));
            }

            if ((message as any).serverContent?.userTurn?.parts[0]?.text) {
              const text = (message as any).serverContent.userTurn.parts[0].text;
              console.log("[Sarah] User said:", text);
              currentInputTranscription.current += text;
              setActiveCalls(prev => prev.map(c => c.id === 'live-session' ? {
                ...c,
                status: 'CUSTOMER_SPEAKING',
                transcript: [...(c.transcript || []).slice(-10), `Customer: ${text}`]
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
                    firstName: args.first_name,
                    lastName: args.last_name,
                    address: args.full_address,
                    phone: args.home_phone,
                    time: args.appointment_time,
                    price: args.price,
                    recordingUrl: recordingUrl || 'generating...',
                    description: `Air Duct Cleaning for ${args.first_name} ${args.last_name}. Price: ${args.price}. Driveway: ${args.has_driveway ? 'Yes' : 'No'}. DNC Permission: ${args.dnc_permission_granted ? 'Yes' : 'No'}.`
                  };
                  
                  // Save to backend
                  fetch('/api/appointments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newAppt)
                  }).catch(err => console.error("Failed to save appointment:", err));
                  
                  // Local update will happen via socket event 'appointment:new'
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
            isActiveRef.current = true;

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
      console.error("[Sarah] Session initialization failed:", err);
      stopSession();
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

  // --- Vicidial WebRTC Bridge ---
  const lastConfigRef = useRef<string>('');
  useEffect(() => {
    if (!dialerConfig.wsUrl || !dialerConfig.webrtcUser || !dialerConfig.webrtcPass) return;

    // Only restart if the actual connection parameters changed
    const currentConfig = JSON.stringify({
      url: dialerConfig.wsUrl,
      user: dialerConfig.webrtcUser,
      pass: dialerConfig.webrtcPass,
      server: dialerConfig.sipServer,
      trigger: reconnectTrigger
    });
    
    if (currentConfig === lastConfigRef.current) return;
    
    // Prevent reconnection loops (max once every 5 seconds)
    const now = Date.now();
    if (now - lastConnectTimeRef.current < 5000) {
      console.warn("[SIP] Reconnection cooldown active. Waiting...");
      const timer = setTimeout(() => setReconnectTrigger(prev => prev + 1), 5000);
      return () => clearTimeout(timer);
    }
    lastConnectTimeRef.current = now;
    lastConfigRef.current = currentConfig;

    console.log("[SIP] Initializing UA with config:", dialerConfig.wsUrl, dialerConfig.webrtcUser);

    // Enable detailed SIP debugging in browser console
    JsSIP.debug.enable('JsSIP:*');

    try {
      const socket = new JsSIP.WebSocketInterface(dialerConfig.wsUrl);
      const sipServer = (dialerConfig.sipServer || '93.127.128.38').trim().replace(/\.+$/, '');
      
      // Ensure we have a valid user and domain
      const cleanUser = dialerConfig.webrtcUser.trim();
      const cleanDomain = sipServer || '93.127.128.38';
      
      // Construct URI carefully
      const sipUri = cleanUser.includes('@') ? `sip:${cleanUser}` : `sip:${cleanUser}@${cleanDomain}`;

      const configuration = {
        sockets: [socket],
        uri: sipUri,
        password: dialerConfig.webrtcPass,
        authorization_user: dialerConfig.webrtcUser,
        display_name: 'Sarah AI Agent',
        register: true,
        register_expires: 3600,
        session_timers: false,
        hack_ip_in_contact: true,
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 30
      };

      console.log("[SIP] Creating UA with URI:", sipUri);
      const ua = new JsSIP.UA(configuration);
      sipUaRef.current = ua;

      ua.on('connecting', () => {
        setWebrtcStatus('connecting');
        setSipLogs(prev => [{ type: 'info', msg: `Connecting to ${dialerConfig.wsUrl}...`, time: new Date().toLocaleTimeString() }, ...prev]);
        
        if (window.location.protocol === 'https:' && dialerConfig.wsUrl.startsWith('ws://')) {
          setSipLogs(prev => [{ type: 'error', msg: `CRITICAL: Browser will block insecure "ws://" on HTTPS. Click "Auto-Fix" in settings.`, time: new Date().toLocaleTimeString() }, ...prev]);
        }
      });

    ua.on('connected', () => {
      setSipLogs(prev => [{ type: 'success', msg: `WebSocket Connected!`, time: new Date().toLocaleTimeString() }, ...prev]);
    });

    ua.on('registered', () => {
      setWebrtcStatus('connected');
      setSipLogs(prev => [{ type: 'success', msg: `SIP Registered (200 OK)`, time: new Date().toLocaleTimeString() }, ...prev]);
    });

    ua.on('registrationFailed', (e: any) => {
      setWebrtcStatus('error');
      const responseCode = e.response ? e.response.status_code : 'No Response';
      const cause = e.cause || 'Unknown Cause';
      
      let msg = `Registration Failed: ${cause} (${responseCode})`;
      if (responseCode === 403 || responseCode === 401) {
        msg = `Registration Conflict: Extension ${dialerConfig.webrtcUser} might be in use elsewhere.`;
        // Stop the UA to prevent aggressive retry loops
        setTimeout(() => {
          if (sipUaRef.current) {
            sipUaRef.current.stop();
            setWebrtcStatus('error');
          }
        }, 1000);
      }
      
      setSipLogs(prev => [{ type: 'error', msg, time: new Date().toLocaleTimeString() }, ...prev]);
      console.error("[SIP] Registration Failed:", cause, e.response);
    });

    ua.on('sipEvent', (e: any) => {
      const direction = e.event === 'request' ? 'OUT' : 'IN';
      const msg = e.request ? e.request.method : (e.response ? `${e.response.status_code} ${e.response.reason_phrase}` : 'Event');
      setSipLogs(prev => [{ type: 'info', msg: `[${direction}] ${msg}`, time: new Date().toLocaleTimeString() }, ...prev]);
    });

    ua.on('disconnected', (e: any) => {
      setWebrtcStatus('disconnected');
      const cause = e.cause || 'Normal';
      setSipLogs(prev => [{ type: 'info', msg: `Disconnected (${cause}). Reconnecting in 3s...`, time: new Date().toLocaleTimeString() }, ...prev]);
      console.log("[SIP] Disconnected:", cause);
      
      // Auto-reconnect logic
      if (cause !== 'Normal' && cause !== 'User Request') {
        setTimeout(() => setReconnectTrigger(prev => prev + 1), 3000);
      }
    });

    ua.on('newRTCSession', (data: any) => {
      const session = data.session;
      
      // If Sarah is on a LOCAL call, stop it to answer the SIP call
      if (isActiveRef.current && !isSipCallRef.current && session.direction === 'incoming') {
        console.log("[SIP] Stopping local session to answer incoming SIP call...");
        stopSession();
      }

      // If Sarah is already on a call, reject the new one
      // But allow if the existing session is already ended (safety check)
      const isActuallyBusy = isActiveRef.current || (sipSessionRef.current && !sipSessionRef.current.isEnded());
      
      if (isActuallyBusy && session.direction === 'incoming') {
        console.warn("[SIP] Sarah is busy, rejecting incoming call.", {
          isActive: isActiveRef.current,
          isSipCall: isSipCallRef.current,
          hasSipSession: !!sipSessionRef.current,
          sessionEnded: sipSessionRef.current?.isEnded(),
          remote: session.remote_identity.uri.toString()
        });
        session.terminate({ status_code: 486, reason_phrase: "Busy Here" });
        return;
      }

      console.log(`[SIP] New RTC Session (${session.direction}):`, session.remote_identity.uri.toString());
      sipSessionRef.current = session;
      let sessionStarted = false;

      // Setup PeerConnection handling for BOTH incoming and outgoing calls
      session.on('peerconnection', (e: any) => {
        const pc = e.peerconnection;
        pc.ontrack = (event: any) => {
          console.log("[SIP] Ontrack event:", event.track.kind, event.track.label);
          
          // Hard fix: Ensure we have a valid stream from the track
          const remoteStream = event.streams[0] || new MediaStream([event.track]);
          
          if (!remoteStream) {
            console.warn("[SIP] No remote stream found in ontrack event");
            return;
          }

          const audioTracks = remoteStream.getAudioTracks();
          if (audioTracks.length === 0) {
            console.warn("[SIP] No audio tracks found in remote stream");
            return;
          }

          console.log(`[SIP] Remote audio track detected: ${audioTracks[0].label} (${audioTracks[0].id})`);

          // Only start if not already active to avoid double sessions
          if (!isActiveRef.current && !sessionStarted) {
            sessionStarted = true;
            console.log("[SIP] Call track detected, starting Sarah AI session...");
            startSession(remoteStream).then(() => {
              if (sarahVoiceDestRef.current) {
                const sarahStream = sarahVoiceDestRef.current.stream;
                const sarahTrack = sarahStream.getAudioTracks()[0];
                
                // Find the sender that's currently sending (likely the silent stream from answer/call)
                const sender = pc.getSenders().find((s: any) => s.track && s.track.kind === 'audio');
                if (sender) {
                  console.log("[SIP] Swapping silent track with Sarah AI voice track");
                  sender.replaceTrack(sarahTrack).catch((err: any) => {
                    console.error("[SIP] replaceTrack failed:", err);
                  });
                } else {
                  console.log("[SIP] No sender found, adding Sarah track");
                  pc.addTrack(sarahTrack, sarahStream);
                }
              }
            }).catch(err => {
              console.error("[SIP] Failed to start Sarah AI session:", err);
              session.terminate();
            });
          }
        };
      });

      session.on('accepted', () => {
        console.log("[SIP] Call accepted by remote");
        setLastAction("Call Connected");
      });

      session.on('confirmed', () => {
        console.log("[SIP] Call confirmed (ACK received)");
      });

      if (session.direction === 'incoming') {
        console.log("[SIP] Answering incoming call with silent stream...");
        session.answer({
          mediaStream: getSilentStream() || undefined,
          mediaConstraints: { audio: true, video: false }
        });
      }

      session.on('ended', () => {
        console.log("[SIP] Call ended by remote/local");
        stopSession();
        sipSessionRef.current = null;
      });

      session.on('failed', (e: any) => {
        console.warn("[SIP] Call failed:", e.cause);
        stopSession();
        sipSessionRef.current = null;
      });
    });

      const startTimeout = setTimeout(() => {
        try {
          console.log("[SIP] Starting UA...");
          ua.start();
        } catch (e) {
          console.error("[SIP] UA Start Failed:", e);
          setWebrtcStatus('error');
          setSipLogs(prev => [{ type: 'error', msg: `UA Start Failed: ${e instanceof Error ? e.message : 'Unknown error'}`, time: new Date().toLocaleTimeString() }, ...prev]);
        }
      }, 500);

      return () => {
        clearTimeout(startTimeout);
        console.log("[SIP] Stopping UA and cleaning up...");
        if (ua) {
          if (ua.isRegistered()) {
            ua.unregister();
          }
          ua.stop();
        }
        if (socket && typeof socket.disconnect === 'function') {
          socket.disconnect();
        }
        sipUaRef.current = null;
      };
    } catch (e) {
      console.error("[SIP] UA Initialization Failed:", e);
      setWebrtcStatus('error');
      setSipLogs(prev => [{ type: 'error', msg: `UA Init Failed: ${e instanceof Error ? e.message : 'Unknown error'}`, time: new Date().toLocaleTimeString() }, ...prev]);
      return () => {};
    }
  }, [dialerConfig, reconnectTrigger]);

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
          dialerConfig={dialerConfig}
          onUpdateDialerConfig={setDialerConfig}
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
          agentName={agentName}
          onUpdateAgentName={(name) => {
            setAgentName(name);
            setLastAction(`Agent Identity Updated to ${name}.`);
            setTimeout(() => setLastAction(null), 3000);
          }}
          scriptOffer={scriptOffer}
          onUpdateScriptOffer={(offer) => {
            setScriptOffer(offer);
            setLastAction("Sarah's Script Offer Updated.");
            setTimeout(() => setLastAction(null), 3000);
          }}
          sipProfiles={sipProfiles}
          onUpdateSipProfiles={setSipProfiles}
          webrtcStatus={webrtcStatus}
          isUserSpeaking={isUserSpeaking}
          dailyCost={dailyCost}
          isLiveActive={isActive}
          listeningToId={listeningToId}
          appointments={appointments}
          onUpdateAppointments={setAppointments}
          onConnectSip={() => {
            setReconnectTrigger(prev => prev + 1);
            setLastAction("Forcing Sarah Reconnection...");
            setTimeout(() => setLastAction(null), 3000);
          }}
          uploadedLeads={uploadedLeads}
          sipLogs={sipLogs}
          onClearSipLogs={() => setSipLogs([])}
          onUpdateSipLogs={setSipLogs}
          currentVolume={currentVolume}
          onMakeTestCall={(target) => {
            if (!sipUaRef.current) {
              setLastAction("Sarah is not connected to VICIdial.");
              return;
            }
            if (!sipUaRef.current.isRegistered()) {
              setLastAction("Sarah is not registered. Reconnecting...");
              setReconnectTrigger(prev => prev + 1);
              return;
            }
            console.log("[SIP] Placing manual call to:", target || '9999');
            try {
              const session = sipUaRef.current.call(target || '9999', {
                mediaStream: getSilentStream() || undefined,
                mediaConstraints: { audio: true, video: false }
              });
              // Note: sipSessionRef.current will be set in the newRTCSession handler
              setLastAction(`Dialing ${target || '9999'}...`);
            } catch (e) {
              console.error("[SIP] Call failed to initiate:", e);
              setLastAction("Call failed to initiate.");
            }
          }}
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
          
          {isActive && isModelSpeaking && (
            <button
              onClick={forceInterrupt}
              className="px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all flex items-center gap-2"
            >
              <MicOff className="w-3 h-3" />
              Interrupt Sarah
            </button>
          )}
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

              <div>
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block flex justify-between">
                  Interrupt Sensitivity
                  <span className="text-indigo-400">{sensitivity.toFixed(1)}x</span>
                </label>
                <input 
                  type="range" 
                  min="1.1" 
                  max="5.0" 
                  step="0.1"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[8px] text-white/20 uppercase font-bold mt-2">
                  <span>Aggressive</span>
                  <span>Balanced</span>
                  <span>Conservative</span>
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
