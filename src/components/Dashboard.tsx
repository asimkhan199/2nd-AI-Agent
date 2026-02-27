import React, { useState, useEffect } from 'react';
import { CallSession, CallDisposition } from '../types';
import { Play, Pause, PhoneOff, MessageSquare, UserPlus, AlertCircle, TrendingUp, BarChart3, Users } from 'lucide-react';

interface DashboardProps {
  activeCalls: CallSession[];
  onWhisper: (callId: string) => void;
  onTakeover: (callId: string) => void;
  onListen: (callId: string) => void;
  onStop: (callId: string) => void;
  dispositions: CallDisposition[];
}

export const OrchestrationDashboard: React.FC<DashboardProps> = ({ 
  activeCalls, 
  onWhisper, 
  onTakeover, 
  onListen, 
  onStop,
  dispositions 
}) => {
  const [view, setView] = useState<'live' | 'reports'>('live');

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter">Sarah Orchestration Engine</h1>
            <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">v2.5 Production Cluster</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
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
          </div>

          <div className="flex items-center gap-4 border-l border-white/10 pl-6">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-white/30 uppercase font-black">Concurrency</span>
              <span className="text-sm font-mono font-bold text-emerald-400">{activeCalls.length} / 20</span>
            </div>
            <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500" 
                style={{ width: `${(activeCalls.length / 20) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {view === 'live' ? (
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
                  <div key={call.id} className={`bg-white/5 border rounded-3xl p-6 transition-all duration-500 ${call.sentiment === 'Frustrated' ? 'border-red-500/30 bg-red-500/5' : 'border-white/10'}`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${call.sentiment === 'Frustrated' ? 'bg-red-500/20' : 'bg-white/5'}`}>
                          <UserPlus className={`w-6 h-6 ${call.sentiment === 'Frustrated' ? 'text-red-400' : 'text-white/40'}`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-white">{call.leadName}</h3>
                          <p className="text-[10px] text-white/40 font-mono">{call.phone}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${
                          call.status === 'AI_SPEAKING' ? 'bg-indigo-500/20 text-indigo-400' :
                          call.status === 'CUSTOMER_SPEAKING' ? 'bg-emerald-500/20 text-emerald-400' :
                          call.status === 'WHISPER' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-white/10 text-white/40'
                        }`}>
                          {call.status.replace('_', ' ')}
                        </span>
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
                        className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <BarChart3 className="w-3 h-3" /> Listen
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
                  </tr>
                </thead>
                <tbody>
                  {dispositions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-white/20 italic text-sm">No reports generated yet</td>
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
    </div>
  );
};
