
import React, { useState, useEffect, useMemo } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
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
      return { id: uId, name: uName, deviceType: 'mobile', lastSeen: Date.now() };
    }
    return null;
  });

  const [view, setView] = useState<'landing' | 'host' | 'guest'>(() => {
    if (localUser) return 'guest';
    return 'landing';
  });

  // Yjs Sync Engine
  const doc = useMemo(() => new Y.Doc(), []);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [pings, setPings] = useState<Record<string, number>>({});

  const sharedPings = useMemo(() => doc.getMap<number>('pings'), [doc]);

  useEffect(() => {
    if (!roomCode) return;

    const fullRoomName = `sblix-v5-sync-${roomCode}`;
    const webrtc = new WebrtcProvider(fullRoomName, doc, {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-us.herokuapp.com']
    });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    const awareness = ws.awareness;

    if (localUser) {
      awareness.setLocalStateField('user', localUser);
    } else if (view === 'host') {
      awareness.setLocalStateField('user', { id: 'host', name: 'MASTER HUB', deviceType: 'desktop' });
    }

    const syncPresence = () => {
      const states = Array.from(awareness.getStates().values());
      setOnlineUsers(states.map((s: any) => s.user).filter(Boolean));
      setPings(sharedPings.toJSON());
    };

    awareness.on('change', syncPresence);
    sharedPings.observe(syncPresence);

    return () => {
      webrtc.destroy();
      ws.destroy();
    };
  }, [roomCode, localUser, view, doc, sharedPings]);

  const triggerPing = (targetId: string) => {
    sharedPings.set(targetId, Date.now());
  };

  // 1. Landing View
  if (view === 'landing') {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8">
        <div className="max-w-xs w-full space-y-8 text-center">
          <div className="w-20 h-20 bg-emerald-500 rounded-3xl mx-auto flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)] rotate-12">
            <i className="fas fa-signal-stream text-black text-3xl"></i>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-orbitron font-black text-white italic tracking-tighter">SBLIX SYNC</h1>
            <p className="text-[10px] font-black text-slate-500 tracking-[0.4em] uppercase">Multi-Device Handshake</p>
          </div>
          <div className="space-y-4">
            <button 
              onClick={() => setView('host')}
              className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all"
            >
              Start as Host
            </button>
            <p className="text-slate-600 text-[9px] uppercase font-black tracking-widest">Laptop / TV Recommended</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Host Registry View
  if (view === 'host') {
    return (
      <div className="min-h-screen bg-[#020617] text-white p-10 font-inter">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div className="space-y-12">
            <div className="space-y-4">
              <h1 className="text-6xl font-orbitron font-black italic text-emerald-400">HOST<br/><span className="text-white">COMMAND</span></h1>
              <div className="flex items-center gap-4">
                <input 
                  placeholder="SET ROOM CODE (e.g. PARTY)" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="bg-slate-900 border border-white/10 rounded-xl px-6 py-4 text-xl font-black focus:border-emerald-500 outline-none w-full"
                />
              </div>
            </div>

            <div className="glass-card p-8 space-y-6">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Add Guest to Manifest</h2>
              <div className="flex gap-4">
                <input id="guestNameInput" placeholder="Enter Guest Name" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-emerald-500" />
                <button 
                  onClick={() => {
                    const el = document.getElementById('guestNameInput') as HTMLInputElement;
                    if (!el.value || !roomCode) return;
                    const id = generateId();
                    const name = el.value.toUpperCase();
                    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}&u=${id}&n=${encodeURIComponent(name)}`;
                    // We just log it or add to a list to generate QR
                    const newGuest = { id, name, url };
                    (window as any).guestList = [...((window as any).guestList || []), newGuest];
                    el.value = '';
                    setOnlineUsers(prev => [...prev]); // Trigger re-render
                  }}
                  className="bg-emerald-500 text-black px-6 py-3 rounded-xl font-black uppercase text-xs"
                >
                  Generate Ticket
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {((window as any).guestList || []).map((g: any) => (
                <div key={g.id} className="glass-card p-6 flex flex-col items-center gap-4 border-white/5 hover:border-emerald-500/50 transition-all group">
                  <div className="bg-white p-2 rounded-xl">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(g.url)}&color=020617`} className="w-24 h-24" />
                  </div>
                  <div className="text-center">
                    <div className="font-black text-white text-sm uppercase">{g.name}</div>
                    <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mt-1">Ticket Issued</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Live Mesh ({onlineUsers.length})</h2>
              <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Mesh Active
              </div>
            </div>
            
            <div className="space-y-3">
              {onlineUsers.map(u => (
                <div key={u.id} className="glass-card p-5 flex items-center justify-between border-white/5 animate-in slide-in-from-right duration-500">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black ${u.deviceType === 'desktop' ? 'bg-indigo-500' : 'bg-emerald-500 text-black'}`}>
                      <i className={`fas fa-${u.deviceType === 'desktop' ? 'laptop' : 'mobile-alt'}`}></i>
                    </div>
                    <div>
                      <div className="font-black text-white uppercase">{u.name}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-widest">{u.id}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => triggerPing(u.id)}
                    className="p-3 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-xl transition-all border border-white/5"
                  >
                    <i className="fas fa-bullhorn"></i>
                  </button>
                </div>
              ))}
              {onlineUsers.length === 0 && (
                <div className="py-20 border-2 border-dashed border-white/5 rounded-[3rem] text-center opacity-20">
                  <p className="text-[10px] font-black uppercase tracking-[0.5em]">Awaiting Handshake...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Guest (Phone) View
  if (view === 'guest' && localUser) {
    const isPinged = Date.now() - (pings[localUser.id] || 0) < 2000;

    return (
      <div className={`h-screen flex flex-col items-center justify-center p-8 transition-colors duration-300 ${isPinged ? 'bg-emerald-500' : 'bg-[#020617]'}`}>
        <div className={`text-center space-y-10 transition-transform ${isPinged ? 'scale-110' : 'scale-100'}`}>
          <div className={`w-32 h-32 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-2xl transition-all ${isPinged ? 'bg-white text-emerald-500' : 'bg-emerald-500 text-black shadow-emerald-500/20'}`}>
            <i className={`fas fa-${isPinged ? 'bell animate-bounce' : 'check-circle'} text-5xl`}></i>
          </div>
          
          <div className="space-y-2">
            <h2 className={`text-xs font-black uppercase tracking-[0.4em] ${isPinged ? 'text-emerald-900' : 'text-emerald-500'}`}>Handshake Successful</h2>
            <h1 className={`text-4xl font-orbitron font-black uppercase italic ${isPinged ? 'text-black' : 'text-white'}`}>{localUser.name}</h1>
          </div>

          <div className="space-y-4">
             <div className={`px-6 py-4 rounded-2xl border transition-all ${isPinged ? 'bg-black/10 border-black/20 text-black' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1">Room Identity</p>
                <p className="text-xl font-orbitron font-black text-white">{roomCode}</p>
             </div>
             
             <button 
               onClick={() => triggerPing('host')}
               className={`w-full py-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all ${isPinged ? 'bg-black text-white' : 'bg-white text-black'}`}
             >
               Ping Master Hub
             </button>
          </div>

          <p className={`text-[9px] font-black uppercase tracking-[0.3em] animate-pulse ${isPinged ? 'text-emerald-900' : 'text-slate-600'}`}>
            Connected via Mesh Protocol
          </p>
        </div>
      </div>
    );
  }

  return null;
}
