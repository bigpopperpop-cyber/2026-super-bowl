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
import BettingPanel from './components/BettingPanel';
import Leaderboard from './components/Leaderboard';

const STORAGE_KEY = 'sblix_party_sync_v25';
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
  const [isSynced, setIsSynced] = useState(false);

  // Use useMemo for consistent doc and map references
  const doc = useMemo(() => new Y.Doc(), []);
  const sharedGame = useMemo(() => doc.getMap('gameState'), [doc]);
  const sharedProps = useMemo(() => doc.getMap<any>('props'), [doc]);
  const sharedUserBets = useMemo(() => doc.getArray<UserBet>('userBets'), [doc]);
  const sharedUsers = useMemo(() => doc.getMap<User>('users'), [doc]);

  const providersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!user || !roomCode) return;

    const fullRoomName = `sblix-v25-party-${roomCode}`;
    providersRef.current.forEach(p => p.destroy());
    
    // Persistent local and network providers
    const idb = new IndexeddbPersistence(fullRoomName, doc);
    const webrtc = new WebrtcProvider(fullRoomName, doc, { 
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-us.herokuapp.com'] 
    });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    providersRef.current = [idb, webrtc, ws];

    const awareness = ws.awareness;
    awareness.setLocalStateField('user', user);

    const syncUI = () => {
      // Permanent User Registry
      const userRecords = sharedUsers.toJSON();
      setAllUsers(Object.values(userRecords) as User[]);
      
      // Game State Sync
      const g = sharedGame.toJSON() as GameState;
      if (g.quarter) setGameState(g);

      // Shared Bet Ledger
      setAllBets(sharedUserBets.toArray());

      // Prop Pool Merging
      const pData = sharedProps.toJSON() as Record<string, PropBet>;
      setProps(prev => {
        const base = INITIAL_PROPS.map(p => pData[p.id] ? { ...p, ...pData[p.id] } : p);
        const dynamic = Object.values(pData).filter((p: any) => p.isAiGenerated && !INITIAL_PROPS.find(x => x.id === p.id));
        return [...base, ...(dynamic as PropBet[])];
      });

      // Presence Tracking
      const states = Array.from(awareness.getStates().values()) as any[];
      setPresenceCount(states.filter(s => s.user).length);
      setIsSynced(true);
    };

    sharedUsers.observe(syncUI);
    sharedGame.observe(syncUI);
    sharedProps.observe(syncUI);
    sharedUserBets.observe(syncUI);
    awareness.on('change', syncUI);
    
    // Add me to the room record permanently
    sharedUsers.set(user.id, user);

    doc.on('update', syncUI);
    idb.on('synced', syncUI);
    syncUI();

    return () => {
      providersRef.current.forEach(p => p.destroy());
    };
  }, [user, roomCode, doc]);

  // Oracle process (Host only)
  useEffect(() => {
    if (!isHost || gameState.isGameOver) return;
    
    const runOracleCycle = async () => {
      try {
        const gameCheck = await checkGameEnd();
        if (gameCheck.is3rdQuarterOver) {
          sharedGame.set('isGameOver', true);
          sharedGame.set('quarter', 'FINAL');
        } else {
          sharedGame.set('scoreHome', gameCheck.homeScore);
          sharedGame.set('scoreAway', gameCheck.awayScore);
        }

        const resolutions = await resolveProps(props);
        resolutions.forEach(res => {
          const p = (sharedProps.get(res.id) as PropBet | undefined) || props.find(x => x.id === res.id);
          if (p && !p.resolved) {
            sharedProps.set(res.id, { ...p, resolved: true, winner: res.winner });
          }
        });

        if (props.filter(p => !p.resolved).length < 2) {
          const newProps = await generateLiveProps(gameState);
          newProps.forEach(np => {
            const id = generateId();
            sharedProps.set(id, { ...np, id, resolved: false, isAiGenerated: true } as PropBet);
          });
        }
      } catch (e) {
        console.error("Oracle cycle failed:", e);
      }
    };

    const interval = setInterval(runOracleCycle, 60000);
    return () => clearInterval(interval);
  }, [isHost, gameState, props, sharedGame, sharedProps]);

  const handlePlaceBet = (betId: string, selection: string) => {
    if (gameState.isGameOver) return;
    if (allBets.find(b => b.userId === user?.id && b.betId === betId)) return;
    const b: UserBet = { id: generateId(), userId: user!.id, betId, selection, timestamp: Date.now() };
    sharedUserBets.push([b]);
  };

  const settledResults = useMemo(() => props.filter(p => p.resolved).reverse().slice(0, 5), [props]);

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
              <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse' : 'bg-red-500'}`} />
              <h1 className="font-orbitron font-black text-xl italic tracking-tighter text-white uppercase">SBLIX <span className="text-emerald-400">SYNC</span></h1>
            </div>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                 <i className="fas fa-tower-broadcast text-[8px] text-emerald-400"></i>
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{presenceCount} SYNCED</span>
               </div>
               <button onClick={() => setShowQR(true)} className="text-emerald-400 transition-transform active:scale-90"><i className="fas fa-qrcode"></i></button>
            </div>
          </div>

          <div className="bg-gradient-to-b from-slate-800 to-black rounded-2xl p-0.5 border border-white/10 shadow-2xl relative overflow-hidden">
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
               <div className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] px-4">AI monitoring live feed... all huddle phones syncing records...</div>
             )}
           </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden bg-slate-950">
        {activeTab === 'bets' ? (
          <BettingPanel propBets={props} user={user} onPlaceBet={handlePlaceBet} allBets={allBets} />
        ) : (
          <Leaderboard users={allUsers} currentUser={user} propBets={props} userBets={allBets} />
        )}
      </main>

      <nav className="bg-slate-900 border-t border-white/10 flex pb-safe shrink-0 shadow-2xl">
        <NavBtn active={activeTab === 'bets'} icon="fa-ticket" label="Pool" onClick={() => setActiveTab('bets')} />
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

function Login({ onEnter, initialRoom }: any) {
  const [handle, setHandle] = useState('');
  const [room, setRoom] = useState(initialRoom || '');
  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center mb-10 shadow-[0_0_50px_rgba(16,185,129,0.3)] rotate-6">
        <i className="fas fa-eye text-3xl text-black"></i>
      </div>
      <h1 className="text-4xl font-orbitron font-black italic tracking-tighter text-white mb-2 uppercase">SBLIX SYNC</h1>
      <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.5em] mb-12">LIVE HUDDLE HUB</p>
      <div className="w-full max-w-xs space-y-4">
        <input placeholder="ROOM CODE" value={room} onChange={e => setRoom(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 text-white font-black text-center focus:border-emerald-500 outline-none" />
        <input placeholder="YOUR NAME" value={handle} onChange={e => setHandle(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 text-white font-black text-center focus:border-emerald-500 outline-none" />
        <button disabled={!handle || !room} onClick={() => onEnter({ id: generateId(), handle, name: handle, team: 'KC', credits: 1000, lastSeen: Date.now() }, room)} className="w-full py-5 bg-emerald-600 text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 disabled:opacity-30 transition-all">Join Game</button>
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
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">Guests scan to join this specific room</p>
        <button onClick={onClose} className="bg-white/5 w-full py-4 rounded-2xl text-slate-300 font-black text-[10px] uppercase tracking-widest border border-white/10">Close</button>
      </div>
    </div>
  );
}
