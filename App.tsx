import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
// @ts-ignore
import { IndexeddbPersistence } from 'y-indexeddb';
import { User, PropBet, UserBet, GameState } from './types';
import { INITIAL_PROPS } from './constants';
import { generateLiveProps, resolveProps, checkGameEnd } from './services/geminiService';

const STORAGE_KEY = 'sblix_party_v10';
const generateId = () => Math.random().toString(36).substring(2, 11);

export default function App() {
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.toUpperCase() || '';
  });

  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<'bets' | 'leaderboard'>('bets');
  const [gameState, setGameState] = useState<GameState>({ 
    scoreHome: 0, scoreAway: 0, quarter: '1st', time: '15:00', possession: 'home', isGameOver: false 
  });
  const [props, setProps] = useState<PropBet[]>(INITIAL_PROPS);
  const [allBets, setAllBets] = useState<UserBet[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [presenceCount, setPresenceCount] = useState(0);
  const [isHost] = useState(() => localStorage.getItem('sblix_host') === 'true');
  const [showQR, setShowQR] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'searching' | 'settling'>('idle');

  const doc = useMemo(() => new Y.Doc(), []);
  const sharedGame = doc.getMap('gameState');
  const sharedProps = doc.getMap('props');
  const sharedUserBets = doc.getArray<UserBet>('userBets');
  const sharedUsers = doc.getMap<User>('users');

  const providersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!user || !roomCode) return;

    const fullRoomName = `sblix-v10-${roomCode}`;
    
    // Cleanup old providers
    providersRef.current.forEach(p => p.destroy());
    
    const idb = new IndexeddbPersistence(fullRoomName, doc);
    const webrtc = new WebrtcProvider(fullRoomName, doc, { 
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'] 
    });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    providersRef.current = [idb, webrtc, ws];

    // Presence Tracking
    const awareness = ws.awareness;
    awareness.setLocalStateField('user', user);
    awareness.on('change', () => {
      setPresenceCount(awareness.getStates().size);
    });

    // Sync State
    const syncUI = () => {
      // Users Persistence
      setAllUsers(Object.values(sharedUsers.toJSON()) as User[]);
      
      // Game Engine
      const g = sharedGame.toJSON() as GameState;
      if (g.quarter) setGameState(g);

      // Bets History
      setAllBets(sharedUserBets.toArray());

      // Prop Library
      const pData = sharedProps.toJSON();
      setProps(prev => {
        const base = INITIAL_PROPS.map(p => pData[p.id] ? { ...p, ...pData[p.id] } : p);
        const dynamic = Object.values(pData).filter((p: any) => p.isAiGenerated && !INITIAL_PROPS.find(x => x.id === p.id));
        return [...base, ...(dynamic as PropBet[])];
      });
    };

    sharedUsers.observe(syncUI);
    sharedGame.observe(syncUI);
    sharedProps.observe(syncUI);
    sharedUserBets.observe(syncUI);
    
    // Register current user globally in the room
    sharedUsers.set(user.id, user);

    doc.on('update', syncUI);
    syncUI();

    return () => providersRef.current.forEach(p => p.destroy());
  }, [user, doc, roomCode]);

  // AI Host Automation
  useEffect(() => {
    if (!isHost || gameState.isGameOver) return;

    const runOracle = async () => {
      try {
        setAiStatus('searching');
        const gameCheck = await checkGameEnd();
        
        if (gameCheck.is3rdQuarterOver) {
          sharedGame.set('isGameOver', true);
          sharedGame.set('quarter', 'FINAL');
          setAiStatus('idle');
          return;
        }

        if (gameCheck.homeScore !== gameState.scoreHome || gameCheck.awayScore !== gameState.scoreAway) {
          sharedGame.set('scoreHome', gameCheck.homeScore);
          sharedGame.set('scoreAway', gameCheck.awayScore);
          sharedGame.set('quarter', gameState.quarter);
        }

        setAiStatus('settling');
        const resolutions = await resolveProps(props);
        resolutions.forEach(res => {
          const p = sharedProps.get(res.id) || props.find(x => x.id === res.id);
          if (p && !p.resolved) {
            sharedProps.set(res.id, { ...p, resolved: true, winner: res.winner });
          }
        });

        if (props.filter(p => !p.resolved).length < 3) {
          setAiStatus('searching');
          const newProps = await generateLiveProps(gameState);
          newProps.forEach(np => {
            const id = generateId();
            sharedProps.set(id, { ...np, id, resolved: false, isAiGenerated: true });
          });
        }
        setAiStatus('idle');
      } catch (e) {
        setAiStatus('idle');
      }
    };

    const interval = setInterval(runOracle, 45000);
    return () => clearInterval(interval);
  }, [isHost, gameState, props]);

  const handlePlaceBet = (betId: string, selection: string) => {
    if (gameState.isGameOver) return;
    if (allBets.find(b => b.userId === user?.id && b.betId === betId)) return;
    const b: UserBet = { id: generateId(), userId: user!.id, betId, selection, timestamp: Date.now() };
    sharedUserBets.push([b]);
  };

  const settledResults = useMemo(() => props.filter(p => p.resolved).reverse().slice(0, 10), [props]);

  if (!user || !roomCode) {
    return (
      <Login 
        onEnter={(u, r) => { 
          setUser(u); 
          setRoomCode(r.toUpperCase()); 
          localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); 
          window.history.replaceState({}, '', `?room=${r.toUpperCase()}`); 
        }} 
        initialRoom={roomCode} 
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-white max-w-lg mx-auto border-x border-white/5 shadow-2xl overflow-hidden font-inter">
      <header className="shrink-0 z-50">
        <div className="p-4 bg-slate-900/90 backdrop-blur-xl border-b border-white/10">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
              <h1 className="font-orbitron font-black text-xl italic tracking-tighter text-white uppercase">SBLIX <span className="text-emerald-400">Oracle</span></h1>
            </div>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                 <i className="fas fa-bolt text-[8px] text-emerald-400"></i>
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{presenceCount} SYNCED</span>
               </div>
               <button onClick={() => setShowQR(true)} className="text-emerald-400 p-1"><i className="fas fa-qrcode"></i></button>
            </div>
          </div>

          <div className="bg-gradient-to-b from-slate-800 to-black rounded-2xl p-0.5 border border-white/10 shadow-2xl relative overflow-hidden">
            {gameState.isGameOver && <div className="absolute inset-0 bg-red-600/40 backdrop-blur-sm flex items-center justify-center z-10 font-orbitron font-black text-xs tracking-[0.4em]">SESSION OVER</div>}
            <div className="flex justify-between items-stretch h-16 bg-black/90 rounded-[14px] overflow-hidden">
              <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-r from-emerald-950/20 to-transparent">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">HOME</span>
                <span className="text-4xl font-orbitron font-black text-white">{gameState.scoreHome}</span>
              </div>
              <div className="w-24 border-x border-white/5 flex flex-col items-center justify-center bg-white/5">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter mb-0.5">{gameState.quarter}</span>
                <span className="text-[9px] font-bold text-slate-500 font-mono">{gameState.time}</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-l from-indigo-950/20 to-transparent">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">AWAY</span>
                <span className="text-4xl font-orbitron font-black text-white">{gameState.scoreAway}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-emerald-950/20 border-b border-emerald-500/10 py-1.5 overflow-hidden whitespace-nowrap">
           <div className="flex animate-ticker gap-10 items-center">
             {settledResults.length > 0 ? settledResults.map(p => (
               <div key={p.id} className="flex items-center gap-2">
                 <span className="text-[9px] font-black text-slate-400 uppercase">{p.question.substring(0,25)}:</span>
                 <span className="text-[9px] font-black text-emerald-400 uppercase font-orbitron">{p.winner}</span>
               </div>
             )) : (
               <div className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] px-4">AI Oracle monitoring play-by-play live...</div>
             )}
             {settledResults.map(p => (
               <div key={p.id+'_dup'} className="flex items-center gap-2">
                 <span className="text-[9px] font-black text-slate-400 uppercase">{p.question.substring(0,25)}:</span>
                 <span className="text-[9px] font-black text-emerald-400 uppercase font-orbitron">{p.winner}</span>
               </div>
             ))}
           </div>
        </div>
      </header>

      {isHost && (
        <div className="bg-indigo-600/10 border-b border-indigo-500/10 px-4 py-1 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <i className={`fas fa-microchip text-[9px] ${aiStatus !== 'idle' ? 'animate-spin text-indigo-400' : 'text-slate-600'}`}></i>
             <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Oracle System: {aiStatus}</span>
           </div>
           <span className="text-[7px] text-slate-600 font-black uppercase">Host Controls Active</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar bg-slate-950">
        {activeTab === 'bets' ? (
          <BetsView props={props} allBets={allBets} user={user} onBet={handlePlaceBet} isGameOver={gameState.isGameOver} />
        ) : (
          <LeaderboardView users={allUsers} allBets={allBets} props={props} currentUser={user} />
        )}
      </main>

      <nav className="bg-slate-900 border-t border-white/10 flex pb-safe shrink-0 shadow-2xl">
        <NavBtn active={activeTab === 'bets'} icon="fa-ticket" label="Live Pool" onClick={() => setActiveTab('bets')} />
        <NavBtn active={activeTab === 'leaderboard'} icon="fa-trophy" label="Standings" onClick={() => setActiveTab('leaderboard')} />
      </nav>

      {showQR && <QRModal url={`${window.location.origin}${window.location.pathname}?room=${roomCode}`} onClose={() => setShowQR(false)} />}
    </div>
  );
}

