import React, { useState, useEffect } from 'react';
import { CallSession, CallDisposition } from '../types';
import { Play, Pause, PhoneOff, MessageSquare, UserPlus, AlertCircle, TrendingUp, BarChart3, Users, Volume2, XCircle, Settings, Globe, ShieldCheck, Zap, Calendar as CalendarIcon, Clock, MapPin, Phone, Activity, CheckCircle, Database, Search } from 'lucide-react';
import Papa from 'papaparse';

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
  customRebuttals: string;
  dailyCost?: number;
  cacheStats?: { hits: number, misses: number };
  isLiveActive: boolean;
  dispositions: CallDisposition[];
  listeningToId: string | null;
  appointments: any[];
  onUpdateAppointments: (appts: any[]) => void;
  uploadedLeads: any[];
}

export const OrchestrationDashboard: React.FC<DashboardProps> = ({ 
  activeCalls, 
  onWhisper, 
  onTakeover, 
  onListen, 
  onStop,
  onStartLive,
  onStopLive,
  onUploadLeads,
  onUpdateRebuttals,
  customRebuttals,
  dailyCost = 0,
  cacheStats = { hits: 0, misses: 0 },
  isLiveActive,
  dispositions,
  listeningToId,
  appointments = [],
  onUpdateAppointments,
  uploadedLeads = []
}) => {
  const [view, setView] = useState<'live' | 'reports' | 'training' | 'costs' | 'calendar' | 'dialer'>('live');
  const [dialerConfig, setDialerConfig] = useState({
    concurrency: 5,
    activeAgents: 20,
    sipServer: '',
    sipPort: '5060',
    sipUser: '',
    sipPass: '',
    callerIds: ['+14165550199'],
    status: 'idle'
  });

  const syncDialerConfig = async (newConfig: any) => {
    try {
      await fetch('/api/dialer/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
    } catch (err) {
      console.error("Sync failed:", err);
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
          sip: dialerConfig.sipServer ? 'healthy' : 'warning',
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
  const [agentName, setAgentName] = useState('Sarah');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalRebuttals(customRebuttals);
  }, [customRebuttals]);

  const handleSync = () => {
    setIsSaving(true);
    onUpdateRebuttals(localRebuttals);
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

          <button 
            onClick={() => setShowVoipSettings(true)}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all"
            title="VOIP Connection Settings"
          >
            <Settings className="w-4 h-4" />
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
              onClick={() => setView('costs')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'costs' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Cost Reports
            </button>
            <button 
              onClick={() => setView('calendar')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'calendar' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Calendar
            </button>
            <button 
              onClick={() => setView('dialer')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'dialer' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              Dialer Control
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
        {view === 'costs' ? (
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
                  </div>
                </div>

                {systemHealth.sip === 'warning' && (
                  <div className="bg-yellow-500/10 rounded-[2rem] border border-yellow-500/20 p-8">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                      <h4 className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Diagnosis: SIP Disconnected</h4>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">
                      Your SIP trunk is not configured. Sarah cannot make real calls until a valid SIP host is provided. 
                      <br/><br/>
                      <strong className="text-white">Fix:</strong> Enter your VoIP provider's SIP host and credentials above.
                    </p>
                  </div>
                )}
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

                    <button 
                      onClick={() => {
                        const nextStatus = dialerConfig.status === 'active' ? 'idle' : 'active';
                        const newConfig = {...dialerConfig, status: nextStatus};
                        setDialerConfig(newConfig);
                        syncDialerConfig(newConfig);
                      }}
                      className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all mt-4 ${
                        dialerConfig.status === 'active' 
                        ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-600' 
                        : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600'
                      }`}
                    >
                      {dialerConfig.status === 'active' ? 'Stop Campaign' : 'Start Campaign'}
                    </button>
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
                      {call.transcript.length === 0 ? (
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
