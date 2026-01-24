
import React, { useState, useEffect, useMemo } from 'react';
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

const STORAGE_KEY = 'sblix_v6_engine';
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

  const [activeTab, setActiveTab] = useState<'bets' | 'leaderboard' | 'admin'>('bets');
  const [gameState, setGameState] = useState<GameState>({ scoreHome: 0, scoreAway: 0, quarter: '1st', time: '15:00', possession: 'home', isGameOver: false });
  const [props, setProps] = useState<PropBet[]>(INITIAL_PROPS);
  const [allBets, setAllBets] = useState<UserBet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isHost] = useState(() => localStorage.getItem('sblix_host') === 'true');
  const [showQR, setShowQR] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'searching' | 'settling'>('idle');

  const doc = useMemo(() => new Y.Doc(), []);
  const sharedGame = doc.getMap('gameState');
  const sharedProps = doc.getMap('props');
  const sharedUserBets = doc.getArray<UserBet>('userBets');
  const sharedUsers = doc.getMap('users');

  useEffect(() => {
    if (!user || !roomCode) return;
    const fullRoomName = `sblix-party-${roomCode}`;
    new IndexeddbPersistence(fullRoomName, doc);
    const webrtc = new WebrtcProvider(fullRoomName, doc, { signaling: ['wss://signaling.yjs.dev'] });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    const syncUI = () => {
      setGameState(sharedGame.toJSON() as GameState);
      setAllBets(sharedUserBets.toArray());
      const pData = sharedProps.toJSON();
      setProps(prev => {
        const base = prev.map(p => pData[p.id] ? { ...p, ...pData[p.id] } : p);
        const dynamic = Object.values(pData).filter((p: any) => p.isAiGenerated && !prev.find(x => x.id === p.id));
        return [...base, ...(dynamic as PropBet[])];
      });
      setUsers(Object.values(sharedUsers.toJSON()) as User[]);
    };

    sharedGame.observe(syncUI);
    sharedProps.observe(syncUI);
    sharedUserBets.observe(syncUI);
    sharedUsers.observe(syncUI);

    const heartbeat = setInterval(() => {
      sharedUsers.set(user.id, { ...user, lastSeen: Date.now() });
    }, 10000);

    return () => { webrtc.destroy(); ws.destroy(); clearInterval(heartbeat); };
  }, [user, doc, roomCode]);

  // AI Oracle Automation (Only runs on Host device)
  useEffect(() => {
    if (!isHost || gameState.isGameOver) return;

    const runOracle = async () => {
      setAiStatus('searching');
      const gameCheck = await checkGameEnd();
      
      if (gameCheck.is3rdQuarterOver) {
        sharedGame.set('isGameOver', true);
        sharedGame.set('quarter', 'Final (3rd Q End)');
        sharedGame.set('scoreHome', gameCheck.homeScore);
        sharedGame.set('scoreAway', gameCheck.awayScore);
        setAiStatus('idle');
        return;
      }

      // Automatically Settle Finished Props
      setAiStatus('settling');
      const resolutions = await resolveProps(props);
      resolutions.forEach(res => {
        sharedProps.set(res.id, { ...sharedProps.get(res.id), resolved: true, winner: res.winner });
      });

      // Generate New Live Props if needed
      if (props.filter(p => !p.resolved).length < 4) {
        setAiStatus('searching');
        const newProps = await generateLiveProps(gameState);
        newProps.forEach(np => {
          const id = generateId();
          sharedProps.set(id, { ...np, id, resolved: false, isAiGenerated: true });
        });
      }
      setAiStatus('idle');
    };

    const interval = setInterval(runOracle, 45000); // Check every 45s
    return () => clearInterval(interval);
  }, [isHost, gameState, props]);

  const handlePlaceBet = (betId: string, selection: string) => {
    if (gameState.isGameOver) return;
    const b: UserBet = { id: generateId(), userId: user!.id, betId, selection, timestamp: Date.now() };
    sharedUserBets.push([b]);
  };

  if (!user || !roomCode) return <Login onEnter={(u, r) => { setUser(u); setRoomCode(r.toUpperCase()); localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); window.history.replaceState({}, '', `?room=${r.toUpperCase()}`); }} initialRoom={roomCode} />;

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white max-w-lg mx-auto border-x border-white/5 shadow-2xl overflow-hidden">
      {/* HUD */}
      <header className="p-4 bg-slate-900/50 backdrop-blur-xl border-b border-white/10 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
            <h1 className="font-orbitron font-black text-2xl italic tracking-tighter text-emerald-400">ORACLE</h1>
          </div>
          <button onClick={() => setShowQR(true)} className="bg-white/5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-white/10">
            <i className="fas fa-qrcode text-emerald-400"></i> INVITE
          </button>
        </div>

        <div className="bg-black/80 rounded-2xl p-4 border border-white/10 flex justify-between items-center relative overflow-hidden">
          {gameState.isGameOver && <div className="absolute inset-0 bg-red-600/20 backdrop-blur-[2px] flex items-center justify-center z-10 font-orbitron font-black text-xl tracking-widest text-red-500">GAME OVER</div>}
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">HOME</p>
            <p className="text-4xl font-orbitron font-black">{gameState.scoreHome}</p>
          </div>
          <div className="text-center px-6 border-x border-white/5">
            <div className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full mb-1 border border-emerald-500/20">
              {gameState.quarter}
            </div>
            <p className="text-[10px] font-bold text-slate-500">{gameState.time}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">AWAY</p>
            <p className="text-4xl font-orbitron font-black">{gameState.scoreAway}</p>
          </div>
        </div>
      </header>

      {/* AI Pulse */}
      {isHost && (
        <div className="bg-indigo-600/10 border-b border-indigo-500/20 px-4 py-2 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <i className={`fas fa-microchip text-xs ${aiStatus !== 'idle' ? 'animate-spin text-indigo-400' : 'text-slate-600'}`}></i>
             <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">Oracle: {aiStatus}</span>
           </div>
           <span className="text-[8px] text-slate-600 font-black">AI MONITORING LIVE</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar">
        {activeTab === 'bets' ? (
          <BetsView props={props} allBets={allBets} user={user} onBet={handlePlaceBet} isGameOver={gameState.isGameOver} />
        ) : (
          <LeaderboardView users={users} allBets={allBets} props={props} />
        )}
      </main>

      <nav className="bg-slate-900 border-t border-white/10 flex pb-safe shrink-0">
        <NavBtn active={activeTab === 'bets'} icon="fa-bolt" label="Live Props" onClick={() => setActiveTab('bets')} />
        <NavBtn active={activeTab === 'leaderboard'} icon="fa-trophy" label="Standings" onClick={() => setActiveTab('leaderboard')} />
        {isHost && <NavBtn active={activeTab === 'admin'} icon="fa-cog" label="System" onClick={() => setActiveTab('admin')} />}
      </nav>

      {showQR && <QRModal url={`${window.location.origin}${window.location.pathname}?room=${roomCode}`} onClose={() => setShowQR(false)} />}
    </div>
  );
}

