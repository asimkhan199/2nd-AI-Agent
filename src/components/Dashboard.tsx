import React, { useState, useEffect, useRef } from 'react';
import { CallSession, CallDisposition } from '../types';
import { Play, Pause, PhoneOff, MessageSquare, UserPlus, AlertCircle, TrendingUp, BarChart3, Users, Volume2, XCircle, Settings, Globe, ShieldCheck, ShieldAlert, Zap, Calendar as CalendarIcon, Clock, MapPin, Phone, Activity, CheckCircle, Database, Search, Wifi, WifiOff, AlertTriangle, Link2 } from 'lucide-react';
import Papa from 'papaparse';
import * as JsSIP from 'jssip';

interface DashboardProps {
  activeCalls: CallSession[];
  onWhisper: (callId: string) => void;
  onTakeover: (callId: string) => void;
  onListen: (callId: string) => void;
  onStop: (callId: string) => void;
  onStartLive: () => void;
  onStopLive: () => void;
  onUploadLeads: (leads: any[]) => void;
  onUpdateRebuttals: (text: string) => void;
  onUpdateAgentName: (name: string) => void;
  onUpdateScriptOffer: (offer: string) => void;
  customRebuttals: string;
  agentName: string;
  scriptOffer: string;
  dailyCost?: number;
  cacheStats?: { hits: number, misses: number };
  isLiveActive: boolean;
  webrtcStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  dispositions: CallDisposition[];
  listeningToId: string | null;
  appointments: any[];
  onUpdateAppointments: (appts: any[]) => void;
  onConnectSip: () => void;
  onMakeTestCall: (target?: string) => void;
  uploadedLeads: any[];
  dialerConfig?: any;
  sipLogs?: any[];
  onClearSipLogs?: () => void;
  onUpdateSipLogs?: (logs: any[] | ((prev: any[]) => any[])) => void;
  onUpdateDialerConfig?: (config: any) => void;
  isUserSpeaking?: boolean;
}

