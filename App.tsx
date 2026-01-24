
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
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
  
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [rtcConnected, setRtcConnected] = useState(false);
  const [hostReaction, setHostReaction] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    const roomId = `sblix-v8-final-${roomCode}`;
    
    // Redundant Providers
    const wsProvider = new WebsocketProvider('wss://demos.yjs.dev', roomId, doc);
    const rtcProvider = new WebrtcProvider(roomId, doc, {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-us.herokuapp.com']
    });

    wsProvider.on('status', (e: any) => setWsConnected(e.status === 'connected'));
    rtcProvider.on('status', (e: any) => setRtcConnected(e.connected));

    const sync = () => {
      const data = Object.values(usersMap.toJSON()) as User[];
      setAllUsers(data);

      // Check for incoming pulses
      const hostState = usersMap.get('host');
      if (hostState && Date.now() - hostState.lastPulse < 1500) {
        setHostReaction('SIGNAL_IN');
        setTimeout(() => setHostReaction(null), 800);
      }
    };

    usersMap.observe(sync);

    // Initial Blast
    if (localUser) {
      usersMap.set(localUser.id, { ...localUser, lastPulse: Date.now() });
    }

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
    }, 2500);

    return () => {
      clearInterval(heartbeat);
      wsProvider.destroy();
      rtcProvider.destroy();
    };
  }, [roomCode, doc, usersMap, view, localUser?.id]);

  const forceHandshake = () => {
    if (localUser) {
      usersMap.set(localUser.id, { 
        ...localUser, 
        lastPulse: Date.now(),
        pingCount: (localUser.pingCount || 0) + 1 
      });
    }
  };

  const verifyUser = (userId: string) => {
    const u = usersMap.get(userId);
    if (u) usersMap.set(userId, { ...u, isVerified: true });
  };

  const sendPing = (targetId: string) => {
    const current = usersMap.get(targetId);
    if (current) {
      usersMap.set(targetId, { 
        ...current, 
        pingCount: (current.pingCount || 0) + 1,
        lastPulse: Date.now() 
      });
    }
  };

  // --- VIEWS ---

  if (view === 'landing') {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8">
        <div className="max-w-xs w-full space-y-12 text-center">
          <div className="w-24 h-24 bg-blue-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.4)]">
            <i className="fas fa-microchip text-white text-4xl"></i>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-orbitron font-black text-white italic tracking-tighter uppercase">SBLIX<br/>MESH</h1>
            <p className="text-[10px] font-black text-slate-500 tracking-[0.4em] uppercase">Redundant Link Protocol</p>
          </div>
          <button 
            onClick={() => setView('host')}
            className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-3xl shadow-2xl active:scale-95 transition-all"
          >
            Deploy Hub
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
              <h1 className="text-5xl font-orbitron font-black italic tracking-tighter leading-none">MASTER<br/><span className="text-blue-500">SYNC</span></h1>
              <div className="flex items-center gap-3">
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
               <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Manual Device Auth</h2>
               <div className="space-y-3">
                 <input id="guestIn" placeholder="Display Name" className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 font-bold text-white outline-none focus:border-blue-500 transition-all" />
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
                  className="w-full bg-blue-600 py-4 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-xl shadow-blue-600/20"
                 >
                   Verify Ticket
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
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Peers: {guests.length}</span>
             </div>

             <div className="grid grid-cols-1 gap-4">
               {guests.map((u, i) => (
                 <div key={u.id} className={`glass-card p-8 flex items-center justify-between transition-all duration-500 border-l-[6px] ${u.isVerified ? 'border-l-blue-500 bg-blue-500/5' : 'border-l-yellow-500 bg-yellow-500/5 animate-in fade-in'}`}>
                    <div className="flex items-center gap-6">
                       <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl ${u.isVerified ? 'bg-blue-600 text-white' : 'bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.3)] animate-pulse'}`}>
                          <i className={`fas fa-${u.isVerified ? 'check-double' : 'wifi-exclamation'}`}></i>
                       </div>
                       <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white">{u.name}</h3>
                            {!u.isVerified && (
                              <button 
                                onClick={() => verifyUser(u.id)}
                                className="bg-yellow-500 text-black text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
                              >
                                Authorize Link
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <div className={`w-2 h-2 rounded-full ${Date.now() - u.lastPulse < 5000 ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`}></div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                              {Date.now() - u.lastPulse < 5000 ? 'LOCKED' : 'SEARCHING'} | PINGS: {u.pingCount}
                            </span>
                          </div>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-10">
                       <button 
                         onClick={() => sendPing(u.id)}
                         className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all text-blue-400"
                       >
                         <i className="fas fa-satellite"></i>
                       </button>
                       <div className="text-5xl font-orbitron font-black text-white w-24 text-right">{u.score}</div>
                    </div>
                 </div>
               ))}

               {guests.length === 0 && (
                 <div className="py-32 border-2 border-dashed border-white/5 rounded-[4rem] text-center flex flex-col items-center justify-center gap-6 opacity-30">
                    <i className="fas fa-network-wired text-5xl"></i>
                    <p className="text-[10px] font-black uppercase tracking-[0.6em]">Listening for incoming handshakes...</p>
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
    const pinged = remoteSelf && (remoteSelf.pingCount % 2 === 1);

    return (
      <div className={`h-screen flex flex-col transition-all duration-700 overflow-hidden relative ${isVerified ? 'bg-[#010614]' : 'bg-[#0f101a]'} ${hostReaction ? 'scale-95 brightness-125' : ''}`}>
        
        {/* Signal Background Pulse */}
        <div className={`absolute inset-0 bg-blue-600/10 transition-opacity duration-1000 ${hostReaction ? 'opacity-100' : 'opacity-0'}`}></div>

        <header className="p-8 pt-12 flex justify-between items-start shrink-0 z-10">
          <div>
            <h1 className={`font-orbitron font-black text-3xl italic tracking-tighter leading-none transition-colors ${isVerified ? 'text-white' : 'text-slate-700'}`}>SBLIX</h1>
            <div className="flex items-center gap-2 mt-2">
               <div className={`w-2 h-2 rounded-full ${wsConnected || rtcConnected ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`}></div>
               <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">MESH LINK {wsConnected || rtcConnected ? 'OK' : 'OFF'}</span>
            </div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 px-4 py-2 rounded-xl text-center">
             <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest">GATEWAY</div>
             <div className="text-sm font-orbitron font-black text-blue-500">{roomCode}</div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-10 space-y-12 z-10">
          
          <div className="relative group" onClick={forceHandshake}>
             <div className={`w-48 h-48 rounded-[4rem] flex items-center justify-center shadow-2xl transition-all duration-500 border-2 ${isVerified ? 'bg-blue-600 border-blue-400 text-white shadow-blue-600/40 rotate-12' : 'bg-slate-900 border-white/10 text-slate-700'}`}>
                <i className={`fas fa-${isVerified ? 'fingerprint' : 'wifi-exclamation'} text-8xl`}></i>
             </div>
             {isVerified && (
               <div className="absolute -top-4 -right-4 bg-green-500 text-black w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-xl border-4 border-[#010614]">
                  <i className="fas fa-check text-xl"></i>
               </div>
             )}
             {!isVerified && (
               <div className="absolute inset-0 rounded-[4rem] border-4 border-yellow-500/20 animate-ping"></div>
             )}
          </div>

          <div className="text-center space-y-3">
             <div className="text-[11px] font-black uppercase tracking-[0.6em] text-slate-600">Identity Verified</div>
             <h2 className="text-5xl font-orbitron font-black uppercase italic text-white tracking-tighter leading-none">{localUser.name}</h2>
             {!isVerified && (
                <div className="flex flex-col items-center gap-4 mt-8 animate-in fade-in duration-1000">
                   <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest animate-pulse px-6 py-2 bg-yellow-500/10 rounded-full border border-yellow-500/20">
                     Awaiting Hub Authentication...
                   </p>
                   <button 
                     onClick={forceHandshake}
                     className="text-[9px] font-black text-slate-500 underline uppercase tracking-widest decoration-slate-800"
                   >
                     Initialize Handshake Again
                   </button>
                </div>
             )}
          </div>

          <div className={`w-full max-w-xs space-y-4 transition-all duration-500 ${isVerified ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
             <button 
               onClick={forceHandshake}
               className="w-full py-7 bg-white text-black rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
             >
               <i className="fas fa-satellite-dish"></i>
               Ping Master Hub
             </button>

             <div className="p-8 rounded-[3rem] bg-slate-900/50 border border-white/5 text-center shadow-inner relative overflow-hidden">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">Live Sync Pool</div>
                <div className="text-6xl font-orbitron font-black text-blue-500">{score}</div>
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-600/20"></div>
             </div>
          </div>
        </main>

        <footer className="p-10 text-center flex flex-col items-center gap-2 opacity-30">
           <div className="flex gap-4 text-[8px] font-black text-slate-500 uppercase tracking-widest">
              <span>WS: {wsConnected ? 'OK' : '..'}</span>
              <span>RTC: {rtcConnected ? 'OK' : '..'}</span>
           </div>
           <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-700">NODE ID: {localUser.id.toUpperCase()}</p>
        </footer>
      </div>
    );
  }

  return null;
}
