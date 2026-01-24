
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
import { User, GameState } from './types';

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
  const gameMap = useMemo(() => doc.getMap<any>('game'), [doc]);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hostReaction, setHostReaction] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    const provider = new WebsocketProvider(
      'wss://demos.yjs.dev', 
      `sblix-v7-final-${roomCode}`, 
      doc
    );

    provider.on('status', (event: any) => {
      setIsConnected(event.status === 'connected');
    });

    const sync = () => {
      const users = Object.values(usersMap.toJSON()) as User[];
      setAllUsers(users);

      // If I am a guest, check if host verified me
      if (localUser) {
        const remoteSelf = usersMap.get(localUser.id);
        if (remoteSelf && remoteSelf.isVerified !== localUser.isVerified) {
          setLocalUser(prev => prev ? { ...prev, isVerified: remoteSelf.isVerified } : null);
        }
      }

      // Check for host pings
      const hostState = usersMap.get('host');
      if (hostState && Date.now() - hostState.lastPulse < 1000) {
        setHostReaction('HUB_SIGNAL');
        setTimeout(() => setHostReaction(null), 1000);
      }
    };

    usersMap.observe(sync);

    // Initial Registration & Heartbeat
    const heartbeat = setInterval(() => {
      if (localUser) {
        const current = usersMap.get(localUser.id) || localUser;
        usersMap.set(localUser.id, { 
          ...current, 
          lastPulse: Date.now() 
        });
      } else if (view === 'host') {
        usersMap.set('host', { 
          id: 'host', 
          name: 'HUB', 
          handle: 'HUB', 
          deviceType: 'desktop', 
          score: 0, 
          lastPulse: Date.now(),
          isVerified: true,
          pingCount: 0
        });
      }
    }, 2000);

    return () => {
      clearInterval(heartbeat);
      provider.destroy();
    };
  }, [roomCode, doc, usersMap, view]);

  const triggerPing = useCallback((targetId: string) => {
    const current = usersMap.get(targetId);
    if (current) {
      usersMap.set(targetId, { 
        ...current, 
        pingCount: (current.pingCount || 0) + 1,
        lastPulse: Date.now() 
      });
    }
  }, [usersMap]);

  const verifyUser = (userId: string) => {
    const u = usersMap.get(userId);
    if (u) usersMap.set(userId, { ...u, isVerified: true });
  };

  const addScore = () => {
    if (localUser) {
      const current = usersMap.get(localUser.id) || localUser;
      usersMap.set(localUser.id, { ...current, score: current.score + 10 });
    }
  };

  // --- RENDERERS ---

  if (view === 'landing') {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8 font-inter">
        <div className="max-w-xs w-full space-y-12 text-center">
          <div className="w-24 h-24 bg-blue-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.4)] rotate-3">
            <i className="fas fa-plug-circle-check text-white text-4xl"></i>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-orbitron font-black text-white italic tracking-tighter uppercase">SBLIX<br/>REGISTRY</h1>
            <p className="text-[10px] font-black text-slate-500 tracking-[0.4em] uppercase">V7 Hard-State Protocol</p>
          </div>
          <button 
            onClick={() => setView('host')}
            className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-3xl shadow-2xl active:scale-95 transition-all"
          >
            Start Hub
          </button>
        </div>
      </div>
    );
  }

  if (view === 'host') {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 lg:p-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Management */}
          <div className="lg:col-span-4 space-y-8">
            <div className="space-y-4">
              <h1 className="text-6xl font-orbitron font-black italic tracking-tighter">THE<br/><span className="text-blue-500">HUB</span></h1>
              <div className="p-1 bg-slate-900 rounded-2xl border border-white/5 flex gap-2">
                <input 
                  placeholder="ROOM CODE" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="bg-transparent px-5 py-3 text-xl font-black outline-none w-full"
                />
                <div className={`px-4 flex items-center rounded-xl text-[9px] font-black ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {isConnected ? 'LIVE' : 'OFF'}
                </div>
              </div>
            </div>

            <div className="glass-card p-6 space-y-4 border-white/10">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Manual Invite</h2>
              <input id="nIn" placeholder="Guest Name" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 font-bold text-white outline-none" />
              <button 
                onClick={() => {
                  const el = document.getElementById('nIn') as HTMLInputElement;
                  if (!el.value || !roomCode) return;
                  const id = generateId();
                  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}&u=${id}&n=${encodeURIComponent(el.value)}`;
                  (window as any).guestList = [...((window as any).guestList || []), { id, name: el.value.toUpperCase(), url }];
                  el.value = '';
                  setAllUsers([...allUsers]);
                }}
                className="w-full bg-blue-600 py-4 rounded-xl font-black uppercase tracking-widest text-xs"
              >
                Generate Ticket
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {((window as any).guestList || []).map((g: any) => (
                <div key={g.id} className="bg-white p-2 rounded-2xl flex flex-col items-center gap-2">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(g.url)}&color=020617`} className="w-full aspect-square rounded-lg" />
                  <span className="text-[8px] font-black text-black uppercase truncate w-full text-center">{g.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Leaderboard & Mesh */}
          <div className="lg:col-span-8 space-y-12">
            <section className="space-y-6">
              <div className="flex justify-between items-end">
                <h2 className="text-3xl font-orbitron font-black italic uppercase">Consolidated Standings</h2>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Players: {allUsers.filter(u => u.id !== 'host').length}</div>
              </div>
              
              <div className="space-y-3">
                {allUsers.filter(u => u.id !== 'host').sort((a,b) => b.score - a.score).map((u, i) => (
                  <div key={u.id} className={`glass-card p-6 flex items-center justify-between border-l-4 transition-all duration-300 ${u.isVerified ? 'border-l-blue-500' : 'border-l-yellow-500 animate-pulse'}`}>
                    <div className="flex items-center gap-6">
                      <span className="text-2xl font-orbitron font-black text-slate-700 w-8">{i + 1}</span>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-black uppercase tracking-tight">{u.name}</h3>
                          {!u.isVerified && (
                            <button onClick={() => verifyUser(u.id)} className="bg-yellow-500 text-black text-[8px] font-black px-2 py-1 rounded uppercase">Awaiting Verify</button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${Date.now() - u.lastPulse < 5000 ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`}></div>
                          {Date.now() - u.lastPulse < 5000 ? 'Signal Locked' : 'Searching...'}
                          <span className="ml-4 opacity-50">Pings: {u.pingCount}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                       <button 
                         onClick={() => triggerPing(u.id)}
                         className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/5 active:scale-90"
                       >
                         <i className="fas fa-bell text-blue-400"></i>
                       </button>
                       <div className="text-4xl font-orbitron font-black text-blue-500 w-24 text-right">{u.score}</div>
                    </div>
                  </div>
                ))}
                {allUsers.filter(u => u.id !== 'host').length === 0 && (
                  <div className="py-24 border-2 border-dashed border-white/5 rounded-[3rem] text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-700">Empty Mesh - Awaiting Handshakes</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'guest' && localUser) {
    const remoteSelf = allUsers.find(u => u.id === localUser.id);
    const score = remoteSelf?.score || 0;
    const isVerified = remoteSelf?.isVerified || false;
    const pinged = remoteSelf && (remoteSelf.pingCount % 2 === 1); // Simple toggle for visual

    return (
      <div className={`h-screen flex flex-col transition-colors duration-500 ${isVerified ? 'bg-[#020617]' : 'bg-slate-900'} ${hostReaction ? 'bg-blue-600' : ''}`}>
        
        {/* Connection Header */}
        <header className="p-6 pt-12 flex justify-between items-center shrink-0">
          <div>
            <h1 className="font-orbitron font-black text-2xl italic text-white leading-none">SBLIX</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {isConnected ? 'MESH LINKED' : 'RECONNECTING'}
              </span>
            </div>
          </div>
          <div className="text-right">
             <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Room Identity</div>
             <div className="text-lg font-orbitron font-black text-blue-500">{roomCode}</div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-8 space-y-12">
          
          <div className="relative">
            <div className={`w-44 h-44 rounded-[3.5rem] flex items-center justify-center shadow-2xl transition-all duration-300 ${isVerified ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-600 border border-white/5'}`}>
               <i className={`fas fa-${isVerified ? 'fingerprint' : 'hourglass-half animate-spin'} text-7xl`}></i>
            </div>
            {isVerified && (
               <div className="absolute -top-4 -right-4 bg-green-500 text-black w-12 h-12 rounded-full flex items-center justify-center border-4 border-[#020617] font-black shadow-xl">
                 <i className="fas fa-check"></i>
               </div>
            )}
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">Device Identity</h2>
            <h1 className="text-4xl font-orbitron font-black uppercase italic text-white">{localUser.name}</h1>
            {!isVerified && (
               <p className="text-[10px] font-black text-yellow-500 uppercase animate-pulse mt-4">Waiting for Hub Verification...</p>
            )}
          </div>

          <div className="w-full max-w-xs space-y-4">
            <button 
               onClick={() => triggerPing('host')}
               disabled={!isVerified}
               className="w-full py-6 bg-white text-black rounded-[2rem] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-3 disabled:opacity-20"
            >
              <i className="fas fa-satellite-dish"></i>
              Ping Master Hub
            </button>

            <button 
               onClick={addScore}
               disabled={!isVerified}
               className="w-full py-4 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 disabled:opacity-0"
            >
              Test Score Update (+10)
            </button>
            
            <div className="p-8 rounded-[2.5rem] bg-slate-900 border border-white/5 text-center shadow-2xl">
               <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">Live Sync Points</div>
               <div className="text-5xl font-orbitron font-black text-blue-500">{score}</div>
            </div>
          </div>
        </main>

        <footer className="p-8 text-center opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.4em]">Protocol Node 0x{localUser.id.toUpperCase()}</p>
        </footer>
      </div>
    );
  }

  return null;
}
