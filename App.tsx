
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
import { User, ConnectionEvent } from './types';

const generateId = () => Math.random().toString(36).substring(2, 11);

export default function App() {
  const [roomCode, setRoomCode] = useState(() => {
    return new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '';
  });

  const [localUser, setLocalUser] = useState<User | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const uId = params.get('u');
    const uName = params.get('n');
    if (uId && uName) {
      // Added handle property to match updated User interface
      return { id: uId, name: uName, handle: uName, deviceType: 'mobile', lastSeen: Date.now(), score: 0, isOnline: true };
    }
    return null;
  });

  const [view, setView] = useState<'landing' | 'host' | 'guest'>(() => {
    if (localUser) return 'guest';
    return 'landing';
  });

  // Mesh State
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [lastEvent, setLastEvent] = useState<ConnectionEvent | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Yjs Persistence
  const doc = useMemo(() => new Y.Doc(), []);
  const usersMap = useMemo(() => doc.getMap<User>('users'), [doc]);
  const eventsMap = useMemo(() => doc.getMap<ConnectionEvent>('events'), [doc]);

  useEffect(() => {
    if (!roomCode) return;

    const fullRoomName = `sblix-v6-${roomCode}`;
    const signaling = [
      'wss://signaling.yjs.dev',
      'wss://y-webrtc-signaling-us.herokuapp.com',
      'wss://y-webrtc-signaling-eu.herokuapp.com'
    ];

    const webrtc = new WebrtcProvider(fullRoomName, doc, { signaling });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    setIsSyncing(true);

    const sync = () => {
      setAllUsers(Object.values(usersMap.toJSON() as Record<string, User>));
      
      // Check for incoming events directed at us
      const currentEvents = eventsMap.toJSON() as Record<string, ConnectionEvent>;
      const relevantEvent = Object.values(currentEvents).find(e => 
        (e.targetId === (localUser?.id || 'host') || e.targetId === 'all') && 
        Date.now() - e.timestamp < 3000
      );
      if (relevantEvent) setLastEvent(relevantEvent);
    };

    usersMap.observe(sync);
    eventsMap.observe(sync);

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (localUser) {
        usersMap.set(localUser.id, { ...localUser, lastSeen: Date.now(), isOnline: true });
      } else if (view === 'host') {
        // Added handle property to match updated User interface
        usersMap.set('host', { id: 'host', name: 'MASTER HUB', handle: 'HUB', deviceType: 'desktop', lastSeen: Date.now(), score: 0, isOnline: true });
      }
      
      // Offline cleanup (Host only)
      if (view === 'host') {
        usersMap.forEach((u, id) => {
          if (Date.now() - u.lastSeen > 10000 && u.isOnline) {
            usersMap.set(id, { ...u, isOnline: false });
          }
        });
      }
    }, 3000);

    return () => {
      clearInterval(heartbeat);
      webrtc.destroy();
      ws.destroy();
    };
  }, [roomCode, localUser, view, doc, usersMap, eventsMap]);

  const sendPing = (targetId: string) => {
    const fromId = localUser?.id || 'host';
    eventsMap.set(`${fromId}-${targetId}`, {
      type: 'ping',
      fromId,
      targetId,
      timestamp: Date.now()
    });
  };

  // --- VIEWS ---

  if (view === 'landing') {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8">
        <div className="max-w-sm w-full space-y-12 text-center">
          <div className="relative inline-block">
            <div className="w-24 h-24 bg-emerald-500 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.4)] animate-pulse">
              <i className="fas fa-tower-broadcast text-black text-4xl"></i>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-orbitron font-black text-white italic tracking-tighter uppercase">SBLIX MESH</h1>
            <p className="text-[10px] font-black text-slate-500 tracking-[0.5em] uppercase">Persistent Connection Engine</p>
          </div>
          <div className="space-y-4">
            <button 
              onClick={() => setView('host')}
              className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-3xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              Initialize Host
            </button>
            <p className="text-slate-700 text-[10px] font-bold uppercase tracking-widest">Recommended for Desktop / Tablet</p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'host') {
    return (
      <div className="min-h-screen bg-[#02020a] text-white p-6 lg:p-12 font-inter overflow-x-hidden">
        {lastEvent && lastEvent.targetId === 'host' && (
          <div className="fixed top-10 right-10 bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-2xl animate-bounce z-[100]">
            <i className="fas fa-bell mr-2"></i> Guest Signal Received
          </div>
        )}

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left: Configuration */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-4">
              <h1 className="text-7xl font-orbitron font-black italic tracking-tighter text-white leading-[0.8]">HUB<br/><span className="text-emerald-500">SYNC</span></h1>
              <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-2xl border border-white/5">
                <input 
                  placeholder="ROOM NAME" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="bg-transparent px-4 py-3 text-2xl font-black text-white outline-none w-full placeholder:text-slate-800"
                />
                <div className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[10px] font-black tracking-widest border border-emerald-500/20">
                  {isSyncing ? 'LINKED' : 'OFFLINE'}
                </div>
              </div>
            </div>

            <div className="glass-card p-8 space-y-6 border-white/10 shadow-2xl">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Add New Huddle Member</h2>
              <div className="space-y-4">
                <input id="guestNameInput" placeholder="Enter Guest Display Name" className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xl font-bold text-white outline-none focus:border-emerald-500" />
                <button 
                  onClick={() => {
                    const el = document.getElementById('guestNameInput') as HTMLInputElement;
                    if (!el.value || !roomCode) return;
                    const id = generateId();
                    const name = el.value.toUpperCase();
                    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}&u=${id}&n=${encodeURIComponent(name)}`;
                    const newGuest = { id, name, url };
                    (window as any).guestList = [...((window as any).guestList || []), newGuest];
                    el.value = '';
                    setAllUsers(prev => [...prev]);
                  }}
                  className="w-full bg-emerald-500 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-xl shadow-emerald-500/20"
                >
                  Create Secure Ticket
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {((window as any).guestList || []).map((g: any) => (
                <div key={g.id} className="glass-card p-4 flex flex-col items-center gap-3 border-white/5 animate-in zoom-in duration-300">
                  <div className="bg-white p-1 rounded-lg">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(g.url)}&color=020617`} className="w-20 h-20" />
                  </div>
                  <div className="text-center">
                    <div className="font-black text-white text-[10px] uppercase truncate w-24">{g.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Mesh Status */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex justify-between items-center px-4">
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500">Live Connection Matrix</h2>
              <div className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-slate-400">
                ACTIVE NODES: {allUsers.filter(u => u.isOnline).length}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {allUsers.map(u => (
                <div key={u.id} className={`glass-card p-6 flex items-center justify-between border-l-4 transition-all duration-500 ${u.isOnline ? 'border-l-emerald-500 bg-emerald-500/5' : 'border-l-red-500/20 bg-red-500/5 opacity-40'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg ${u.deviceType === 'desktop' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      <i className={`fas fa-${u.deviceType === 'desktop' ? 'laptop' : 'mobile-alt'}`}></i>
                    </div>
                    <div>
                      <div className="font-black text-white uppercase tracking-tight">{u.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${u.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{u.isOnline ? 'Linked' : 'Lost Signal'}</span>
                      </div>
                    </div>
                  </div>
                  {u.isOnline && u.id !== 'host' && (
                    <button 
                      onClick={() => sendPing(u.id)}
                      className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-emerald-500 hover:text-black transition-all border border-white/10 flex items-center justify-center"
                    >
                      <i className="fas fa-bolt"></i>
                    </button>
                  )}
                </div>
              ))}
              {allUsers.length === 0 && (
                <div className="col-span-2 py-32 border-2 border-dashed border-white/5 rounded-[3rem] text-center flex flex-col items-center justify-center gap-4 text-slate-800">
                   <i className="fas fa-network-wired text-5xl"></i>
                   <p className="text-[10px] font-black uppercase tracking-[0.5em]">Awaiting Peer Connections...</p>
                </div>
              )}
            </div>

            {/* Global Standings Preview */}
            <div className="glass-card p-8 mt-12 bg-indigo-500/5 border-indigo-500/20">
               <h3 className="font-orbitron font-black text-xl text-white mb-6 uppercase italic flex items-center gap-3">
                 <i className="fas fa-trophy text-yellow-500"></i>
                 Consolidated Standings
               </h3>
               <div className="space-y-3">
                 {allUsers.filter(u => u.deviceType === 'mobile').sort((a,b) => b.score - a.score).map((u, i) => (
                   <div key={u.id} className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <span className="text-slate-500 font-black text-xs">{i + 1}</span>
                        <span className="font-bold text-sm uppercase">{u.name}</span>
                      </div>
                      <div className="font-orbitron font-black text-emerald-400 text-lg">{u.score}</div>
                   </div>
                 ))}
                 {allUsers.filter(u => u.deviceType === 'mobile').length === 0 && (
                   <p className="text-center text-[10px] text-slate-600 uppercase font-black py-4">Leaderboard Empty</p>
                 )}
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'guest' && localUser) {
    const isPinged = lastEvent && lastEvent.targetId === localUser.id && Date.now() - lastEvent.timestamp < 3000;

    return (
      <div className={`h-screen flex flex-col transition-all duration-300 relative overflow-hidden ${isPinged ? 'bg-emerald-500 scale-95' : 'bg-[#020617]'}`}>
        {/* Sync Status Header */}
        <div className="p-6 pt-10 flex justify-between items-center shrink-0">
          <div className="flex flex-col">
            <h1 className={`font-orbitron font-black text-2xl tracking-tighter italic ${isPinged ? 'text-black' : 'text-white'}`}>SBLIX SYNC</h1>
            <span className={`text-[9px] font-black uppercase tracking-widest mt-1 ${isPinged ? 'text-emerald-900' : 'text-emerald-500'}`}>MESH STABLE</span>
          </div>
          <div className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${isPinged ? 'bg-black text-emerald-500 border-black' : 'bg-white/5 border-white/10 text-slate-500'}`}>
            ROOM: {roomCode}
          </div>
        </div>

        <main className="flex-1 flex flex-col items-center justify-center p-8 space-y-12">
          <div className="relative">
            <div className={`w-40 h-40 rounded-[3rem] flex items-center justify-center shadow-2xl transition-all duration-500 ${isPinged ? 'bg-white text-emerald-500 rotate-12 scale-110' : 'bg-emerald-500 text-black'}`}>
               <i className={`fas fa-${isPinged ? 'bolt-lightning animate-bounce' : 'fingerprint'} text-6xl`}></i>
            </div>
            {!isPinged && (
              <div className="absolute inset-0 rounded-[3rem] border-4 border-emerald-500/20 animate-ping"></div>
            )}
          </div>

          <div className="text-center space-y-2">
            <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] ${isPinged ? 'text-emerald-900' : 'text-slate-500'}`}>Identity Verified</h2>
            <h1 className={`text-4xl font-orbitron font-black uppercase italic ${isPinged ? 'text-black' : 'text-white'}`}>{localUser.name}</h1>
          </div>

          <div className="w-full max-w-xs space-y-4">
            <button 
               onClick={() => sendPing('host')}
               className={`w-full py-6 rounded-3xl font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-3 ${isPinged ? 'bg-black text-white' : 'bg-white text-black'}`}
            >
              <i className="fas fa-satellite"></i>
              Ping Hub
            </button>
            
            <div className={`p-6 rounded-3xl border text-center transition-all ${isPinged ? 'bg-black/10 border-black/20 text-black' : 'bg-slate-900/50 border-white/5'}`}>
               <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Your Score</div>
               <div className={`text-4xl font-orbitron font-black ${isPinged ? 'text-black' : 'text-emerald-500'}`}>{localUser.score}</div>
            </div>
          </div>
        </main>

        <footer className={`p-8 text-center transition-all ${isPinged ? 'text-emerald-900' : 'text-slate-700'}`}>
          <p className="text-[9px] font-black uppercase tracking-[0.3em]">Protocol v6.0.4 Deployment Active</p>
        </footer>
      </div>
    );
  }

  return null;
}