function NavBtn({ active, icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-all ${active ? 'text-emerald-400 bg-emerald-400/5' : 'text-slate-500'}`}>
      <i className={`fas ${icon} text-lg`}></i>
      <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function BetsView({ props, allBets, user, onBet, isGameOver }: any) {
  const sortedProps = useMemo(() => [...props].sort((a, b) => (a.resolved ? 1 : -1)), [props]);
  
  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Huddle Prop Bets</h2>
        {isGameOver && <span className="text-[10px] font-black text-red-500 uppercase">Pool Closed</span>}
      </div>
      {sortedProps.map(p => {
        const myBet = allBets.find(b => b.userId === user.id && b.betId === p.id);
        return (
          <div key={p.id} className={`p-5 rounded-2xl border transition-all duration-300 ${p.resolved ? 'bg-black/40 opacity-40 border-white/5' : myBet ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-900 border-white/10'}`}>
            <div className="flex justify-between items-start mb-2">
              <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${p.category === 'PRE-GAME' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-slate-500'}`}>{p.category}</span>
              {p.isAiGenerated && <span className="text-[8px] font-black text-emerald-400 animate-pulse"><i className="fas fa-magic mr-1"></i> LIVE AI</span>}
            </div>
            <p className="font-bold text-lg mb-4 text-white leading-tight">{p.question}</p>
            {p.resolved ? (
              <div className="text-xs font-black text-emerald-400 uppercase flex items-center gap-2 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <i className="fas fa-check-circle"></i> WINNER: {p.winner}
              </div>
            ) : myBet ? (
              <div className="text-xs font-black text-emerald-400 uppercase flex items-center gap-2 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <i className="fas fa-lock"></i> PICKED: {myBet.selection}
              </div>
            ) : isGameOver ? (
              <div className="text-xs text-slate-600 font-bold uppercase p-3 border border-white/5 rounded-xl text-center">Locked</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {p.options.map((opt: string) => (
                  <button key={opt} onClick={() => onBet(p.id, opt)} className="py-4 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all active:scale-95 text-left px-5 flex justify-between items-center group">
                    {opt}
                    <i className="fas fa-chevron-right opacity-0 group-hover:opacity-100 transition-opacity"></i>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardView({ users, allBets, props, currentUser }: any) {
  const leaderboard = useMemo(() => {
    return users.map((u: any) => {
      let score = 0;
      let correct = 0;
      let total = 0;
      const uBets = allBets.filter((b: any) => b.userId === u.id);
      uBets.forEach((b: any) => {
        const prop = props.find((p: any) => p.id === b.betId);
        if (prop?.resolved) {
          total++;
          if (prop.winner === b.selection) {
            score += 100;
            correct++;
          } else {
            score -= 50;
          }
        }
      });
      return { ...u, score, correct, total };
    }).sort((a: any, b: any) => b.score - a.score);
  }, [users, allBets, props]);

  return (
    <div className="p-4 space-y-4 pb-24">
      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] px-1">Gridiron Standings</h2>
      <div className="space-y-3">
        {leaderboard.length === 0 && (
          <div className="text-center py-20 text-slate-600 text-[10px] font-black uppercase tracking-widest">Waiting for players to join...</div>
        )}
        {leaderboard.map((u: any, i: number) => {
          const isMe = u.id === currentUser.id;
          return (
            <div key={u.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isMe ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-white/5'}`}>
              <span className={`font-orbitron font-black text-2xl w-8 text-center ${i === 0 ? 'text-yellow-500' : 'text-slate-700'}`}>#{i+1}</span>
              <div className="flex-1">
                <p className="font-black text-sm uppercase text-white flex items-center gap-2">
                  {u.handle}
                  {isMe && <span className="text-[7px] bg-emerald-500 text-black px-1 rounded">YOU</span>}
                </p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{u.correct} Correct • {u.total} Picked</p>
              </div>
              <div className="text-right">
                <p className={`font-orbitron font-black text-xl ${u.score > 0 ? 'text-emerald-400' : u.score < 0 ? 'text-red-500' : 'text-slate-500'}`}>{u.score}</p>
                <p className="text-[8px] font-black text-slate-500 uppercase">Points</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Login({ onEnter, initialRoom }: any) {
  const [handle, setHandle] = useState('');
  const [room, setRoom] = useState(initialRoom || '');
  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center mb-10 shadow-[0_0_50px_rgba(16,185,129,0.3)] rotate-6">
        <i className="fas fa-eye text-3xl text-black"></i>
      </div>
      <h1 className="text-4xl font-orbitron font-black italic tracking-tighter text-white mb-2 uppercase">ORACLE SYNC</h1>
      <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.5em] mb-12">LIVE SBLIX HUB</p>
      <div className="w-full max-w-xs space-y-4">
        <input placeholder="ROOM CODE" value={room} onChange={e => setRoom(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 text-white font-black text-center focus:border-emerald-500 outline-none" />
        <input placeholder="YOUR HANDLE" value={handle} onChange={e => setHandle(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 text-white font-black text-center focus:border-emerald-500 outline-none" />
        <button disabled={!handle || !room} onClick={() => onEnter({ id: generateId(), handle, name: handle, team: 'KC', credits: 1000, lastSeen: Date.now() }, room)} className="w-full py-5 bg-emerald-600 text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 disabled:opacity-30 transition-all">Enter Pool</button>
      </div>
    </div>
  );
}

function QRModal({ url, onClose }: any) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md">
      <div className="bg-slate-900 border border-white/10 p-10 rounded-[3rem] w-full max-w-xs text-center flex flex-col items-center gap-6 shadow-2xl">
        <h2 className="font-orbitron font-black text-emerald-400 uppercase text-xs tracking-[0.3em]">Huddle Sync</h2>
        <div className="bg-white p-4 rounded-3xl">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&color=020617`} alt="QR" className="w-44 h-44" />
        </div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">Scan to join this huddle with other guests</p>
        <button onClick={onClose} className="bg-white/5 w-full py-4 rounded-2xl text-slate-300 font-black text-[10px] uppercase tracking-widest border border-white/10">Back to Game</button>
      </div>
    </div>
  );
}
