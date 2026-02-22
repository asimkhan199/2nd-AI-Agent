
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

  const sessionRef = useRef<any>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    setIsActive(false);
    setIsModelSpeaking(false);
    setIsUserSpeaking(false);
  }, []);

  const startSession = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
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
            voiceConfig: { 
              prebuiltVoiceConfig: { 
                voiceName: selectedVoice
              } 
            },
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
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ 
                  media: { 
                    data: encode(new Uint8Array(int16.buffer)), 
                    mimeType: 'audio/pcm;rate=16000' 
                  } 
                });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
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

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
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
    } catch (err: any) {
      console.error("Start session failed:", err);
      alert("Microphone access is required for the voice agent.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center font-['Inter'] p-6 overflow-hidden">
      {/* Background Glow */}
      <div className={`fixed inset-0 transition-opacity duration-1000 pointer-events-none ${isActive ? 'opacity-20' : 'opacity-0'}`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500 rounded-full blur-[120px] animate-pulse"></div>
      </div>

      <div className="relative flex flex-col items-center w-full max-w-md">
        {/* Settings Toggle */}
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="absolute -top-20 right-0 p-3 text-white/20 hover:text-white/60 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Settings Panel */}
        <div className={`absolute -top-16 left-0 right-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 transition-all duration-500 ${showSettings ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Select Voice Profile</span>
            <select 
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value as any)}
              disabled={isActive}
              className="bg-transparent text-xs font-bold text-indigo-400 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              <option value="Kore">Kore (Standard)</option>
              <option value="Puck">Puck (Energetic)</option>
              <option value="Charon">Charon (Deep)</option>
              <option value="Fenrir">Fenrir (Mellow)</option>
              <option value="Zephyr">Zephyr (Soft)</option>
            </select>
          </div>
        </div>

        {/* Visualizer Ring */}
        <div className={`absolute inset-0 -m-8 rounded-full border border-white/5 transition-all duration-1000 ${isActive ? 'scale-150 opacity-100' : 'scale-100 opacity-0'}`}>
          <div className="absolute inset-0 rounded-full bg-indigo-500/10 blur-3xl animate-pulse"></div>
        </div>

        {/* Main Agent Button */}
        <button
          onClick={isActive ? stopSession : startSession}
          className={`relative z-10 w-64 h-64 rounded-full flex flex-col items-center justify-center transition-all duration-500 active:scale-95 shadow-2xl ${
            isActive 
              ? 'bg-indigo-600 shadow-indigo-500/40' 
              : 'bg-white/5 border border-white/10 hover:bg-white/10'
          }`}
        >
          <div className={`mb-4 transition-transform duration-500 ${isActive ? 'scale-110' : 'scale-100'}`}>
            <svg className={`w-16 h-16 ${isActive ? 'text-white' : 'text-white/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          
          <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${isActive ? 'text-indigo-200' : 'text-white/20'}`}>
            {isActive ? 'Connected' : 'Start Call'}
          </span>
        </button>

        {/* Status & Visualizer */}
        <div className="mt-16 flex flex-col items-center space-y-6 min-h-[80px]">
          <h2 className={`text-xl font-bold tracking-tight transition-colors duration-500 ${isActive ? 'text-white' : 'text-white/20'}`}>
            {isUserSpeaking ? "Hearing..." : isModelSpeaking ? "Speaking..." : isActive ? "Sarah is Live" : "Neural Link Offline"}
          </h2>
          
          {isActive && (
            <div className="flex items-center gap-1.5 h-6">
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1 bg-indigo-400 rounded-full transition-all duration-300 ${isModelSpeaking || isUserSpeaking ? 'animate-pulse' : 'h-1'}`}
                  style={{ 
                    height: (isModelSpeaking || isUserSpeaking) ? `${30 + Math.random() * 70}%` : '4px',
                    animationDelay: `${i * 0.05}s`
                  }}
                ></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Minimal Branding */}
      <div className="absolute bottom-12 flex flex-col items-center opacity-20">
        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white">Sarah.ai</span>
        <span className="text-[8px] font-bold uppercase tracking-widest text-indigo-400 mt-2">Neural Sales Core 5.0</span>
      </div>
    </div>
  );
};

export default App;