function NavBtn({ active, icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex-1 py-5 flex flex-col items-center gap-1 transition-all ${active ? 'text-emerald-400 bg-emerald-400/5' : 'text-slate-500'}`}>
      <i className={`fas ${icon} text-lg`}></i>
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function BetsView({ props, allBets, user, onBet, isGameOver }: any) {
  const sortedProps = useMemo(() => [...props].sort((a, b) => (a.resolved ? 1 : -1)), [props]);
  
  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Huddle Predictions</h2>
        {isGameOver && <span className="text-[10px] font-black text-red-500 uppercase">Pool Locked</span>}
      </div>
      {sortedProps.map(p => {
        const myBet = allBets.find((b: any) => b.userId === user.id && b.betId === p.id);
        return (
          <div key={p.id} className={`p-5 rounded-2xl border transition-all ${p.resolved ? 'bg-black/40 opacity-40 border-white/5' : myBet ? 'bg-emerald-500/5 border-emerald-500/50' : 'bg-slate-900 border-white/10'}`}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 uppercase tracking-widest">{p.category}</span>
              {p.isAiGenerated && <span className="text-[9px] font-black text-indigo-400"><i className="fas fa-magic mr-1"></i> AI LIVE</span>}
            </div>
            <p className="font-bold text-lg mb-4 text-white leading-tight">{p.question}</p>
            {p.resolved ? (
              <div className="text-xs font-black text-emerald-400 uppercase flex items-center gap-2 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <i className="fas fa-check-circle"></i> WINNER: {p.winner}
              </div>
            ) : myBet ? (
              <div className="text-xs font-black text-emerald-400 uppercase flex items-center gap-2 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <i className="fas fa-lock"></i> PICK: {myBet.selection}
              </div>
            ) : isGameOver ? (
              <div className="text-xs text-slate-600 font-bold uppercase p-3 border border-white/5 rounded-xl text-center">Bets Locked</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {p.options.map((opt: string) => (
                  <button key={opt} onClick={() => onBet(p.id, opt)} className="py-4 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all active:scale-95">
                    {opt}
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

function LeaderboardView({ users, allBets, props }: any) {
  const leaderboard = useMemo(() => {
    return users.map((u: any) => {
      let score = 0;
      let correct = 0;
      let total = 0;
      let streakCount = 0;
      let maxBadStreak = 0;
      let currentBadStreak = 0;

      const uBets = allBets.filter((b: any) => b.userId === u.id).sort((a: any, b: any) => a.timestamp - b.timestamp);
      uBets.forEach((b: any) => {
        const prop = props.find((p: any) => p.id === b.betId);
        if (prop?.resolved) {
          total++;
          if (prop.winner === b.selection) {
            score += 100;
            correct++;
            currentBadStreak = 0;
          } else {
            score -= 50;
            currentBadStreak++;
            maxBadStreak = Math.max(maxBadStreak, currentBadStreak);
          }
        }
      });
      return { ...u, score, correct, total, maxBadStreak, isEarly: uBets.length > 0 && uBets[0].timestamp === Math.min(...allBets.map((b: any) => b.timestamp)) };
    }).sort((a: any, b: any) => b.score - a.score);
  }, [users, allBets, props]);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] px-1">Trophy Room</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <TrophyBadge icon="fa-crown" label="THE GOAT" user={leaderboard[0]} type="good" />
        <TrophyBadge icon="fa-skull" label="FUMBLED BAG" user={[...leaderboard].reverse()[0]} type="bad" />
        <TrophyBadge icon="fa-crosshairs" label="SNIPER" user={leaderboard.find((u: any) => u.total >= 3 && u.correct === u.total)} type="good" />
        <TrophyBadge icon="fa-snowflake" label="ICE COLD" user={leaderboard.sort((a: any, b: any) => b.maxBadStreak - a.maxBadStreak)[0]} type="bad" />
      </div>

      <div className="space-y-3">
        {leaderboard.map((u: any, i: number) => (
          <div key={u.id} className="flex items-center gap-4 p-4 bg-slate-900 rounded-2xl border border-white/5">
            <span className="font-orbitron font-black text-2xl text-slate-700 w-8">#{i+1}</span>
            <div className="flex-1">
              <p className="font-black text-sm uppercase text-white">{u.handle}</p>
              <div className="flex gap-2 mt-1">
                {u.total >= 3 && u.correct === u.total && <i className="fas fa-crosshairs text-emerald-400 text-[10px]"></i>}
                {i === 0 && u.score > 0 && <i className="fas fa-crown text-yellow-500 text-[10px]"></i>}
                {u.maxBadStreak >= 2 && <i className="fas fa-snowflake text-blue-400 text-[10px]"></i>}
              </div>
            </div>
            <div className="text-right">
               <p className={`font-orbitron font-black ${u.score > 0 ? 'text-emerald-400' : 'text-red-500'}`}>{u.score}</p>
               <p className="text-[8px] font-black text-slate-500 uppercase">{u.correct}/{u.total} CORRECT</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrophyBadge({ icon, label, user, type }: any) {
  if (!user || user.total === 0) return null;
  return (
    <div className={`p-4 rounded-2xl border flex flex-col items-center gap-2 text-center shadow-xl ${type === 'good' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
      <i className={`fas ${icon} text-xl ${type === 'good' ? 'text-emerald-400' : 'text-red-500'}`}></i>
      <div>
        <p className={`text-[8px] font-black uppercase tracking-widest ${type === 'good' ? 'text-emerald-400' : 'text-red-500'}`}>{label}</p>
        <p className="text-[10px] font-black text-white uppercase mt-1">{user.handle}</p>
      </div>
    </div>
  );
}

function Login({ onEnter, initialRoom }: any) {
  const [handle, setHandle] = useState('');
  const [room, setRoom] = useState(initialRoom || '');
  return (
    <div className="fixed inset-0 bg-[#050505] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(16,185,129,0.3)] rotate-6">
        <i className="fas fa-eye text-3xl text-black"></i>
      </div>
      <h1 className="text-5xl font-orbitron font-black italic tracking-tighter text-white mb-2">ORACLE</h1>
      <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.4em] mb-12">SBLIX Live Monitoring</p>
      <div className="w-full max-w-xs space-y-4">
        <input placeholder="PARTY CODE" value={room} onChange={e => setRoom(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white font-black text-center" />
        <input placeholder="YOUR HANDLE" value={handle} onChange={e => setHandle(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white font-black text-center" />
        <button disabled={!handle || !room} onClick={() => onEnter({ id: generateId(), handle, name: handle, team: 'KC', credits: 1000, lastSeen: Date.now() }, room)} className="w-full py-5 bg-emerald-600 text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 disabled:opacity-30">Enter Huddle</button>
      </div>
    </div>
  );
}

function QRModal({ url, onClose }: any) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-xs text-center flex flex-col items-center gap-6">
        <h2 className="font-orbitron font-black text-emerald-400 uppercase text-xs tracking-widest">Join the Game</h2>
        <div className="bg-white p-4 rounded-3xl">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&color=050505`} alt="QR" className="w-44 h-44" />
        </div>
        <button onClick={onClose} className="text-slate-500 font-black text-[10px] uppercase tracking-widest">Close</button>
      </div>
    </div>
  );
}