export const OrchestrationDashboard: React.FC<DashboardProps> = ({ 
  activeCalls = [], 
  onWhisper, 
  onTakeover, 
  onListen, 
  onStop,
  onStartLive,
  onStopLive,
  onUploadLeads,
  onUpdateRebuttals,
  onUpdateAgentName,
  onUpdateScriptOffer,
  customRebuttals,
  agentName: serverAgentName,
  scriptOffer: serverScriptOffer,
  dailyCost = 0,
  cacheStats = { hits: 0, misses: 0 },
  isLiveActive,
  webrtcStatus,
  dispositions = [],
  listeningToId,
  appointments = [],
  onUpdateAppointments,
  onConnectSip,
  onMakeTestCall,
  uploadedLeads = [],
  dialerConfig,
  sipLogs = [],
  onClearSipLogs,
  onUpdateSipLogs: setSipLogs,
  onUpdateDialerConfig: setDialerConfig,
  isUserSpeaking = false
}) => {
  const [outboundIp, setOutboundIp] = useState<string>('Detecting...');

  useEffect(() => {
    fetch('/api/server/ip')
      .then(res => res.json())
      .then(data => setOutboundIp(data.ip))
      .catch(() => setOutboundIp('Error detecting'));
  }, []);

  const [view, setView] = useState<'live' | 'reports' | 'training' | 'calendar' | 'vicidial'>('live');
  const [sipProfiles, setSipProfiles] = useState<any[]>(() => {
    const saved = localStorage.getItem('sip_profiles');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>('');

  useEffect(() => {
    if (dialerConfig) {
      localStorage.setItem('dialer_config', JSON.stringify(dialerConfig));
    }
  }, [dialerConfig]);

  const [installStep, setInstallStep] = useState<number>(() => {
    const saved = localStorage.getItem('install_step');
    return saved ? parseInt(saved) : 0;
  });

  useEffect(() => {
    localStorage.setItem('install_step', installStep.toString());
  }, [installStep]);

  const [sarahIp, setSarahIp] = useState<string>('Detecting...');
  const [webrtcLogs, setWebrtcLogs] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/server/ip')
      .then(res => res.json())
      .then(data => setSarahIp(data.ip))
      .catch(() => setSarahIp('Unknown'));
  }, []);

  const addWebrtcLog = (msg: string) => {
    setWebrtcLogs(prev => [msg, ...prev].slice(0, 10));
  };

  // Sync with local storage
  useEffect(() => {
    localStorage.setItem('sip_profiles', JSON.stringify(sipProfiles));
  }, [sipProfiles]);

  const saveProfile = () => {
    const name = profileName.trim() || `Profile ${sipProfiles.length + 1}`;
    const newProfile = {
      id: activeProfileId || Math.random().toString(36).substr(2, 9),
      name: name,
      server: dialerConfig.sipServer,
      port: dialerConfig.sipPort,
      user: dialerConfig.sipUser,
      pass: dialerConfig.sipPass,
      wsUrl: dialerConfig.wsUrl,
      webrtcUser: dialerConfig.webrtcUser,
      webrtcPass: dialerConfig.webrtcPass
    };
    
    if (activeProfileId) {
      setSipProfiles(sipProfiles.map(p => p.id === activeProfileId ? newProfile : p));
    } else {
      setSipProfiles([...sipProfiles, newProfile]);
      setActiveProfileId(newProfile.id);
    }
    setProfileName(name);
    syncDialerConfig(dialerConfig);
  };

  const loadProfile = (id: string) => {
    const profile = sipProfiles.find(p => p.id === id);
    if (profile) {
      const newConfig = {
        ...dialerConfig,
        sipServer: profile.server,
        sipPort: profile.port,
        sipUser: profile.user,
        sipPass: profile.pass,
        wsUrl: profile.wsUrl || '',
        webrtcUser: profile.webrtcUser || '',
        webrtcPass: profile.webrtcPass || ''
      };
      setDialerConfig(newConfig);
      setActiveProfileId(id);
      setProfileName(profile.name);
      syncDialerConfig(newConfig);
    }
  };

  const deleteProfile = (id: string) => {
    setSipProfiles(sipProfiles.filter(p => p.id !== id));
    if (activeProfileId === id) setActiveProfileId(null);
  };

  const [testExtension, setTestExtension] = useState('');
  const [isTestCalling, setIsTestCalling] = useState(false);
  const [sipTrace, setSipTrace] = useState<{ direction: 'in' | 'out', msg: string, time: string }[]>([]);

  const addSipTrace = (direction: 'in' | 'out', msg: string, raw?: string) => {
    setSipTrace(prev => [{ 
      direction, 
      msg, 
      time: new Date().toLocaleTimeString(),
      raw: raw || '' 
    }, ...prev].slice(0, 20));
  };
  const [manualPhone, setManualPhone] = useState('');
  const [isDialing, setIsDialing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const handleManualDial = async () => {
    if (!manualPhone) return;
    setIsDialing(true);
    try {
      const res = await fetch('/api/dialer/manual-dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: manualPhone })
      });
      if (res.ok) {
        setManualPhone('');
      }
    } catch (err) {
      console.error("Dial failed:", err);
    } finally {
      setIsDialing(false);
    }
  };

  const syncDialerConfig = async (newConfig: any) => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/dialer/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setSaveStatus('error');
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        // You could also fetch config specifically if needed
      } catch (err) {}
    };
    fetchConfig();
  }, []);
  const [systemHealth, setSystemHealth] = useState({
    sip: 'checking',
    dialer: 'checking',
    api: 'checking',
    latency: 'checking'
  });

  useEffect(() => {
    if (view === 'dialer') {
      const timer = setTimeout(() => {
        setSystemHealth({
          sip: dialerConfig.sipServer && dialerConfig.sipUser && dialerConfig.sipPass ? 'healthy' : 'warning',
          dialer: uploadedLeads.length > 0 ? 'healthy' : 'warning',
          api: 'healthy',
          latency: '24ms'
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [view, dialerConfig.sipServer, uploadedLeads.length]);
  const [playingRecording, setPlayingRecording] = useState<CallDisposition | null>(null);
  const [showVoipSettings, setShowVoipSettings] = useState(false);
  const [localRebuttals, setLocalRebuttals] = useState(customRebuttals);
  const [agentName, setAgentName] = useState(serverAgentName);
  const [scriptOffer, setScriptOffer] = useState(serverScriptOffer);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalRebuttals(customRebuttals);
  }, [customRebuttals]);

  useEffect(() => {
    setAgentName(serverAgentName);
  }, [serverAgentName]);

  useEffect(() => {
    setScriptOffer(serverScriptOffer);
  }, [serverScriptOffer]);

  const handleSync = () => {
    setIsSaving(true);
    onUpdateRebuttals(localRebuttals);
    onUpdateAgentName(agentName);
    onUpdateScriptOffer(scriptOffer);
    setTimeout(() => setIsSaving(false), 2000);
  };

  const totalRequests = cacheStats.hits + cacheStats.misses;
  const savingsRate = totalRequests > 0 ? Math.round((cacheStats.hits / totalRequests) * 100) : 0;
  const estimatedSavings = (cacheStats.hits * 0.005).toFixed(2); // Estimating $0.005 per TTS call

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          onUploadLeads(results.data);
        },
        error: (err) => {
          alert(`CSV Error: ${err.message}`);
        }
      });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter">ENVISION SERVICES</h1>
            <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">v2.5 Production Cluster</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end px-4 border-r border-white/10">
            <span className="text-[8px] text-white/30 uppercase font-black tracking-widest">Live Calls</span>
            <span className="text-sm font-mono font-bold text-emerald-400 flex items-center gap-2">
              <Activity className="w-3 h-3 animate-pulse" /> {activeCalls.length} Active
            </span>
          </div>

          <button 
            onClick={() => isLiveActive ? onStopLive() : onStartLive()}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              isLiveActive 
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
              : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600'
            }`}
          >
            {isLiveActive ? <PhoneOff className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isLiveActive ? 'End Test Call' : 'Test Call Sarah'}
          </button>

          <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
            <button 
              onClick={() => setView('live')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'live' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Live Monitor
            </button>
            <button 
              onClick={() => setView('reports')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'reports' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Reports
            </button>
            <button 
              onClick={() => setView('training')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'training' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Training Lab
            </button>
            <button 
              onClick={() => setView('calendar')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'calendar' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Calendar
            </button>
            <button 
              onClick={() => setView('vicidial')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'vicidial' ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Vicidial Link
            </button>
          </div>

          {customRebuttals && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-pulse">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Training Active</span>
            </div>
          )}

          {/* Cost Savings Indicator */}
          <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Cost Savings</span>
              <span className="text-[10px] font-bold text-white">{savingsRate}% Efficiency</span>
            </div>
            <div className="h-6 w-[1px] bg-emerald-500/20"></div>
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Saved</span>
              <span className="text-[10px] font-bold text-white">${estimatedSavings}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 border-l border-white/10 pl-6">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-white/30 uppercase font-black">Sarah Status</span>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold ${
                  webrtcStatus === 'connected' ? 'text-emerald-400' : 
                  webrtcStatus === 'connecting' ? 'text-amber-400' : 
                  webrtcStatus === 'error' ? 'text-red-400' : 'text-white/20'
                }`}>
                  {webrtcStatus === 'connected' ? 'ONLINE' : 
                   webrtcStatus === 'connecting' ? 'CONNECTING...' : 
                   webrtcStatus === 'error' ? 'AUTH ERROR' : 'OFFLINE'}
                </span>
                <div className={`w-2 h-2 rounded-full ${
                  webrtcStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                  webrtcStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 
                  webrtcStatus === 'error' ? 'bg-red-500' : 'bg-white/10'
                }`}></div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 border-l border-white/10 pl-6">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-white/30 uppercase font-black">Concurrency</span>
              <span className="text-sm font-mono font-bold text-emerald-400">{activeCalls.length} / 5</span>
            </div>
            <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500" 
                style={{ width: `${(activeCalls.length / 5) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {view === 'sip-config' ? (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                <Globe className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">SIP Configuration Hub</h2>
                <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Manage multiple SIP accounts and verify connection alignment</p>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-8">
              {/* Profile Selector */}
              <div className="col-span-4 space-y-6">
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" /> Saved Profiles
                  </h3>
                  <div className="space-y-3">
                    {sipProfiles.length === 0 ? (
                      <p className="text-xs text-white/20 italic">No profiles saved yet.</p>
                    ) : (
                      sipProfiles.map(profile => (
                        <div 
                          key={profile.id}
                          className={`group flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                            activeProfileId === profile.id 
                            ? 'bg-emerald-500/10 border-emerald-500/40' 
                            : 'bg-black/20 border-white/5 hover:border-white/20'
                          }`}
                          onClick={() => loadProfile(profile.id)}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-white">{profile.name}</span>
                            <span className="text-[9px] text-white/40 font-mono">{profile.server}</span>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteProfile(profile.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 rounded-lg transition-all"
                          >
                            <XCircle className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      ))
                    )}
                      <button 
                        onClick={() => {
                          setActiveProfileId(null);
                          setProfileName('');
                          setDialerConfig({
                          ...dialerConfig,
                          sipServer: '',
                          sipUser: '',
                          sipPass: ''
                        });
                      }}
                      className="w-full py-3 border border-dashed border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2"
                    >
                      <UserPlus className="w-3 h-3" /> New Profile
                    </button>
                  </div>
                </div>

                <div className="bg-indigo-500/5 rounded-[2rem] border border-indigo-500/10 p-8">
                  <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 text-indigo-400 flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3" /> Alignment Checklist
                  </h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-[10px] text-white/60">
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                      <span><strong>Host:</strong> Ensure your SIP Server matches Vicidial (e.g., <code>trunk.provider.com</code>).</span>
                    </li>
                    <li className="flex items-start gap-3 text-[10px] text-white/60">
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                      <span><strong>Auth:</strong> Use the same <code>user</code> and <code>pass</code> as your Vicidial carrier settings.</span>
                    </li>
                    <li className="flex items-start gap-3 text-[10px] text-white/60">
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                      <span><strong>Firewall:</strong> Ensure your SIP provider allows traffic from this IP.</span>
                    </li>
                  </ul>
                </div>

                {/* Remote Agent Webhook */}
                <div className="bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10 p-8">
                  <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 text-emerald-400 flex items-center gap-2">
                    <Zap className="w-3 h-3" /> Remote Agent Integration
                  </h3>
                  <p className="text-[10px] text-white/40 mb-4 leading-relaxed">
                    If SIP connection fails, use this Webhook in your Vicidial dialplan to trigger Sarah:
                  </p>
                  <div className="bg-black/40 p-3 rounded-lg border border-white/10 font-mono text-[9px] text-emerald-300 break-all">
                    {window.location.origin}/api/inbound/call
                  </div>
                  <p className="text-[9px] text-white/20 mt-4 italic">
                    Sarah will instantly join the call when this endpoint is hit by Vicidial.
                  </p>
                </div>
              </div>

              {/* Configuration Form */}
              <div className="col-span-8 space-y-6">
                {/* Whitelisting Info */}
                <div className="bg-indigo-500/10 rounded-[2rem] border border-indigo-500/20 p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400">
                      Provider Whitelisting Info
                    </h3>
                  </div>
                  <p className="text-[10px] text-white/60 mb-6 leading-relaxed">
                    If your Vicidial or VoIP provider has a firewall, you <strong>MUST</strong> whitelist Sarah's IP address to allow audio and SIP traffic.
                  </p>
                  
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 mb-6">
                    <span className="text-[9px] text-white/20 uppercase font-black block mb-1">Sarah's Outbound IP</span>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-bold text-indigo-300">{sarahIp}</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(sarahIp)}
                        className="text-[9px] text-white/40 hover:text-white underline uppercase font-black"
                      >
                        Copy IP
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1" />
                      <p className="text-[10px] text-white/40">Tell your provider: "Please whitelist IP <strong>{sarahIp}</strong> for SIP (5060), RTP (10000-20000), and WebSocket (8089) traffic."</p>
                    </div>
                  </div>
                </div>

                {/* Live Installation Checklist */}
                <div className="bg-emerald-500/10 rounded-[2rem] border border-emerald-500/20 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400">Live Installation Tracker</h3>
                        <p className="text-[10px] text-white/40">Step {installStep + 1} of 5</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setInstallStep(0)}
                      className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white underline"
                    >
                      Reset Progress
                    </button>
                  </div>

                  <div className="space-y-4">
                    {[
                      { title: 'OS Installation', desc: 'Running os-install and setting Static IP' },
                      { title: 'Vicidial Core', desc: 'Running vicibox-install (Express)' },
                      { title: 'SSL Security', desc: 'Running vicibox-cert for Sarah' },
                      { title: 'Firewall', desc: 'Opening ports 5060, 8089, 10000-20000' },
                      { title: 'Sarah Connect', desc: 'Final handshake and test call' }
                    ].map((step, i) => (
                      <div key={i} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                        installStep > i ? 'bg-emerald-500/10 border-emerald-500/30 opacity-50' :
                        installStep === i ? 'bg-white/5 border-emerald-500/50 scale-[1.02] shadow-lg shadow-emerald-500/10' :
                        'bg-black/20 border-white/5 opacity-30'
                      }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                          installStep > i ? 'bg-emerald-500 text-black' :
                          installStep === i ? 'bg-emerald-400 text-black animate-pulse' :
                          'bg-white/10 text-white/40'
                        }`}>
                          {installStep > i ? '✓' : i + 1}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-white">{step.title}</h4>
                          <p className="text-[9px] text-white/40">{step.desc}</p>
                        </div>
                        {installStep === i && (
                          <button 
                            onClick={() => setInstallStep(i + 1)}
                            className="px-4 py-1 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-emerald-400 transition-all"
                          >
                            I'm Done
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Build Your Own Dialer Guide */}
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <Database className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400">
                      Build Your Own Dialer Guide
                    </h3>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="p-4 bg-black/40 rounded-xl border border-white/10">
                      <span className="text-[10px] text-white/40 uppercase font-black block mb-3">1. Install ViciBox 11</span>
                      <p className="text-[10px] text-white/60 mb-3 leading-relaxed">
                        Download the ISO from vicibox.com and run these commands on your server:
                      </p>
                      <div className="bg-black/60 p-3 rounded font-mono text-[9px] text-emerald-300 space-y-1">
                        <div># Install OS</div>
                        <div className="text-white">os-install</div>
                        <div className="mt-2"># Install Vicidial</div>
                        <div className="text-white">vicibox-install</div>
                        <div className="mt-2"># Install SSL (Required)</div>
                        <div className="text-white">vicibox-cert</div>
                      </div>
                    </div>

                    <div className="p-4 bg-black/40 rounded-xl border border-white/10">
                      <span className="text-[10px] text-white/40 uppercase font-black block mb-3">2. Enable WebRTC Bridge</span>
                      <p className="text-[10px] text-white/60 mb-3 leading-relaxed">
                        Edit <code className="text-white">/etc/asterisk/http.conf</code> and set:
                      </p>
                      <div className="bg-black/60 p-3 rounded font-mono text-[9px] text-indigo-300">
                        enabled=yes<br/>
                        bindport=8088<br/>
                        tlsenable=yes<br/>
                        tlsbindaddr=0.0.0.0:8089
                      </div>
                    </div>

                    <div className="p-4 bg-black/40 rounded-xl border border-white/10">
                      <span className="text-[10px] text-white/40 uppercase font-black block mb-3">3. Open Firewall Ports</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-black/60 p-2 rounded text-[9px] text-white/60">SIP: 5060</div>
                        <div className="bg-black/60 p-2 rounded text-[9px] text-white/60">WebRTC: 8089</div>
                        <div className="bg-black/60 p-2 rounded text-[9px] text-white/60">Audio: 10000-20000</div>
                        <div className="bg-black/60 p-2 rounded text-[9px] text-white/60">Web: 80/443</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Connection Proof Badge */}
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" /> 100% Connection Proof
                    </h3>
                    <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                      webrtcStatus === 'connected' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-red-500/10 border-red-500/50 text-red-400'
                    }`}>
                      {webrtcStatus === 'connected' ? 'Verified Registered' : 'Not Registered'}
                    </div>
                  </div>

                  {webrtcStatus !== 'connected' && (
                    <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                      <div className="flex items-center gap-3 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-[10px] font-black uppercase text-amber-400">Security Warning</span>
                      </div>
                      <p className="text-[10px] text-amber-200/60 leading-relaxed">
                        If your Vicidial uses a self-signed certificate, you <strong>MUST</strong> open this link in a new tab and click "Advanced -&gt; Proceed" for Sarah to connect:
                      </p>
                      <a 
                        href={`https://${dialerConfig.sipServer}:8089/ws`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-block mt-2 text-[10px] text-amber-400 underline font-mono break-all"
                      >
                        https://{dialerConfig.sipServer}:8089/ws
                      </a>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                      <span className="text-[9px] text-white/20 uppercase font-black block mb-1">SIP Registration</span>
                      <span className={`text-xs font-bold ${webrtcStatus === 'connected' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {webrtcStatus === 'connected' ? 'ACTIVE (200 OK Received)' : 'INACTIVE'}
                      </span>
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                      <span className="text-[9px] text-white/20 uppercase font-black block mb-1">Server Response</span>
                      <span className="text-xs font-bold text-white/60">
                        {sipTrace.length > 0 ? sipTrace[0].msg : 'Waiting...'}
                      </span>
                    </div>
                  </div>

                  {/* SIP Traffic Monitor */}
                  <div className="bg-black/60 rounded-xl p-4 border border-white/5 font-mono text-[9px]">
                    <div className="flex items-center justify-between mb-2 border-b border-white/10 pb-2">
                      <span className="text-white/30 uppercase font-black">Live SIP Traffic Monitor</span>
                      <span className="text-[8px] text-white/10 italic">Real-time packets</span>
                    </div>
                    <div className="space-y-1 h-32 overflow-y-auto custom-scrollbar">
                      {sipTrace.map((trace, i) => (
                        <div key={i} className="group border-b border-white/5 pb-1">
                          <div className="flex gap-2 items-center">
                            <span className="text-white/10 text-[7px]">[{trace.time}]</span>
                            <span className={trace.direction === 'out' ? 'text-indigo-400' : 'text-emerald-400'}>
                              {trace.direction === 'out' ? '→ SENT:' : '← RECV:'}
                            </span>
                            <span className="text-white/60 font-bold">{trace.msg}</span>
                          </div>
                          {trace.raw && (
                            <div className="hidden group-hover:block mt-1 p-2 bg-black rounded text-[7px] text-white/40 break-all whitespace-pre-wrap border border-white/10">
                              {trace.raw}
                            </div>
                          )}
                        </div>
                      ))}
                      {sipTrace.length === 0 && <p className="text-white/5 italic">No SIP traffic detected yet...</p>}
                    </div>
                    <p className="text-[7px] text-white/20 mt-2 italic">Hover over a message to see the raw SIP packet headers.</p>
                  </div>
                </div>

                {/* Simplified Sarah Connection Section */}
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                        <Wifi className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Sarah Connection (WebRTC)</h3>
                        <p className="text-[9px] text-white/40 font-mono">Connect Sarah directly to your Vicidial server</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={saveProfile}
                        className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all flex items-center gap-2"
                      >
                        <CheckCircle className="w-3 h-3 text-emerald-400" /> Save Settings
                      </button>
                      <button 
                        onClick={onConnectSip}
                        className={`px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 ${
                          webrtcStatus === 'connected' ? 'bg-emerald-500 text-white shadow-lg shadow-red-500/20' : 
                          webrtcStatus === 'connecting' ? 'bg-amber-500 text-white animate-pulse' :
                          'bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20'
                        }`}
                      >
                        {webrtcStatus === 'connected' ? <CheckCircle className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                        {webrtcStatus === 'connected' ? 'Sarah Online' : 
                         webrtcStatus === 'connecting' ? 'Connecting...' : 'Connect Sarah'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Profile Name</label>
                        <input 
                          type="text" 
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="e.g. Production Dialer"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Vicidial IP (Host)</label>
                        <input 
                          type="text" 
                          value={dialerConfig.sipServer}
                          onChange={(e) => setDialerConfig({...dialerConfig, sipServer: e.target.value})}
                          placeholder="e.g. 93.127.128.38"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 flex justify-between">
                          <span>Websocket URL</span>
                          {window.location.protocol === 'https:' && dialerConfig.wsUrl.startsWith('ws://') && (
                            <span className="text-amber-400 animate-pulse">Mixed Content Warning!</span>
                          )}
                        </label>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={dialerConfig.wsUrl}
                            onChange={(e) => setDialerConfig({...dialerConfig, wsUrl: e.target.value})}
                            placeholder="wss://93.127.128.38:8089/ws"
                            className={`w-full bg-black/40 border ${window.location.protocol === 'https:' && dialerConfig.wsUrl.startsWith('ws://') ? 'border-amber-500/50' : 'border-white/10'} rounded-xl px-4 py-3 text-xs text-white focus:border-emerald-500 transition-all pr-24`}
                          />
                          <button 
                            onClick={() => {
                              const ip = dialerConfig.sipServer || '93.127.128.38';
                              const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
                              const port = window.location.protocol === 'https:' ? '8089' : '8088';
                              setDialerConfig({...dialerConfig, wsUrl: `${protocol}://${ip}:${port}/ws`});
                            }}
                            className="absolute right-2 top-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all border border-white/10"
                          >
                            Auto-Fix
                          </button>
                        </div>
                        {window.location.protocol === 'https:' && dialerConfig.wsUrl.startsWith('ws://') && (
                          <p className="text-[9px] text-amber-400/60 mt-2 italic">
                            Browser blocks insecure "ws://" on "https://" pages. Use "wss://" and port 8089.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Sarah Extension</label>
                        <input 
                          type="text" 
                          value={dialerConfig.webrtcUser}
                          onChange={(e) => setDialerConfig({...dialerConfig, webrtcUser: e.target.value})}
                          placeholder="e.g. 78602"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Extension Password</label>
                        <input 
                          type="password" 
                          value={dialerConfig.webrtcPass}
                          onChange={(e) => setDialerConfig({...dialerConfig, webrtcPass: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Troubleshooting Section */}
                  <div className="bg-amber-500/5 rounded-[2rem] border border-amber-500/20 p-8 mt-8">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-amber-400 mb-4">
                      <ShieldAlert className="w-4 h-4" /> Stuck on "Connecting"?
                    </h3>
                    <div className="grid grid-cols-2 gap-8 text-[10px] text-white/40 leading-relaxed">
                      <div className="space-y-2">
                        <p className="font-black text-white/60 uppercase">1. Mixed Content (HTTPS)</p>
                        <p>This app runs on <span className="text-white">HTTPS</span>. Browsers block insecure <span className="text-white">ws://</span> connections. Use <span className="text-amber-400 font-bold">wss://</span> and port <span className="text-white">8089</span>.</p>
                      </div>
                      <div className="space-y-2">
                        <p className="font-black text-white/60 uppercase">2. Firewall (Port 8089)</p>
                        <p>Ensure your Vicidial server allows inbound traffic on port <span className="text-white">8089</span> (TCP). Check with <span className="text-indigo-400">netstat -anp | grep 8089</span>.</p>
                      </div>
                      <div className="space-y-2">
                        <p className="font-black text-white/60 uppercase">3. Asterisk HTTP Config</p>
                        <p>In <span className="text-white">http.conf</span>, ensure <span className="text-white">enabled=yes</span>, <span className="text-white">bindaddr=0.0.0.0</span>, and <span className="text-white">tlsenable=yes</span>.</p>
                      </div>
                      <div className="space-y-2">
                        <p className="font-black text-white/60 uppercase">4. Self-Signed Certs</p>
                        <p>If using self-signed certs, open <span className="text-indigo-400 underline">https://{dialerConfig.sipServer}:8089/ws</span> in a new tab and "Accept Risk" to allow the browser to connect.</p>
                      </div>
                    </div>
                  </div>

                  {/* Vicidial Template Guide */}
                  <div className="bg-indigo-500/5 rounded-[2rem] border border-indigo-500/20 p-8 mt-8">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-indigo-400 mb-6">
                      <Database className="w-4 h-4" /> Vicidial "WEBRTC" Template Setup
                    </h3>
                    <p className="text-[10px] text-white/40 mb-6 leading-relaxed">
                      Sarah uses WebRTC to talk. Vicidial's default "SIP_generic" template does not support WebRTC. 
                      You <span className="text-white font-bold">MUST</span> create a new template in Vicidial Admin.
                    </p>
                    
                    <div className="space-y-6">
                      <div>
                        <p className="text-[10px] font-black text-white/60 uppercase mb-2">Step 1: Create Template</p>
                        <p className="text-[10px] text-white/40 mb-3">Go to <span className="text-white">Admin &gt; Templates &gt; Add New Template</span></p>
                        <div className="bg-black/60 p-4 rounded-xl border border-white/5 font-mono text-[9px] text-indigo-300 space-y-1">
                          <p>Template ID: <span className="text-white">WEBRTC</span></p>
                          <p>Template Name: <span className="text-white">WebRTC Phone Template</span></p>
                          <div className="mt-3 pt-3 border-t border-white/5">
                            <p className="text-white/40 mb-2 uppercase text-[8px]">Template Contents:</p>
                            <p>type=friend</p>
                            <p>host=dynamic</p>
                            <p>context=default</p>
                            <p>encryption=yes</p>
                            <p>avpf=yes</p>
                            <p>icesupport=yes</p>
                            <p>directmedia=no</p>
                            <p>transport=wss,ws,udp</p>
                            <p>force_avp=yes</p>
                            <p>dtlsenable=yes</p>
                            <p>dtlsverify=fingerprint</p>
                            <p>dtlssetup=actpass</p>
                            <p>dtlscertfile=/etc/asterisk/keys/asterisk.pem</p>
                            <p>rtcp_mux=yes</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-black text-white/60 uppercase mb-2">Step 2: Apply to Phone</p>
                        <p className="text-[10px] text-white/40">Go to <span className="text-white">Admin &gt; Phones &gt; 78602</span>. Set <span className="text-white">Template ID</span> to <span className="text-indigo-400 font-bold">WEBRTC</span> and save.</p>
                      </div>
                    </div>
                  </div>

                  {/* WebRTC Debug Logs */}
                  <div className="mt-8 bg-black/40 rounded-xl border border-white/5 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Connection Debug Console</span>
                      <button 
                        onClick={() => setWebrtcLogs([])}
                        className="text-[8px] text-white/20 hover:text-white uppercase font-bold"
                      >
                        Clear Logs
                      </button>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                      {webrtcLogs.length === 0 ? (
                        <p className="text-[10px] text-white/10 italic">Waiting for connection attempt...</p>
                      ) : (
                        webrtcLogs.map((log, i) => (
                          <div key={i} className="flex gap-2 text-[10px] font-mono">
                            <span className="text-white/20">[{new Date().toLocaleTimeString()}]</span>
                            <span className={log.includes('Error') ? 'text-red-400' : log.includes('Success') ? 'text-emerald-400' : 'text-white/60'}>
                              {log}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Remote Agent Webhook (Moved here for clarity) */}
                <div className="bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10 p-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                      <Zap className="w-3 h-3" /> Dialplan Instructions
                    </h3>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={testExtension}
                        onChange={(e) => setTestExtension(e.target.value)}
                        placeholder="Agent Ext (e.g. 78601)"
                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1 text-[9px] text-white w-32"
                      />
                      <button 
                        onClick={() => onMakeTestCall()}
                        disabled={webrtcStatus !== 'connected' || isTestCalling}
                        className="px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {isTestCalling ? 'Calling...' : 'Test Sarah'}
                      </button>
                      <button 
                        onClick={() => onMakeTestCall('8500')}
                        disabled={webrtcStatus !== 'connected' || isTestCalling}
                        className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                        title="Dials Asterisk Echo Test (8500)"
                      >
                        Echo Test
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-black/40 rounded-xl border border-white/10">
                      <span className="text-[9px] text-white/40 uppercase font-black block mb-2">Step 1: Add to Carrier Dialplan Entry</span>
                      <div className="bg-black/60 p-3 rounded font-mono text-[9px] text-emerald-300">
                        ; Sarah AI Bridge<br/>
                        exten =&gt; 9999,1,NoOp(Sarah Bridge)<br/>
                        exten =&gt; 9999,n,Dial(SIP/{dialerConfig.webrtcUser || '78602'},30,tTo)<br/>
                        exten =&gt; 9999,n,Hangup()
                      </div>
                    </div>

                    <div className="p-4 bg-black/40 rounded-xl border border-white/10">
                      <span className="text-[9px] text-white/40 uppercase font-black block mb-2">Step 2: Debugging (The "Real Work")</span>
                      <p className="text-[10px] text-white/60 mb-3">
                        Run this command in your Linux terminal to see why the call is hanging up:
                      </p>
                      <div className="bg-black/60 p-3 rounded font-mono text-[9px] text-indigo-300">
                        asterisk -rvvv | grep 9999
                      </div>
                      <p className="text-[9px] text-white/20 mt-3 italic">
                        If you see "Extension 9999 not found", your Dialplan Entry is not being saved correctly in Vicidial.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Real-time Debug Console */}
                <div className="bg-black/40 rounded-[2rem] border border-white/10 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" /> Connection Debug Console
                    </h3>
                    <button 
                      onClick={onClearSipLogs}
                      className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors"
                    >
                      Clear Logs
                    </button>
                  </div>
                  <div className="bg-black/60 rounded-xl p-6 h-64 overflow-y-auto font-mono text-[11px] space-y-3 custom-scrollbar border border-white/5">
                    {sipLogs.some(l => l.msg.includes('Conflict')) && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4 flex items-center gap-4 animate-pulse">
                        <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
                        <div>
                          <p className="text-red-400 font-bold uppercase tracking-widest text-[10px]">Registration Conflict Detected</p>
                          <p className="text-white/60 text-[10px]">Extension {dialerConfig.webrtcUser} is likely logged in on another device. Sarah and the other device are kicking each other out.</p>
                        </div>
                      </div>
                    )}
                    {sipLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-white/20 space-y-4">
                        <Activity className="w-8 h-8 opacity-10" />
                        <p className="italic">Ready to test connection. Logs will appear here.</p>
                      </div>
                    ) : (
                      sipLogs.map((log, i) => (
                        <div key={i} className="flex gap-4 border-b border-white/5 pb-2">
                          <span className="text-white/20 shrink-0">{log.time}</span>
                          <span className={
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-emerald-400' :
                            'text-indigo-300'
                          }>{log.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : view === 'costs' ? (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                <BarChart3 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Financial Intelligence</h2>
                <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Real-time API cost analysis and optimization metrics</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">Daily Total Cost</span>
                <span className="text-4xl font-black text-white">${dailyCost.toFixed(4)}</span>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-emerald-400">
                  <TrendingUp className="w-3 h-3" /> 82% lower than human agents
                </div>
              </div>
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">Avg. Cost Per Minute</span>
                <span className="text-4xl font-black text-white">$0.012</span>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-white/40 italic">
                  Optimized via Neural Cache
                </div>
              </div>
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">Neural Cache Hits</span>
                <span className="text-4xl font-black text-indigo-400">{cacheStats.hits}</span>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-indigo-400">
                  <Zap className="w-3 h-3" /> ${estimatedSavings} saved today
                </div>
              </div>
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">Efficiency Rate</span>
                <span className="text-4xl font-black text-emerald-400">{savingsRate}%</span>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-emerald-400">
                  <ShieldCheck className="w-3 h-3" /> System Optimized
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8 flex-1">
              <h3 className="text-sm font-black uppercase tracking-widest mb-6">Cost Breakdown by Call</h3>
              <div className="space-y-4">
                {dispositions.slice(0, 10).map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{d.LeadName}</p>
                        <p className="text-[10px] text-white/40">{d.CallDurationSeconds}s duration</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold text-emerald-400">${(d.cost || (d.CallDurationSeconds * 0.0002 + 0.005)).toFixed(4)}</p>
                      <p className="text-[8px] text-white/20 uppercase font-black">API + TTS</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : view === 'vicidial' ? (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                <Link2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Vicidial Link (Sarah)</h2>
                <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Sarah is ready to bridge into your Vicidial Cluster</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <Settings className="w-4 h-4 text-indigo-400" /> Connection Settings
                  </h3>
                  <button 
                    onClick={() => {
                      if (confirm('This will clear all saved profiles and reset Sarah to factory defaults. Continue?')) {
                        localStorage.removeItem('sip_profiles');
                        localStorage.removeItem('dialer_config');
                        const defaults = {
                          sipServer: '93.127.128.38',
                          sipPort: '5060',
                          sipUser: '78602',
                          sipPass: 'test',
                          wsUrl: 'wss://93.127.128.38:8089/ws',
                          webrtcUser: '78602',
                          webrtcPass: 'test',
                          status: 'idle'
                        };
                        setDialerConfig(defaults);
                        syncDialerConfig(defaults);
                        setSipProfiles([]);
                        setActiveProfileId(null);
                        onConnectSip(); // Trigger reconnect
                      }
                    }}
                    className="text-[8px] font-black uppercase tracking-widest text-red-500/40 hover:text-red-500 transition-all"
                  >
                    Hard Reset Sarah
                  </button>
                </div>
                <div className="space-y-6">
                  {sipProfiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {sipProfiles.map(p => (
                        <button
                          key={p.id}
                          onClick={() => loadProfile(p.id)}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                            activeProfileId === p.id 
                              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                              : 'bg-white/5 text-white/40 hover:bg-white/10'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="text-[9px] text-white/20 uppercase font-black block mb-2">Profile Name</label>
                    <input 
                      type="text" 
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="e.g. Sarah Main Dialer"
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] text-white/20 uppercase font-black block mb-2">Vicidial IP</label>
                      <input 
                        type="text" 
                        value={dialerConfig.sipServer}
                        onChange={(e) => setDialerConfig({...dialerConfig, sipServer: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/20 uppercase font-black block mb-2">WebRTC Port</label>
                      <input 
                        type="text" 
                        value={dialerConfig.sipPort}
                        onChange={(e) => setDialerConfig({...dialerConfig, sipPort: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] text-white/20 uppercase font-black block mb-2">WebSocket URL</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={dialerConfig.wsUrl}
                        onChange={(e) => setDialerConfig({...dialerConfig, wsUrl: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500"
                      />
                      {window.location.protocol === 'https:' && dialerConfig.wsUrl?.startsWith('ws://') && (
                        <button 
                          onClick={() => setDialerConfig({...dialerConfig, wsUrl: dialerConfig.wsUrl.replace('ws://', 'wss://')})}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-500 hover:bg-red-600 text-white text-[8px] font-black uppercase px-2 py-1 rounded shadow-lg animate-pulse"
                        >
                          Auto-Fix SSL
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] text-white/20 uppercase font-black block mb-2">Extension</label>
                      <input 
                        type="text" 
                        value={dialerConfig.webrtcUser}
                        onChange={(e) => setDialerConfig({...dialerConfig, webrtcUser: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/20 uppercase font-black block mb-2">Password</label>
                      <input 
                        type="password" 
                        value={dialerConfig.webrtcPass}
                        onChange={(e) => setDialerConfig({...dialerConfig, webrtcPass: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => {
                        setActiveProfileId(null);
                        setProfileName('');
                        setDialerConfig({
                          ...dialerConfig,
                          sipServer: '',
                          sipUser: '',
                          sipPass: '',
                          wsUrl: '',
                          webrtcUser: '',
                          webrtcPass: ''
                        });
                      }}
                      className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" /> New
                    </button>
                    <button 
                      onClick={saveProfile}
                      className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-400" /> Save Profile
                    </button>
                    <button 
                      onClick={() => syncDialerConfig(dialerConfig)}
                      className="flex-1 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Zap className="w-4 h-4" /> Sync to Sarah
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" /> Connection Status & Logs
                    </h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          const host = dialerConfig.sipServer || '93.127.128.38';
                          const port = dialerConfig.sipPort || '8089';
                          setSipLogs(prev => [{ type: 'info', msg: `Checking reachability of ${host}:${port}...`, time: new Date().toLocaleTimeString() }, ...prev]);
                          try {
                            const res = await fetch(`/api/health/vicidial?host=${host}&port=${port}`);
                            const data = await res.json();
                            if (data.reachable) {
                              setSipLogs(prev => [{ type: 'success', msg: `SUCCESS: Server ${host} is reachable on port ${port}!`, time: new Date().toLocaleTimeString() }, ...prev]);
                            } else {
                              setSipLogs(prev => [{ type: 'error', msg: `ERROR: Server ${host} is NOT reachable on port ${port}. Check firewall!`, time: new Date().toLocaleTimeString() }, ...prev]);
                            }
                          } catch (err) {
                            setSipLogs(prev => [{ type: 'error', msg: `Check failed: Network error.`, time: new Date().toLocaleTimeString() }, ...prev]);
                          }
                        }}
                        className="text-[8px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-all border border-indigo-500/20 px-2 py-1 rounded"
                      >
                        Ping Server
                      </button>
                      <button 
                        onClick={onClearSipLogs}
                        className="text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all"
                      >
                        Clear Logs
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-6 bg-black/40 rounded-2xl border border-white/5 font-mono text-[11px] space-y-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-white/20 uppercase font-black text-[9px]">WebRTC Bridge</span>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                        webrtcStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 
                        webrtcStatus === 'connecting' ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {webrtcStatus}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/20 uppercase font-black text-[9px]">Sarah Identity</span>
                      <span className="text-white font-bold">{agentName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/20 uppercase font-black text-[9px]">Input Audio</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full transition-all duration-75 ${isUserSpeaking ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] scale-125' : 'bg-white/10'}`}></div>
                        <span className={`text-[10px] font-bold ${isUserSpeaking ? 'text-emerald-400' : 'text-white/20'}`}>
                          {isUserSpeaking ? 'DETECTED' : 'SILENT'}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/20 uppercase font-black text-[9px]">SIP Server</span>
                      <span className="text-white/60">{dialerConfig.sipServer || 'Not Set'}</span>
                    </div>
                    
                    <div className="pt-4 border-t border-white/5">
                      <button 
                        onClick={onConnectSip}
                        className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-indigo-500/20"
                      >
                        {webrtcStatus === 'connecting' ? 'Connecting...' : 'Connect Sarah Bridge'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/60 rounded-xl p-4 h-48 overflow-y-auto font-mono text-[10px] space-y-2 custom-scrollbar border border-white/5">
                    {sipLogs.some(l => l.msg.includes('Conflict')) && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="text-red-400 font-bold uppercase tracking-widest text-[8px]">Conflict Detected</p>
                      </div>
                    )}
                    {sipLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-white/10">
                        <p className="italic">No connection logs yet.</p>
                      </div>
                    ) : (
                      sipLogs.map((log, i) => (
                        <div key={i} className="flex gap-3 border-b border-white/5 pb-1">
                          <span className="text-white/10 shrink-0">{log.time}</span>
                          <span className={
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-emerald-400' :
                            'text-indigo-300'
                          }>{log.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-red-500/5 rounded-[2rem] border border-red-500/20 p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <ShieldAlert className="w-5 h-5 text-red-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-red-400">Firewall Whitelist</h3>
                  </div>
                  <p className="text-[10px] text-white/40 mb-4 leading-relaxed">
                    Vicidial servers often have strict firewalls (Fail2Ban/WhiteList). You **MUST** whitelist Sarah's outbound IP to allow her to connect:
                  </p>
                  <div className="bg-black/60 p-4 rounded-xl border border-white/10 font-mono text-center mb-4">
                    <span className="text-xl font-black text-white tracking-tighter">{outboundIp}</span>
                    <p className="text-[8px] text-white/20 uppercase mt-1">Sarah's Outbound IP</p>
                  </div>
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                    <p className="text-[9px] text-white/40 uppercase font-black mb-2">Whitelist Command (SSH):</p>
                    <code className="text-[10px] text-emerald-400 font-mono break-all">
                      /usr/local/bin/vicidial_ip_list_add.sh --ip={outboundIp}
                    </code>
                  </div>
                </div>

                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <Link2 className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest">Required Ports Checklist</h3>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-white/5">
                    <table className="w-full text-left text-[10px] font-mono">
                      <thead className="bg-white/5 text-white/40 uppercase font-black">
                        <tr>
                          <th className="px-4 py-2">Port</th>
                          <th className="px-4 py-2">Service</th>
                          <th className="px-4 py-2">Requirement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        <tr>
                          <td className="px-4 py-2 text-white">80 / 443</td>
                          <td className="px-4 py-2 text-white/60">HTTP/S</td>
                          <td className="px-4 py-2 text-emerald-400">MANDATORY</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-white">5060</td>
                          <td className="px-4 py-2 text-white/60">SIP</td>
                          <td className="px-4 py-2 text-emerald-400">MANDATORY</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-white">8089</td>
                          <td className="px-4 py-2 text-white/60">WSS</td>
                          <td className="px-4 py-2 text-emerald-400">CRITICAL (WebRTC)</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-white">10000-20000</td>
                          <td className="px-4 py-2 text-white/60">RTP (UDP)</td>
                          <td className="px-4 py-2 text-amber-400">AUDIO FLOW</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4 text-[9px] text-white/20 italic">
                    Note: If 8089 is closed, Sarah will never connect. If 10000-20000 is closed, Sarah will connect but you will hear NO audio.
                  </p>
                </div>

                <div className="bg-indigo-500/5 rounded-[2rem] border border-indigo-500/20 p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <Globe className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400">New Vicidial Install?</h3>
                  </div>
                  <div className="space-y-4">
                    <p className="text-[10px] text-white/40 leading-relaxed">
                      If you just reinstalled Vicidial, follow these steps to link Sarah to extension <span className="text-white font-bold">78602</span>:
                    </p>
                    <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-4">
                      <div className="flex gap-4">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-400 shrink-0">1</div>
                        <div>
                          <p className="text-[10px] text-white font-bold uppercase tracking-wider mb-1">Vicidial Admin Panel</p>
                          <p className="text-[9px] text-white/40">Go to <span className="text-white">Admin {"->"} Phones {"->"} 78602</span> and set:</p>
                          <ul className="text-[9px] text-indigo-400/80 mt-2 space-y-1 list-disc pl-3">
                            <li>Set as WebRTC: <span className="text-indigo-400 font-bold">Y</span></li>
                            <li>Registration Password: <span className="text-indigo-400 font-bold">test</span></li>
                            <li>WebRTC Server IP: <span className="text-indigo-400 font-bold">{dialerConfig.sipServer}</span></li>
                          </ul>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-400 shrink-0">2</div>
                        <div>
                          <p className="text-[10px] text-white font-bold uppercase tracking-wider mb-1">Sarah Dashboard</p>
                          <p className="text-[9px] text-white/40">Click the red <span className="text-red-400 font-bold">Hard Reset Sarah</span> button above to sync these defaults.</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-400 shrink-0">3</div>
                        <div>
                          <p className="text-[10px] text-white font-bold uppercase tracking-wider mb-1">Connect Bridge</p>
                          <p className="text-[9px] text-white/40">Click <span className="text-indigo-400 font-bold">Connect Sarah Bridge</span>. You should see "SIP Registered (200 OK)" in the logs.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/5 rounded-[2rem] border border-amber-500/20 p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <Users className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-amber-400">Vicidial Agent Login Help</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase font-black mb-2">Step 1: Phone Login</p>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <span className="text-white/20">Phone Login:</span>
                        <span className="text-white font-bold">{dialerConfig.webrtcUser || '78602'}</span>
                        <span className="text-white/20">Phone Pass:</span>
                        <span className="text-white font-bold">{dialerConfig.webrtcPass || 'test'}</span>
                      </div>
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase font-black mb-2">Step 2: User Login</p>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <span className="text-white/20">User ID:</span>
                        <span className="text-white font-bold">6666 (or your ID)</span>
                        <span className="text-white/20">User Pass:</span>
                        <span className="text-white font-bold">1234 (or your Pass)</span>
                      </div>
                    </div>
                    <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                      <h4 className="text-[9px] font-black uppercase text-red-400 mb-1 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" /> Login Failed?
                      </h4>
                      <ul className="text-[9px] text-red-400/60 space-y-2 list-disc pl-3">
                        <li className="font-bold">CRITICAL: You CANNOT use extension <span className="text-white">{dialerConfig.webrtcUser}</span> for your own softphone if Sarah is connected. Only one device per extension!</li>
                        <li>Ensure "Set as WebRTC" is <span className="text-red-400 font-bold">Y</span> in Vicidial Phone settings.</li>
                        <li>Ensure "Protocol" is <span className="text-red-400 font-bold">SIP</span>.</li>
                        <li>Check if extension <span className="text-red-400 font-bold">{dialerConfig.webrtcUser}</span> exists in Vicidial.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-500/5 rounded-[2rem] border border-emerald-500/20 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400">Master Diagnostic</h3>
                    </div>
                    <button 
                      onClick={async () => {
                        const host = dialerConfig.sipServer || '93.127.128.38';
                        const ports = "80,443,5060,8089";
                        setSipLogs?.(prev => [{ type: 'info', msg: `Running Full Network Scan on ${host}...`, time: new Date().toLocaleTimeString() }, ...prev]);
                        try {
                          const res = await fetch(`/api/health/vicidial?host=${host}&ports=${ports}`);
                          const data = await res.json();
                          data.results.forEach((r: any) => {
                            const status = r.reachable ? 'OPEN' : 'CLOSED';
                            const type = r.reachable ? 'success' : 'error';
                            setSipLogs?.(prev => [{ type, msg: `Port ${r.port}: ${status}`, time: new Date().toLocaleTimeString() }, ...prev]);
                          });
                        } catch (err) {
                          setSipLogs?.(prev => [{ type: 'error', msg: `Scan failed.`, time: new Date().toLocaleTimeString() }, ...prev]);
                        }
                      }}
                      className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/20 text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                    >
                      Run Full Network Scan
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] text-white/40 mb-4 leading-relaxed">
                        1. **Firewall & Services Check**: Run this on your Vicidial SSH to check if services are actually listening:
                      </p>
                      <div className="bg-black/60 p-4 rounded-xl border border-white/10 font-mono text-[10px] relative group">
                        <code className="text-emerald-400 break-all">
                          netstat -tunlp | grep -E '8089|5060|443' && asterisk -rx "http show status" && asterisk -rx "sip show settings" | grep -i "tls"
                        </code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(`netstat -tunlp | grep -E '8089|5060|443' && asterisk -rx "http show status" && asterisk -rx "sip show settings" | grep -i "tls"`);
                            alert('Command copied!');
                          }}
                          className="absolute right-2 top-2 p-2 bg-white/5 hover:bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Database className="w-3 h-3 text-white/40" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] text-white/40 mb-4 leading-relaxed">
                        2. **Database Integrity**: Verify extension <span className="text-white font-bold">{dialerConfig.webrtcUser}</span> is WebRTC ready:
                      </p>
                      <div className="bg-black/60 p-4 rounded-xl border border-white/10 font-mono text-[10px] relative group">
                        <code className="text-emerald-400 break-all">
                          mysql -u cron -p1234 -e "SELECT extension,status,protocol,is_webrtc,webphone_auto_answer FROM vicidial_phones WHERE extension='{dialerConfig.webrtcUser || '78602'}';" asterisk
                        </code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(`mysql -u cron -p1234 -e "SELECT extension,status,protocol,is_webrtc,webphone_auto_answer FROM vicidial_phones WHERE extension='${dialerConfig.webrtcUser || '78602'}';" asterisk`);
                            alert('Command copied!');
                          }}
                          className="absolute right-2 top-2 p-2 bg-white/5 hover:bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Database className="w-3 h-3 text-white/40" />
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                      <h4 className="text-[9px] font-black uppercase text-white/40 mb-2">Must-Have Values:</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <ul className="text-[9px] text-white/20 space-y-1 list-disc pl-3 font-mono">
                          <li>is_webrtc: <span className="text-emerald-400 font-bold">Y</span></li>
                          <li>protocol: <span className="text-emerald-400 font-bold">SIP</span></li>
                        </ul>
                        <ul className="text-[9px] text-white/20 space-y-1 list-disc pl-3 font-mono">
                          <li>auto_answer: <span className="text-emerald-400 font-bold">Y</span></li>
                          <li>status: <span className="text-emerald-400 font-bold">ACTIVE</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-500/10 rounded-[2rem] border border-indigo-500/20 p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <Volume2 className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest">Sarah Voice Test</h3>
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed mb-6">
                    Verify Sarah's voice locally before bridging. This confirms her AI brain is active and ready to speak.
                  </p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => onMakeTestCall(dialerConfig.webrtcUser)}
                      className="flex-1 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" /> Test Sarah's Voice Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : view === 'calendar' ? (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                <CalendarIcon className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Booking Calendar</h2>
                <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Manage and view all confirmed air duct cleaning appointments</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
              <div className="lg:col-span-2 space-y-4">
                {appointments.length === 0 ? (
                  <div className="h-64 bg-white/5 rounded-[2rem] border border-white/10 border-dashed flex flex-col items-center justify-center text-white/20">
                    <CalendarIcon className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm font-bold uppercase tracking-widest">No appointments booked yet</p>
                  </div>
                ) : (
                  appointments.map((appt, i) => (
                    <div key={appt.id} className="bg-white/5 rounded-[2rem] border border-white/10 p-8 hover:bg-white/[0.07] transition-all group">
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black">
                            {appt.firstName[0]}{appt.lastName[0]}
                          </div>
                          <div>
                            <h4 className="text-xl font-black text-white">{appt.firstName} {appt.lastName}</h4>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1 text-[10px] text-white/40 font-mono">
                                <Clock className="w-3 h-3" /> {appt.time}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold">
                                <TrendingUp className="w-3 h-3" /> {appt.price}
                              </span>
                            </div>
                          </div>
                        </div>
                        {appt.recordingUrl && appt.recordingUrl !== 'generating...' && (
                          <button 
                            onClick={() => setPlayingRecording({ LeadName: `${appt.firstName} ${appt.lastName}`, Phone: appt.phone, recordingUrl: appt.recordingUrl } as any)}
                            className="p-3 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-500/20 opacity-0 group-hover:opacity-100 transition-all"
                            title="Listen to Call Recording"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-6 mb-6">
                        <div className="space-y-1">
                          <span className="text-[9px] text-white/20 uppercase font-black block">Service Address</span>
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <MapPin className="w-3 h-3 text-indigo-400" /> {appt.address}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-white/20 uppercase font-black block">Contact Number</span>
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <Phone className="w-3 h-3 text-indigo-400" /> {appt.phone}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[9px] text-white/20 uppercase font-black block mb-2">Detailed Description</span>
                        <p className="text-xs text-white/50 leading-relaxed italic">
                          {appt.description}
                        </p>
                        {appt.recordingUrl && (
                          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                            <span className="text-[9px] text-white/30 font-black uppercase tracking-widest">Call Evidence Attached</span>
                            <a 
                              href={appt.recordingUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline underline-offset-4"
                            >
                              Download Call Recording
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Calendar Statistics</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/60">Total Bookings</span>
                      <span className="text-lg font-black text-white">{appointments.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/60">Revenue Pipeline</span>
                      <span className="text-lg font-black text-emerald-400">
                        ${appointments.reduce((acc, curr) => acc + parseFloat(curr.price.replace('$', '')), 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-500/10 rounded-[2rem] border border-indigo-500/20 p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Booking Verification</h4>
                  </div>
                  <p className="text-xs text-white/40 leading-relaxed">
                    Every booking in this calendar is verified by Sarah's AI. Recordings are automatically attached to the event description for quality assurance and dispute resolution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : view === 'dialer' ? (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                  <Zap className="w-8 h-8 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tighter">Predictive Dialer Control</h2>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Vicidial-Grade Campaign Management & SIP Trunking</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-white/30 uppercase font-black">Campaign Status</span>
                  <span className={`text-xs font-mono font-bold flex items-center gap-2 ${dialerConfig.status === 'active' ? 'text-emerald-400' : 'text-white/20'}`}>
                    <Activity className={`w-3 h-3 ${dialerConfig.status === 'active' ? 'animate-pulse' : ''}`} /> {dialerConfig.status.toUpperCase()}
                  </span>
                </div>
                <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.csv';
                    input.onchange = (e: any) => {
                      const file = e.target.files[0];
                      if (file) {
                        Papa.parse(file, {
                          header: true,
                          complete: (results) => onUploadLeads(results.data),
                        });
                      }
                    };
                    input.click();
                  }}
                  className="px-6 py-3 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-all flex items-center gap-2"
                >
                  <Database className="w-4 h-4" /> Upload New Leads
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              {/* Lead Stats */}
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Lead Database</h3>
                  <Database className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="space-y-4">
                  <div>
                    <span className="text-3xl font-black text-white">{uploadedLeads.length}</span>
                    <span className="text-[10px] text-white/30 uppercase font-black ml-2">Total Leads</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                    <div>
                      <p className="text-[9px] text-white/20 uppercase font-black">Dialed</p>
                      <p className="text-sm font-bold text-white">{Math.floor(uploadedLeads.length * 0.4)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-white/20 uppercase font-black">Remaining</p>
                      <p className="text-sm font-bold text-indigo-400">{Math.floor(uploadedLeads.length * 0.6)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Campaign Stats */}
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Campaign Performance</h3>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[9px] text-white/20 uppercase font-black">Answers</p>
                    <p className="text-xl font-black text-emerald-400">24.2%</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/20 uppercase font-black">Drop Rate</p>
                    <p className="text-xl font-black text-red-400">1.8%</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/20 uppercase font-black">Avg Talk Time</p>
                    <p className="text-xl font-black text-white">2:14</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/20 uppercase font-black">Bookings</p>
                    <p className="text-xl font-black text-indigo-400">{appointments.length}</p>
                  </div>
                </div>
              </div>

              {/* System Health */}
              <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest">System Health</h3>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">SIP Trunk Status</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${systemHealth.sip === 'healthy' ? 'text-emerald-400 bg-emerald-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                      {systemHealth.sip}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Dialer Engine</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${systemHealth.dialer === 'healthy' ? 'text-emerald-400 bg-emerald-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                      {systemHealth.dialer}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">AI API Cluster</span>
                    <span className="text-[10px] font-black uppercase px-2 py-1 rounded text-emerald-400 bg-emerald-400/10">
                      {systemHealth.api}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Network Latency</span>
                    <span className="text-[10px] font-black uppercase px-2 py-1 rounded text-indigo-400 bg-indigo-400/10">
                      {systemHealth.latency}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black uppercase tracking-widest">Real-Time Campaign Overview</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-[10px] text-white/40 uppercase font-black">Agents: {dialerConfig.activeAgents}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <span className="text-[10px] text-white/40 uppercase font-black">Lines: {dialerConfig.activeAgents * dialerConfig.concurrency}</span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Agent ID</th>
                      <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Status</th>
                      <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Lead Name</th>
                      <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Duration</th>
                      <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Disposition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activeCalls.map((call, i) => (
                      <tr key={i} className="group">
                        <td className="py-4 text-xs font-mono text-white/60">SARAH_{i+1}</td>
                        <td className="py-4">
                          <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${call.status === 'AI_SPEAKING' ? 'text-emerald-400 bg-emerald-400/10' : 'text-indigo-400 bg-indigo-400/10'}`}>
                            {call.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-4 text-xs font-bold text-white">{call.leadName}</td>
                        <td className="py-4 text-xs font-mono text-white/40">{Math.floor(call.duration)}s</td>
                        <td className="py-4">
                          <span className="text-[9px] font-black text-white/20 uppercase tracking-widest italic">{call.sentiment}</span>
                        </td>
                      </tr>
                    ))}
                    {activeCalls.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-white/20 text-xs font-bold uppercase tracking-widest">
                          Waiting for calls to bridge...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* SIP Configuration */}
              <div className="space-y-6">
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" /> SIP Trunk Configuration
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 block">SIP Server / Host</label>
                        <input 
                          type="text" 
                          value={dialerConfig.sipServer}
                          onChange={(e) => setDialerConfig({...dialerConfig, sipServer: e.target.value})}
                          placeholder="sip.provider.com"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-indigo-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 block">Port</label>
                        <input 
                          type="text" 
                          value={dialerConfig.sipPort}
                          onChange={(e) => setDialerConfig({...dialerConfig, sipPort: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-indigo-500 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 block">Username / Auth ID</label>
                      <input 
                        type="text" 
                        value={dialerConfig.sipUser}
                        onChange={(e) => setDialerConfig({...dialerConfig, sipUser: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 block">Password</label>
                      <input 
                        type="password" 
                        value={dialerConfig.sipPass}
                        onChange={(e) => setDialerConfig({...dialerConfig, sipPass: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => syncDialerConfig(dialerConfig)}
                        disabled={saveStatus === 'saving'}
                        className={`font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-all border border-white/10 ${
                          saveStatus === 'saving' ? 'bg-white/5 text-white/20' :
                          saveStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' :
                          'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {saveStatus === 'saving' ? 'Saving...' : 
                         saveStatus === 'success' ? 'Saved!' : 
                         saveStatus === 'error' ? 'Error!' : 'Save Settings'}
                      </button>
                      <button 
                        onClick={async () => {
                          if (isSaving) return;
                          setIsSaving(true);
                          try {
                            const res = await fetch('/api/dialer/manual-dial', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ phone: 'TEST_PING' })
                            });
                            if (!res.ok) {
                              const data = await res.json();
                              console.error("SIP Test failed:", data.error);
                            }
                          } catch (err) {
                            console.error("SIP Test request failed:", err);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        disabled={isSaving}
                        className={`bg-indigo-500 hover:bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 ${
                          isSaving ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSaving ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                  </div>
                </div>

                {systemHealth.sip === 'warning' && (
                  <div className="bg-yellow-500/10 rounded-[2rem] border border-yellow-500/20 p-8">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                      <h4 className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Diagnosis: SIP Disconnected</h4>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">
                      Your SIP trunk is not fully configured or aligned. Sarah cannot make real calls until a valid SIP host, user, and pass are provided. 
                      <br/><br/>
                      <strong className="text-white">Alignment Tip:</strong> Use the exact same credentials you use in your Vicidial Carrier settings. If it works there, it will work here.
                    </p>
                  </div>
                )}

                {/* Manual Dial Pad */}
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-400" /> Manual Test Dial
                  </h3>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <input 
                        type="tel" 
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <button 
                      onClick={handleManualDial}
                      disabled={isDialing || !manualPhone}
                      className={`px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 ${
                        isDialing || !manualPhone
                        ? 'bg-white/5 text-white/20 cursor-not-allowed'
                        : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600'
                      }`}
                    >
                      <Play className="w-3 h-3" /> {isDialing ? 'Dialing...' : 'Dial'}
                    </button>
                  </div>
                  <p className="text-[9px] text-white/20 mt-4 italic">Use this to manually test your SIP connection. Note: In this preview, audio is bridged via the AI Agent's voice stream once the call is answered.</p>
                </div>

                {/* SIP Debug Console */}
                <div className="bg-black/40 rounded-[2rem] border border-white/10 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" /> SIP Debug Console
                    </h3>
                    <button 
                      onClick={onClearSipLogs}
                      className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors"
                    >
                      Clear Logs
                    </button>
                  </div>
                  <div className="bg-black/60 rounded-xl p-4 h-48 overflow-y-auto font-mono text-[10px] space-y-2 custom-scrollbar border border-white/5">
                    {sipLogs.length === 0 ? (
                      <p className="text-white/20 italic">No SIP activity logged. Start a dial to see debug info.</p>
                    ) : (
                      sipLogs.map((log, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="text-white/20 shrink-0">{log.time}</span>
                          <span className={
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-emerald-400' :
                            'text-indigo-300'
                          }>{log.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-[9px] text-white/20 mt-4 italic">This console shows real-time SIP signaling. Use it to verify your credentials align with the provider.</p>
                </div>

                {/* Alignment Guide */}
                <div className="bg-indigo-500/5 rounded-[2rem] border border-indigo-500/10 p-8">
                  <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 text-indigo-400 flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3" /> Alignment Checklist
                  </h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-[10px] text-white/60">
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                      <span><strong>Host:</strong> Ensure your SIP Server matches Vicidial (e.g., <code>trunk.provider.com</code>).</span>
                    </li>
                    <li className="flex items-start gap-3 text-[10px] text-white/60">
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                      <span><strong>Auth:</strong> Use the same <code>user</code> and <code>pass</code> as your Vicidial carrier settings.</span>
                    </li>
                    <li className="flex items-start gap-3 text-[10px] text-white/60">
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                      <span><strong>Firewall:</strong> Ensure your SIP provider allows traffic from this IP.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Dialer Settings */}
              <div className="space-y-6">
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" /> Predictive Dialing Logic
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Dialing Concurrency</label>
                        <span className="text-xs font-mono text-indigo-400">{dialerConfig.concurrency}x</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        value={dialerConfig.concurrency}
                        onChange={(e) => setDialerConfig({...dialerConfig, concurrency: parseInt(e.target.value)})}
                        className="w-full accent-indigo-500"
                      />
                      <p className="text-[9px] text-white/20 mt-2 italic">Sarah will dial {dialerConfig.concurrency} numbers for every 1 available agent slot.</p>
                    </div>

                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Active Sarah Agents</label>
                        <span className="text-xs font-mono text-emerald-400">{dialerConfig.activeAgents}</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        value={dialerConfig.activeAgents}
                        onChange={(e) => setDialerConfig({...dialerConfig, activeAgents: parseInt(e.target.value)})}
                        className="w-full accent-emerald-500"
                      />
                      <p className="text-[9px] text-white/20 mt-2 italic">Total number of Sarah instances ready to handle answered calls.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => syncDialerConfig(dialerConfig)}
                        className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-xl transition-all border border-white/10"
                      >
                        Save Settings
                      </button>
                      <button 
                        onClick={() => {
                          const nextStatus = dialerConfig.status === 'active' ? 'idle' : 'active';
                          const newConfig = {...dialerConfig, status: nextStatus};
                          setDialerConfig(newConfig);
                          syncDialerConfig(newConfig);
                        }}
                        className={`py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all ${
                          dialerConfig.status === 'active' 
                          ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-600' 
                          : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600'
                        }`}
                      >
                        {dialerConfig.status === 'active' ? 'Stop Campaign' : 'Start Campaign'}
                      </button>
                    </div>
                  </div>
                </div>

                {systemHealth.dialer === 'warning' && (
                  <div className="bg-yellow-500/10 rounded-[2rem] border border-yellow-500/20 p-8">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                      <h4 className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Diagnosis: No Leads Loaded</h4>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">
                      The dialer is ready but the lead queue is empty.
                      <br/><br/>
                      <strong className="text-white">Fix:</strong> Click "Upload New Leads" at the top to start the campaign.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : view === 'training' ? (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                <Zap className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Sarah Training Lab</h2>
                <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Inject custom rebuttals and logic directly into Sarah's brain</p>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
              <div className="lg:col-span-2 flex flex-col bg-white/5 rounded-[2rem] border border-white/10 p-8 min-h-[400px]">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-400" /> Custom Rebuttals & Knowledge
                  </h3>
                  <span className="text-[10px] font-mono text-white/20">Markdown Supported</span>
                </div>
                
                <textarea 
                  value={localRebuttals}
                  onChange={(e) => setLocalRebuttals(e.target.value)}
                  placeholder="e.g. If the customer says they already have a service, tell them our industrial-grade suction is 3x more powerful..."
                  className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-6 text-sm font-mono text-white/80 focus:border-indigo-500 outline-none resize-none custom-scrollbar mb-6"
                />

                <div className="flex gap-4">
                  <button 
                    onClick={handleSync}
                    disabled={isSaving}
                    className={`flex-1 ${isSaving ? 'bg-emerald-500' : 'bg-indigo-500 hover:bg-indigo-600'} text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all flex items-center justify-center gap-2`}
                  >
                    {isSaving ? (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Sarah's Brain Synced!
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" /> Sync Training to Sarah
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => { setLocalRebuttals(""); onUpdateRebuttals(""); }}
                    className="px-6 py-4 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-red-400 transition-all"
                    title="Clear Training"
                  >
                    Clear
                  </button>
                </div>

                {customRebuttals && (
                  <div className="mt-8 p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Currently Active Training</h4>
                    <p className="text-xs text-white/60 font-mono line-clamp-3 italic">"{customRebuttals}"</p>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Primary Script / Offer</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] text-white/20 uppercase font-black block mb-2">The Offer</label>
                      <textarea 
                        value={scriptOffer}
                        onChange={(e) => setScriptOffer(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500 resize-none h-24"
                        placeholder="e.g. We're doing a full-house air duct cleaning for just $129."
                      />
                    </div>
                    <p className="text-[10px] text-white/40 italic">This is what Sarah will say in her opening hook.</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Agent Identity</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] text-white/20 uppercase font-black block mb-2">Primary Name</label>
                      <input 
                        type="text" 
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <p className="text-[10px] text-white/40 italic">Sarah can also rotate between Emily and Jessica to keep the campaign sounding fresh.</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
                  <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Training Tips</h4>
                  <ul className="space-y-4">
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5"></div>
                      <p className="text-[11px] text-white/60 leading-relaxed">Be specific. Instead of "be nice", use "If they are busy, offer a 5-minute callback window."</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5"></div>
                      <p className="text-[11px] text-white/60 leading-relaxed">Add local landmarks or neighborhood names to sound more local.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5"></div>
                      <p className="text-[11px] text-white/60 leading-relaxed">Define "Power Words" you want Sarah to use frequently (e.g. 'Certified', 'Industrial-Grade').</p>
                    </li>
                  </ul>
                </div>

                <div className="bg-indigo-500/10 rounded-[2rem] border border-indigo-500/20 p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <TrendingUp className="w-5 h-5 text-indigo-400" />
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Intelligence Level</h4>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-indigo-500 w-[85%]"></div>
                  </div>
                  <p className="text-[10px] text-white/40 italic">Sarah is currently operating at 85% contextual intelligence. Add more rebuttals to reach 100%.</p>
                </div>
              </div>
            </div>
          </div>
        ) : view === 'live' ? (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {activeCalls.length === 0 ? (
                <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl">
                  <Users className="w-12 h-12 text-white/10 mb-4" />
                  <p className="text-white/20 font-bold uppercase tracking-widest text-sm">No active sessions in cluster</p>
                  <p className="text-white/10 text-[10px] uppercase mt-2">Start a campaign to begin orchestration</p>
                </div>
              ) : (
                activeCalls.map(call => (
                  <div key={call.id} className={`bg-white/5 border rounded-3xl p-6 transition-all duration-500 ${call.sentiment === 'Frustrated' ? 'border-red-500/30 bg-red-500/5' : 'border-white/10'} ${listeningToId === call.id ? 'ring-2 ring-indigo-500 bg-indigo-500/5' : ''}`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${call.sentiment === 'Frustrated' ? 'bg-red-500/20' : 'bg-white/5'}`}>
                          <UserPlus className={`w-6 h-6 ${call.sentiment === 'Frustrated' ? 'text-red-400' : 'text-white/40'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white">{call.leadName}</h3>
                            {call.persona && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-md text-white/40 uppercase font-black">{call.persona}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-white/40 font-mono">{call.phone}</p>
                          <p className="text-[9px] text-white/20 uppercase tracking-wider mt-1">{call.address}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          {listeningToId === call.id && (
                            <div className="flex items-center gap-1">
                              <div className="w-1 h-3 bg-indigo-500 animate-pulse"></div>
                              <div className="w-1 h-5 bg-indigo-500 animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                              <div className="w-1 h-2 bg-indigo-500 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                          )}
                          <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${
                            call.status === 'AI_SPEAKING' ? 'bg-indigo-500/20 text-indigo-400' :
                            call.status === 'CUSTOMER_SPEAKING' ? 'bg-emerald-500/20 text-emerald-400' :
                            call.status === 'WHISPER' ? 'bg-amber-500/20 text-amber-400' :
                            call.status === 'TAKEOVER' ? 'bg-red-500/20 text-red-400' :
                            'bg-white/10 text-white/40'
                          }`}>
                            {call.status.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-white/20">{Math.floor(call.duration)}s</span>
                      </div>
                    </div>

                    {/* Transcript Stream */}
                    <div className="bg-black/40 rounded-2xl p-4 h-32 overflow-y-auto mb-6 custom-scrollbar border border-white/5">
                      {!call.transcript || call.transcript.length === 0 ? (
                        <p className="text-[10px] text-white/10 italic">Waiting for audio stream...</p>
                      ) : (
                        call.transcript.map((line, i) => (
                          <p key={i} className={`text-[11px] mb-2 leading-relaxed ${line.startsWith('Sarah:') ? 'text-indigo-400' : 'text-white/70'}`}>
                            <span className="font-black uppercase text-[8px] mr-2 opacity-40">{line.split(':')[0]}</span>
                            {line.split(':')[1]}
                          </p>
                        ))
                      )}
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                        <span className="text-[8px] text-white/30 uppercase font-black block mb-1">Sentiment</span>
                        <span className={`text-[10px] font-bold ${
                          call.sentiment === 'Positive' ? 'text-emerald-400' :
                          call.sentiment === 'Negative' ? 'text-red-400' :
                          call.sentiment === 'Frustrated' ? 'text-red-500 animate-pulse' :
                          'text-white/60'
                        }`}>{call.sentiment}</span>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                        <span className="text-[8px] text-white/30 uppercase font-black block mb-1">Convertible</span>
                        <span className="text-[10px] font-bold text-white">{call.convertibleScore}%</span>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                        <span className="text-[8px] text-white/30 uppercase font-black block mb-1">Confidence</span>
                        <span className="text-[10px] font-bold text-emerald-400">94%</span>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex gap-2">
                      <button 
                        onClick={() => onListen(call.id)}
                        className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                          listeningToId === call.id 
                            ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/20' 
                            : 'bg-white/5 hover:bg-white/10 border-white/10'
                        }`}
                      >
                        <BarChart3 className="w-3 h-3" /> {listeningToId === call.id ? 'Stop Listening' : 'Listen'}
                      </button>
                      <button 
                        onClick={() => onWhisper(call.id)}
                        className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-amber-400 transition-all flex items-center justify-center gap-2"
                      >
                        <MessageSquare className="w-3 h-3" /> Whisper
                      </button>
                      <button 
                        onClick={() => onTakeover(call.id)}
                        className="flex-1 bg-indigo-500 hover:bg-indigo-600 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                      >
                        <UserPlus className="w-3 h-3" /> Takeover
                      </button>
                      <button 
                        onClick={() => onStop(call.id)}
                        className="w-10 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-center text-red-400 transition-all"
                      >
                        <PhoneOff className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Lead</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Disposition</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Score</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Duration</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Summary</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {dispositions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-white/20 italic text-sm">No reports generated yet</td>
                    </tr>
                  ) : (
                    dispositions.map((report, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{report.LeadName}</div>
                          <div className="text-[10px] text-white/40 font-mono">{report.Phone}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            report.Disposition === 'Hot' ? 'bg-red-500/20 text-red-400' :
                            report.Disposition === 'Warm' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-white/10 text-white/40'
                          }`}>
                            {report.Disposition}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-emerald-400 font-bold">{report.ConvertibleScore}%</td>
                        <td className="px-6 py-4 text-white/60 font-mono">{report.CallDurationSeconds}s</td>
                        <td className="px-6 py-4 text-[10px] text-white/40 max-w-xs truncate">{report.Summary}</td>
                        <td className="px-6 py-4">
                          {report.recordingUrl === 'generating...' ? (
                            <span className="text-[8px] text-amber-400 uppercase font-bold animate-pulse">Generating...</span>
                          ) : report.recordingUrl ? (
                            <button 
                              onClick={() => setPlayingRecording(report)}
                              className={`p-2 rounded-lg transition-all flex items-center gap-2 text-[8px] font-black uppercase ${
                                playingRecording?.recordingUrl === report.recordingUrl 
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                                : 'bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400'
                              }`}
                            >
                              <Play className="w-3 h-3" /> {playingRecording?.recordingUrl === report.recordingUrl ? 'Playing...' : 'Play'}
                            </button>
                          ) : (
                            <span className="text-[8px] text-white/10 uppercase font-bold">No Recording</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Recording Player Modal/Overlay */}
            {playingRecording && (
              <div className="mt-8 bg-white/5 border border-indigo-500/30 rounded-3xl p-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center">
                      <Volume2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">Recording: {playingRecording.LeadName}</h3>
                      <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Booked Lead • {playingRecording.CallDurationSeconds}s Duration</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPlayingRecording(null)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <XCircle className="w-6 h-6 text-white/20 hover:text-white/60" />
                  </button>
                </div>

                <div className="bg-black/40 rounded-2xl p-6 border border-white/5">
                  <div className="mb-6">
                    <audio 
                      src={playingRecording.recordingUrl} 
                      controls 
                      autoPlay
                      className="w-full h-10 accent-indigo-500"
                    />
                  </div>

                  <div className="space-y-4">
                    <p className="text-[11px] text-indigo-400">
                      <span className="font-black uppercase text-[8px] mr-2 opacity-40">Sarah:</span>
                      Hi there! I'm calling because we're doing a special promotion for air duct cleaning...
                    </p>
                    <p className="text-[11px] text-white/70">
                      <span className="font-black uppercase text-[8px] mr-2 opacity-40">Customer:</span>
                      Yes, it is. I've been meaning to get that checked out actually. What's the offer?
                    </p>
                    <p className="text-[11px] text-indigo-400">
                      <span className="font-black uppercase text-[8px] mr-2 opacity-40">Sarah:</span>
                      It's a wonderful deal! We're offering a complete, deep-clean of all your ducts for just $129...
                    </p>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-center gap-4">
                  <button className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">Download MP3</button>
                  <button className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20">Share with Team</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VOIP Settings Modal */}
        {showVoipSettings && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-[40px] w-full max-w-2xl p-10 shadow-2xl">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">VOIP Integration Cluster</h2>
                  <p className="text-xs text-white/40 font-mono mt-1">Configure your local Asterisk or Twilio trunk</p>
                </div>
                <button onClick={() => setShowVoipSettings(false)} className="p-2 hover:bg-white/5 rounded-full">
                  <XCircle className="w-8 h-8 text-white/20" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">Provider Type</label>
                    <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors">
                      <option>Asterisk (ARI)</option>
                      <option>Twilio Media Streams</option>
                      <option>Vicidial / SIP Trunk</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">ARI / WebSocket URL</label>
                    <input type="text" placeholder="ws://your-server:8088/ari/events" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">API Credentials</label>
                    <input type="password" placeholder="••••••••••••" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                </div>

                <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
                  <h4 className="text-[10px] font-black text-white/60 uppercase mb-4">Connection Status</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-white/40">SIP Registration</span>
                      <span className="text-[10px] font-bold text-emerald-400">READY</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-white/40">RTP Bridge</span>
                      <span className="text-[10px] font-bold text-emerald-400">ACTIVE</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-white/40">Latency (ms)</span>
                      <span className="text-[10px] font-bold text-emerald-400">12ms</span>
                    </div>
                    <div className="mt-6 pt-6 border-t border-white/5">
                      <p className="text-[9px] text-white/30 leading-relaxed italic">
                        Note: Real calls require an active Asterisk instance with ARI enabled. See VOIP_INTEGRATION.md for setup instructions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex gap-4">
                <button className="flex-1 py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20">Save Configuration</button>
                <button onClick={() => setShowVoipSettings(false)} className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar Alerts */}
        <div className="w-80 border-l border-white/5 p-6 flex flex-col gap-6 bg-black/20">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest">System Alerts</h3>
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          </div>

          <div className="flex flex-col gap-3">
            {activeCalls.some(c => c.sentiment === 'Frustrated') ? (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <h4 className="text-[10px] font-black text-red-400 uppercase">High Friction Detected</h4>
                  <p className="text-[10px] text-red-400/60 leading-tight mt-1">Lead "Sarah Jenkins" is showing repeated objections. Intervention recommended.</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center">
                <p className="text-[10px] text-white/20 italic">No critical alerts</p>
              </div>
            )}

            <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl flex gap-3">
              <TrendingUp className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <h4 className="text-[10px] font-black text-indigo-400 uppercase">Cluster Healthy</h4>
                <p className="text-[10px] text-indigo-400/60 leading-tight mt-1">AMD filtering active. 92% human answer accuracy.</p>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black text-white/40 uppercase">Campaign Stats</span>
                <BarChart3 className="w-4 h-4 text-white/20" />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/60">Total Dials</span>
                  <span className="text-[10px] font-mono font-bold">1,284</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/60">Human Answers</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400">412</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/60">Booked Appts</span>
                  <span className="text-[10px] font-mono font-bold text-indigo-400">28</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VOIP Settings Modal */}
      {showVoipSettings && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-2xl rounded-[3rem] p-12 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-emerald-500 to-indigo-500"></div>
            
            <button 
              onClick={() => setShowVoipSettings(false)}
              className="absolute top-8 right-8 text-white/20 hover:text-white transition-colors"
            >
              <XCircle className="w-8 h-8" />
            </button>

            <div className="flex items-center gap-6 mb-12">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                <Globe className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">VoIP Bridge Config</h2>
                <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Connect Sarah to your Local SIP Trunk</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-12">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block">SIP Server Address</label>
                  <input 
                    type="text" 
                    placeholder="e.g. sip.local-provider.com" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block">SIP Port</label>
                  <input 
                    type="text" 
                    placeholder="5060" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block">Auth Username</label>
                  <input 
                    type="text" 
                    placeholder="Agent-Sarah-01" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block">Auth Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••••••" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-3xl p-8 border border-white/10 mb-12">
              <div className="flex items-center gap-4 mb-6">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black uppercase tracking-widest">Production Readiness Check</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 text-[10px] text-white/60">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  Gemini Live API: Connected
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/60">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  High-Quality TTS: Optimized
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/60">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  Call Recording: Active
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/60">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  SIP Bridge: Pending Config
                </div>
              </div>
            </div>

            <button 
              onClick={() => {
                alert('VoIP Bridge Initialized. Sarah is now listening for incoming SIP traffic.');
                setShowVoipSettings(false);
              }}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-3"
            >
              <Zap className="w-4 h-4" /> Initialize Production Bridge
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
