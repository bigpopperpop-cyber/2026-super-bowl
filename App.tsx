import React, { useState, useEffect, useMemo } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
// @ts-ignore
import { IndexeddbPersistence } from 'y-indexeddb';
import { GoogleGenAI, Type } from "@google/genai";
import { User, PropBet, UserBet, GameState } from './types';
import TeamHelmet from './components/TeamHelmet';

const STORAGE_KEY = 'sblix_user_v3';
const generateId = () => Math.random().toString(36).substring(2, 11);

export default function App() {
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.toUpperCase() || '';
  });

  const [user, setUser] = useState<User | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('u');
    const urlName = params.get('n');
    const urlTeam = params.get('t');

    if (urlId && urlName && urlTeam) {
      const newUser = { id: urlId, handle: urlName, name: urlName, team: urlTeam, credits: 1000 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
      return newUser;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [isHostMode, setIsHostMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'bets' | 'standings'>('bets');
  const [gameState, setGameState] = useState<GameState>({ scoreHome: 0, scoreAway: 0, quarter: '1st', time: '15:00', possession: 'home', isGameOver: false });
  const [props, setProps] = useState<PropBet[]>([]);
  const [allBets, setAllBets] = useState<UserBet[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [presenceCount, setPresenceCount] = useState(0);

  // Mesh Sync Setup
  const doc = useMemo(() => new Y.Doc(), []);
  const sharedGame = useMemo(() => doc.getMap<any>('gameState'), [doc]);
  const sharedProps = useMemo(() => doc.getMap<PropBet>('props'), [doc]);
  const sharedBets = useMemo(() => doc.getArray<UserBet>('userBets'), [doc]);
  const sharedUsers = useMemo(() => doc.getMap<User>('users'), [doc]);

  useEffect(() => {
    if (!roomCode) return;
    const fullRoomName = `sblix-party-v3-${roomCode}`;
    
    const idb = new IndexeddbPersistence(fullRoomName, doc);
    const webrtc = new WebrtcProvider(fullRoomName, doc, { 
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-us.herokuapp.com'] 
    });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    const sync = () => {
      setGameState(sharedGame.toJSON() as GameState);
      setProps(Object.values(sharedProps.toJSON() as Record<string, PropBet>));
      setAllBets(sharedBets.toArray());
      setAllUsers(Object.values(sharedUsers.toJSON() as Record<string, User>));
      setPresenceCount(ws.awareness.getStates().size);
    };

    sharedGame.observe(sync);
    sharedProps.observe(sync);
    sharedBets.observe(sync);
    sharedUsers.observe(sync);
    ws.awareness.on('change', sync);

    if (user) {
      sharedUsers.set(user.id, user);
      ws.awareness.setLocalStateField('user', user);
    }
    
    sync();
    return () => { webrtc.destroy(); ws.destroy(); idb.destroy(); };
  }, [user, roomCode, doc]);

  // AI Oracle
  useEffect(() => {
    if (!roomCode || presenceCount === 0) return;
    const runOracle = async () => {
      // Always create a fresh instance of GoogleGenAI before making an API call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Monitor Super Bowl LIX. Live score and suggesting 2 props. Check: ${JSON.stringify(props.filter(p => !p.resolved))}`,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                homeScore: { type: Type.NUMBER }, awayScore: { type: Type.NUMBER },
                quarter: { type: Type.STRING }, time: { type: Type.STRING },
                newProps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, category: { type: Type.STRING } } } },
                resolutions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, winner: { type: Type.STRING } } } }
              }
            }
          }
        });
        const data = JSON.parse(response.text);
        doc.transact(() => {
          sharedGame.set('scoreHome', data.homeScore); sharedGame.set('scoreAway', data.awayScore);
          sharedGame.set('quarter', data.quarter); sharedGame.set('time', data.time);
          if (data.newProps) data.newProps.forEach((p: any) => { if (!sharedProps.has(p.id)) sharedProps.set(p.id, { ...p, resolved: false }); });
          if (data.resolutions) data.resolutions.forEach((res: any) => { const p = sharedProps.get(res.id); if (p && !p.resolved) sharedProps.set(res.id, { ...p, resolved: true, winner: res.winner }); });
        });
      } catch (e) {}
    };
    const interval = setInterval(runOracle, 60000);
    runOracle();
    return () => clearInterval(interval);
  }, [presenceCount, roomCode, doc]);

  if (isHostMode || (!user && !roomCode)) {
    return (
      <HostRegistry 
        room={roomCode} 
        onSetRoom={(r) => {
          setRoomCode(r.toUpperCase());
          const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?room=${r.toUpperCase()}`;
          window.history.pushState({ path: newUrl }, '', newUrl);
        }}
        onEnterGame={() => {
          setIsHostMode(false);
          if (!user) {
            const hostUser = { id: 'host-main', handle: 'HOST', name: 'Host Monitor', team: 'KC', credits: 1000 };
            setUser(hostUser);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(hostUser));
          }
        }}
      />
    );
  }

  if (!user || !roomCode) {
     return <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center">
       <div className="space-y-6">
         <div className="w-16 h-16 bg-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-2xl animate-bounce">
           <i className="fas fa-link text-black"></i>
         </div>
         <h2 className="text-xl font-orbitron font-black text-white uppercase italic">Initializing Link...</h2>
         <p className="text-slate-500 text-xs uppercase tracking-widest leading-loose">Waiting for Huddle Credentials.<br/>Ask your host for your QR Ticket.</p>
         <button onClick={() => setIsHostMode(true)} className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-8 underline">I am the Host</button>
       </div>
     </div>;
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-[#020617] relative overflow-hidden">
      <header className="p-4 pt-8 bg-slate-900/80 backdrop-blur-2xl border-b border-white/5 shrink-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col">
            <h1 className="font-orbitron font-black text-2xl italic tracking-tighter text-white uppercase leading-none">SBLIX <span className="text-emerald-400">SYNC</span></h1>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1">{roomCode}</span>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={() => setIsHostMode(true)} className="text-[10px] font-black text-slate-500 uppercase tracking-widest border border-white/5 px-3 py-1.5 rounded-full hover:bg-white/5 transition-all">Registry</button>
             <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{presenceCount}</span>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center bg-black/60 rounded-3xl p-6 border border-white/10 relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-indigo-500/5 animate-pulse-soft" />
          <div className="flex flex-col items-center z-10">
            <span className="text-[10px] font-black text-slate-500 mb-1 tracking-widest uppercase">HOME</span>
            <span className="text-5xl font-orbitron font-black text-white">{gameState.scoreHome || 0}</span>
          </div>
          <div className="flex flex-col items-center text-center z-10 px-4 border-x border-white/5">
            <span className="text-[11px] font-black text-emerald-400 mb-1 tracking-widest uppercase">{gameState.quarter || 'LIVE'}</span>
            <span className="text-[10px] font-bold text-slate-400 font-mono tracking-widest">{gameState.time || '15:00'}</span>
          </div>
          <div className="flex flex-col items-center z-10">
            <span className="text-[10px] font-black text-slate-500 mb-1 tracking-widest uppercase">AWAY</span>
            <span className="text-5xl font-orbitron font-black text-white">{gameState.scoreAway || 0}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-24 p-4 space-y-4">
        {activeTab === 'bets' ? (
          <BettingHub props={props} onBet={(id, sel) => {
            const bet: UserBet = { id: generateId(), userId: user.id, betId: id, selection: sel, timestamp: Date.now() };
            sharedBets.push([bet]);
          }} user={user} bets={allBets} />
        ) : (
          <Standings users={allUsers} bets={allBets} props={props} />
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-slate-900/95 backdrop-blur-xl border-t border-white/5 flex pb-safe shadow-2xl z-50">
        <NavBtn active={activeTab === 'bets'} icon="fa-ticket" label="Huddle Pool" onClick={() => setActiveTab('bets')} />
        <NavBtn active={activeTab === 'standings'} icon="fa-trophy" label="Live Standings" onClick={() => setActiveTab('standings')} />
      </nav>
    </div>
  );
}

function HostRegistry({ room, onSetRoom, onEnterGame }: any) {
  const [guestName, setGuestName] = useState('');
  const [guestTeam, setGuestTeam] = useState('HOME');
  const [registry, setRegistry] = useState<any[]>([]);

  const addGuest = () => {
    if (!guestName || !room) return;
    const g = { id: generateId(), name: guestName.toUpperCase(), team: guestTeam };
    setRegistry([g, ...registry]);
    setGuestName('');
  };

  const getGuestUrl = (g: any) => {
    return `${window.location.origin}${window.location.pathname}?room=${room}&u=${g.id}&n=${encodeURIComponent(g.name)}&t=${g.team}`;
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 pb-24 font-inter">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <h1 className="text-5xl font-orbitron font-black italic tracking-tighter uppercase leading-tight">Host<br/><span className="text-emerald-400">Registry</span></h1>
            <p className="text-[10px] font-black text-slate-500 tracking-[0.5em] uppercase">Super Bowl LIX Huddle</p>
          </div>
          <button onClick={onEnterGame} className="px-8 py-4 bg-emerald-500 text-black font-black uppercase text-xs rounded-2xl shadow-2xl active:scale-95 transition-all">Launch Scoreboard</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="glass-card p-8 space-y-6">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">1. Define Room</h2>
              <input 
                placeholder="ROOM CODE (E.G. HUDDLE)" 
                value={room} 
                onChange={e => onSetRoom(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-xl font-black text-white outline-none focus:border-emerald-500 transition-all placeholder:text-slate-800"
              />
            </div>

            <div className="glass-card p-8 space-y-6">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">2. Check-In Guest</h2>
              <div className="space-y-4">
                <input 
                  placeholder="GUEST NAME" 
                  value={guestName} 
                  onChange={e => setGuestName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-xl font-black text-white outline-none focus:border-emerald-500 transition-all placeholder:text-slate-800"
                />
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setGuestTeam('KC')} className={`p-4 rounded-2xl font-black text-[10px] border transition-all ${guestTeam === 'KC' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-white/5 text-slate-500'}`}>HOME TEAM</button>
                  {/* Fixed duplicate onClick and missing setTeamAlternative by merging into setGuestTeam('SF') */}
                  <button onClick={() => setGuestTeam('SF')} className={`p-4 rounded-2xl font-black text-[10px] border transition-all ${guestTeam !== 'KC' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-white/5 text-slate-500'}`}>AWAY TEAM</button>
                </div>
                <button 
                  disabled={!guestName || !room}
                  onClick={addGuest}
                  className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 disabled:opacity-30 transition-all"
                >
                  Generate Guest Ticket
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
             <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 px-2">Active Huddle Tickets</h2>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {registry.map(g => (
                  <div key={g.id} className="glass-card p-6 flex flex-col items-center gap-4 text-center group animate-in zoom-in duration-300">
                    <div className="bg-white p-2 rounded-2xl shadow-xl transition-transform group-hover:scale-105">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getGuestUrl(g))}&color=020617`} 
                        alt="QR" 
                        className="w-32 h-32"
                      />
                    </div>
                    <div>
                      <div className="font-orbitron font-black text-sm uppercase text-white truncate w-32">{g.name}</div>
                      <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">TEAM {g.team}</div>
                    </div>
                  </div>
                ))}
                {registry.length === 0 && (
                  <div className="col-span-2 py-20 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center opacity-20">
                    <i className="fas fa-qrcode text-4xl mb-4"></i>
                    <p className="text-[10px] font-black uppercase tracking-widest">Waiting for entries...</p>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BettingHub({ props, onBet, user, bets }: any) {
  return (
    <div className="space-y-4">
      {props.length === 0 && (
        <div className="py-20 text-center flex flex-col items-center gap-4 text-slate-700">
          <i className="fas fa-radar-alt text-4xl animate-spin-slow"></i>
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">AI Oracle Monitoring Play...</p>
        </div>
      )}
      {props.map((p: PropBet) => {
        const myBet = bets.find((b: UserBet) => b.betId === p.id && b.userId === user.id);
        return (
          <div key={p.id} className={`glass-card p-6 border-l-4 transition-all ${p.resolved ? 'opacity-50' : 'border-l-emerald-500/30'}`}>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[9px] font-black px-2 py-1 bg-slate-800 rounded text-slate-400 uppercase tracking-widest">{p.category}</span>
              {p.resolved && <span className="text-[10px] font-black text-yellow-500 uppercase">{p.winner} Won</span>}
            </div>
            <h3 className="text-lg font-bold text-white mb-6 leading-tight">{p.question}</h3>
            <div className="grid grid-cols-2 gap-3">
              {p.options.map(opt => (
                <button
                  key={opt}
                  disabled={!!myBet || p.resolved}
                  onClick={() => onBet(p.id, opt)}
                  className={`py-4 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all border ${
                    myBet?.selection === opt ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' : 
                    p.resolved && p.winner === opt ? 'bg-yellow-600/20 border-yellow-500 text-yellow-500' :
                    'bg-slate-900 border-white/5 text-slate-500'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Standings({ users, bets, props }: any) {
  const scores = useMemo(() => {
    return users.map((u: User) => {
      let score = 1000;
      bets.filter((b: UserBet) => b.userId === u.id).forEach((b: UserBet) => {
        const p = props.find((p: PropBet) => p.id === b.betId);
        if (p?.resolved) score += p.winner === b.selection ? 500 : -200;
      });
      return { ...u, score };
    }).sort((a: any, b: any) => b.score - a.score);
  }, [users, bets, props]);

  return (
    <div className="space-y-3">
      {scores.map((s: any, i: number) => (
        <div key={s.id} className="glass-card p-4 flex items-center justify-between border-white/5">
          <div className="flex items-center gap-4">
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</span>
            <div className="font-bold text-sm text-white uppercase">{s.handle}</div>
          </div>
          <div className="text-right">
            <div className="font-orbitron font-black text-emerald-400">{s.score}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NavBtn({ active, icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-all ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
      <i className={`fas ${icon} text-lg`}></i>
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}
