
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { IndexeddbPersistence } from 'y-indexeddb';
import { User } from './types';

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
      return { 
        id: uId, 
        name: uName, 
        handle: uName, 
        deviceType: 'mobile', 
        score: 0, 
        lastPulse: Date.now(),
        isVerified: false,
        pingCount: 0
      };
    }
    return null;
  });

  const [view, setView] = useState<'landing' | 'host' | 'guest'>(() => {
    if (localUser) return 'guest';
    return 'landing';
  });

  // --- SYNC ENGINE ---
  const doc = useMemo(() => new Y.Doc(), []);
  const usersMap = useMemo(() => doc.getMap<User>('registry'), [doc]);
  const configMap = useMemo(() => doc.getMap<any>('config'), [doc]);
  
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [rtcConnected, setRtcConnected] = useState(false);
  const [autoVerify, setAutoVerify] = useState(true);
  const [hostReaction, setHostReaction] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    const roomId = `sblix-v9-final-${roomCode}`;
    
    // 1. Local Persistence: Saves verified status on the device even if they refresh
    const indexeddbProvider = new IndexeddbPersistence(roomId, doc);
    
    // 2. Redundant Cloud Providers
    const wsProvider = new WebsocketProvider('wss://demos.yjs.dev', roomId, doc);
    const rtcProvider = new WebrtcProvider(roomId, doc, {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-us.herokuapp.com']
    });

    wsProvider.on('status', (e: any) => setWsConnected(e.status === 'connected'));
    rtcProvider.on('status', (e: any) => setRtcConnected(e.connected));

    const sync = () => {
      const data = Object.values(usersMap.toJSON()) as User[];
      setAllUsers(data);
      
      const config = configMap.toJSON();
      if (config.autoVerify !== undefined) setAutoVerify(config.autoVerify);

      // Host Auto-Verification Logic
      if (view === 'host' && config.autoVerify) {
        data.forEach(u => {
          if (u.id !== 'host' && !u.isVerified) {
            usersMap.set(u.id, { ...u, isVerified: true });
          }
        });
      }

      // Guest Feedback
      const hostState = usersMap.get('host');
      if (hostState && Date.now() - hostState.lastPulse < 1500) {
        setHostReaction('SIGNAL_IN');
        setTimeout(() => setHostReaction(null), 800);
      }
    };

    usersMap.observe(sync);
    configMap.observe(sync);

    const heartbeat = setInterval(() => {
      const timestamp = Date.now();
      if (localUser) {
        const current = usersMap.get(localUser.id) || localUser;
        usersMap.set(localUser.id, { ...current, lastPulse: timestamp });
      } else if (view === 'host') {
        usersMap.set('host', { 
          id: 'host', 
          name: 'HUB', 
          handle: 'HUB', 
          deviceType: 'desktop', 
          score: 0, 
          lastPulse: timestamp,
          isVerified: true,
          pingCount: 0
        });
      }
    }, 2000);

    return () => {
      clearInterval(heartbeat);
      wsProvider.destroy();
      rtcProvider.destroy();
      indexeddbProvider.destroy();
    };
  }, [roomCode, doc, usersMap, configMap, view, localUser?.id]);

  const toggleAutoVerify = () => {
    configMap.set('autoVerify', !autoVerify);
  };

  const forceHandshake = () => {
    if (localUser) {
      const current = usersMap.get(localUser.id) || localUser;
      usersMap.set(localUser.id, { 
        ...current, 
        lastPulse: Date.now(),
        pingCount: (current.pingCount || 0) + 1 
      });
    }
  };

  const verifyUser = (userId: string) => {
    const u = usersMap.get(userId);
    if (u) usersMap.set(userId, { ...u, isVerified: true });
  };

  // --- VIEWS ---

  if (view === 'landing') {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8">
        <div className="max-w-xs w-full space-y-12 text-center">
          <div className="w-24 h-24 bg-emerald-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.3)]">
            <i className="fas fa-bolt-lightning text-white text-4xl"></i>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-orbitron font-black text-white italic tracking-tighter uppercase">SBLIX<br/>MESH</h1>
            <p className="text-[10px] font-black text-slate-500 tracking-[0.4em] uppercase">Persistent Link Protocol</p>
          </div>
          <button 
            onClick={() => setView('host')}
            className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-3xl shadow-2xl active:scale-95 transition-all"
          >
            Deploy Host
          </button>
        </div>
      </div>
    );
  }

  if (view === 'host') {
    const guests = allUsers.filter(u => u.id !== 'host');
    
    return (
      <div className="min-h-screen bg-[#020410] text-white p-6 lg:p-12 font-inter">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          <div className="lg:col-span-4 space-y-8">
            <div className="space-y-2">
              <h1 className="text-5xl font-orbitron font-black italic tracking-tighter leading-none">MASTER<br/><span className="text-emerald-500">SYNC</span></h1>
              <div className="flex flex-wrap gap-2">
                 <div className={`px-3 py-1 rounded-full text-[8px] font-black ${wsConnected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>WS: {wsConnected ? 'UP' : 'DOWN'}</div>
                 <div className={`px-3 py-1 rounded-full text-[8px] font-black ${rtcConnected ? 'bg-indigo-500/20 text-indigo-500' : 'bg-red-500/20 text-red-500'}`}>RTC: {rtcConnected ? 'UP' : 'DOWN'}</div>
              </div>
            </div>

            <div className="glass-card p-2 bg-slate-900/50 flex gap-2">
              <input 
                placeholder="ROOM ID" 
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="bg-transparent px-5 py-3 text-2xl font-black outline-none w-full placeholder:text-slate-800"
              />
            </div>

            <div className="glass-card p-8 space-y-6">
               <div className="flex justify-between items-center">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Global Settings</h2>
                 <button 
                  onClick={toggleAutoVerify}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${autoVerify ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-500'}`}
                 >
                   {autoVerify ? 'Auto-Verify: ON' : 'Auto-Verify: OFF'}
                 </button>
               </div>
               
               <div className="space-y-3">
                 <input id="guestIn" placeholder="Manual Guest Name" className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 font-bold text-white outline-none focus:border-emerald-500 transition-all" />
                 <button 
                  onClick={() => {
                    const el = document.getElementById('guestIn') as HTMLInputElement;
                    if (!el.value || !roomCode) return;
                    const id = generateId();
                    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}&u=${id}&n=${encodeURIComponent(el.value)}`;
                    (window as any).guestList = [...((window as any).guestList || []), { id, name: el.value.toUpperCase(), url }];
                    el.value = '';
                    setAllUsers([...allUsers]);
                  }}
                  className="w-full bg-emerald-500 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-xl shadow-emerald-600/20"
                 >
                   Create Ticket
                 </button>
               </div>
               
               <div className="grid grid-cols-2 gap-3 pt-4">
                 {((window as any).guestList || []).map((g: any) => (
                    <div key={g.id} className="bg-white p-2 rounded-2xl flex flex-col items-center gap-2 group cursor-pointer hover:scale-105 transition-all">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(g.url)}&color=020617`} className="w-full aspect-square rounded-xl" />
                      <span className="text-[7px] font-black text-black uppercase truncate w-full text-center">{g.name}</span>
                    </div>
                 ))}
               </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-12">
             <div className="flex justify-between items-end px-2">
                <h2 className="text-3xl font-orbitron font-black italic uppercase text-white">Registry Matrix</h2>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Peers Found: {guests.length}</span>
             </div>

             <div className="grid grid-cols-1 gap-4">
               {guests.map((u, i) => (
                 <div key={u.id} className={`glass-card p-8 flex items-center justify-between transition-all duration-500 border-l-[6px] ${u.isVerified ? 'border-l-emerald-500 bg-emerald-500/5' : 'border-l-yellow-500 bg-yellow-500/5'}`}>
                    <div className="flex items-center gap-6">
                       <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl ${u.isVerified ? 'bg-emerald-600 text-white' : 'bg-yellow-500 text-black animate-pulse'}`}>
                          <i className={`fas fa-${u.isVerified ? 'check-double' : 'clock'}`}></i>
                       </div>
                       <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white">{u.name}</h3>
                            {!u.isVerified && (
                              <button 
                                onClick={() => verifyUser(u.id)}
                                className="bg-yellow-500 text-black text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                              >
                                Manual Verify
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <div className={`w-2 h-2 rounded-full ${Date.now() - u.lastPulse < 5000 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                              {Date.now() - u.lastPulse < 5000 ? 'ONLINE' : 'STALE'} | CLICKS: {u.pingCount}
                            </span>
                          </div>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-10">
                       <div className="text-5xl font-orbitron font-black text-white w-24 text-right">{u.score}</div>
                    </div>
                 </div>
               ))}

               {guests.length === 0 && (
                 <div className="py-32 border-2 border-dashed border-white/5 rounded-[4rem] text-center flex flex-col items-center justify-center gap-6 opacity-30">
                    <i className="fas fa-satellite text-5xl"></i>
                    <p className="text-[10px] font-black uppercase tracking-[0.6em]">Awaiting Peer Handshakes...</p>
                 </div>
               )}
             </div>
          </div>

        </div>
      </div>
    );
  }

  if (view === 'guest' && localUser) {
    const remoteSelf = allUsers.find(u => u.id === localUser.id);
    const score = remoteSelf?.score || 0;
    const isVerified = remoteSelf?.isVerified || false;

    return (
      <div className={`h-screen flex flex-col transition-all duration-700 overflow-hidden relative ${isVerified ? 'bg-[#010614]' : 'bg-[#0f101a]'} ${hostReaction ? 'brightness-150' : ''}`}>
        
        {/* Connection Diagnostics Overlay */}
        {!isVerified && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-8 text-center bg-black/60 backdrop-blur-xl">
            <div className="w-24 h-24 bg-yellow-500 rounded-3xl flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(234,179,8,0.4)] animate-pulse">
               <i className="fas fa-hourglass-half text-black text-4xl"></i>
            </div>
            <h2 className="text-3xl font-orbitron font-black text-white uppercase italic leading-none mb-4">Awaiting<br/>Verification</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest max-w-xs mb-10 leading-relaxed">
              Tell the Host to authorize <span className="text-yellow-500">"{localUser.name}"</span> on the main dashboard.
            </p>
            
            <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8">
               <div className={`p-4 rounded-2xl border text-[9px] font-black uppercase ${wsConnected ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                 WebSocket: {wsConnected ? 'UP' : 'DOWN'}
               </div>
               <div className={`p-4 rounded-2xl border text-[9px] font-black uppercase ${rtcConnected ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                 P2P-Mesh: {rtcConnected ? 'UP' : 'DOWN'}
               </div>
            </div>

            <button 
              onClick={forceHandshake}
              className="px-8 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-xl"
            >
              Force Sync Re-Handshake
            </button>
          </div>
        )}

        <header className="p-8 pt-12 flex justify-between items-start shrink-0 z-10">
          <div>
            <h1 className="font-orbitron font-black text-3xl italic tracking-tighter leading-none text-white">SBLIX</h1>
            <div className="flex items-center gap-2 mt-2">
               <div className={`w-2 h-2 rounded-full ${wsConnected || rtcConnected ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`}></div>
               <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">ACTIVE LINK</span>
            </div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 px-4 py-2 rounded-xl text-center">
             <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest">SESSION</div>
             <div className="text-sm font-orbitron font-black text-emerald-500">{roomCode}</div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-10 space-y-12 z-10">
          
          <div className="relative" onClick={forceHandshake}>
             <div className="w-48 h-48 rounded-[4rem] bg-emerald-600 flex items-center justify-center shadow-2xl transition-all duration-500 border-2 border-emerald-400 text-white rotate-12">
                <i className="fas fa-fingerprint text-8xl"></i>
             </div>
             <div className="absolute -top-4 -right-4 bg-white text-black w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-xl border-4 border-[#010614]">
                <i className="fas fa-check text-xl"></i>
             </div>
          </div>

          <div className="text-center space-y-3">
             <div className="text-[11px] font-black uppercase tracking-[0.6em] text-slate-600">Identity Verified</div>
             <h2 className="text-5xl font-orbitron font-black uppercase italic text-white tracking-tighter leading-none">{localUser.name}</h2>
          </div>

          <div className="w-full max-w-xs space-y-4">
             <button 
               onClick={forceHandshake}
               className="w-full py-7 bg-white text-black rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
             >
               <i className="fas fa-wifi"></i>
               Send Room Ping
             </button>

             <div className="p-8 rounded-[3rem] bg-slate-900/50 border border-white/5 text-center shadow-inner relative overflow-hidden">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">Your Total Score</div>
                <div className="text-6xl font-orbitron font-black text-emerald-500">{score}</div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-600/20"></div>
             </div>
          </div>
        </main>

        <footer className="p-10 text-center flex flex-col items-center gap-2 opacity-30">
           <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-700">PERSISTENT NODE: {localUser.id.toUpperCase()}</p>
        </footer>
      </div>
    );
  }

  return null;
}
