
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types.ts';
import { INITIAL_PROP_BETS, NFL_TEAMS } from './constants.tsx';
import { getAICommentary } from './services/geminiService.ts';
import BettingPanel from './components/BettingPanel.tsx';
import ChatRoom from './components/ChatRoom.tsx';
import Leaderboard from './components/Leaderboard.tsx';
import TeamHelmet from './components/TeamHelmet.tsx';

type AppMode = 'LANDING' | 'GAME';
type TabType = 'chat' | 'bets' | 'leaderboard' | 'command';
type ConnStatus = 'OFFLINE' | 'CONNECTING' | 'SYNCED' | 'ROBUST';

const APP_VERSION = 'v25.02.13-STABLE'; 
const STORAGE_KEY = 'sblix_user_v25';
const HOST_KEY = 'sblix_host_v25';

const generateId = () => Math.random().toString(36).substring(2, 9);

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ? 'GAME' : 'LANDING';
    } catch {
      return 'LANDING';
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [allUserBets, setAllUserBets] = useState<UserBet[]>([]);
  
  // Connection state
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>('CONNECTING');

  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isHost, setIsHost] = useState(() => {
    try {
      return localStorage.getItem(HOST_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const partyCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || 'SBLIX').toUpperCase();
  }, []);

  // Shared Doc and Maps
  const doc = useMemo(() => new Y.Doc(), []);
  const sharedGame = useMemo(() => doc.getMap('gameState'), [doc]);
  const sharedMessages = useMemo(() => doc.getArray<ChatMessage>('messages'), [doc]);
  const sharedProps = useMemo(() => doc.getMap('props'), [doc]);
  const sharedUsers = useMemo(() => doc.getMap('users'), [doc]);
  const sharedUserBets = useMemo(() => doc.getArray<UserBet>('userBets'), [doc]);

  useEffect(() => {
    if (!currentUser) return;

    const roomName = `sblix-v25-mesh-${partyCode}`;
    
    // 1. Local Persistence
    const persistence = new IndexeddbPersistence(roomName, doc);
    
    // 2. WebRTC Mesh
    const webrtcProvider = new WebrtcProvider(roomName, doc, {
      signaling: [
        'wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-us.herokuapp.com',
        'wss://y-webrtc-signaling-eu.herokuapp.com'
      ]
    });

    // 3. Central WebSocket Relay
    const wsProvider = new WebsocketProvider('wss://demos.yjs.dev', roomName, doc);

    const updateConnStats = () => {
      const peers = webrtcProvider.room.webrtcConns.size;
      const ws = wsProvider.wsconnected;
      setConnectedPeers(peers);
      setWsConnected(ws);
      
      if (ws && peers > 0) setConnStatus('ROBUST');
      else if (ws || peers > 0) setConnStatus('SYNCED');
      else setConnStatus('CONNECTING');
    };

    webrtcProvider.on('status', updateConnStats);
    wsProvider.on('status', updateConnStats);
    webrtcProvider.room.on('peers', updateConnStats);

    // Initial sync
    const syncAll = () => {
      // Game State
      const gameData = sharedGame.toJSON();
      if (Object.keys(gameData).length > 0) {
        setGameState({
          quarter: gameData.quarter ?? 1,
          timeRemaining: gameData.timeRemaining ?? "15:00",
          score: { home: gameData.scoreHome ?? 0, away: gameData.scoreAway ?? 0 },
          possession: gameData.possession ?? 'home'
        });
      }
      
      // Messages
      const msgArray = sharedMessages.toArray();
      setMessages(msgArray.sort((a, b) => a.timestamp - b.timestamp).slice(-100));
      
      // Bets
      setAllUserBets(sharedUserBets.toArray());
      
      // Props
      const pMap = sharedProps.toJSON();
      setPropBets(prev => prev.map(p => pMap[p.id] ? { ...p, ...pMap[p.id] } : p));
      
      // Active Users
      const userMap = sharedUsers.toJSON();
      const now = Date.now();
      const active = Object.values(userMap)
        .filter((u: any) => now - (u.lastPing || 0) < 45000) as User[];
      setUsers(active);
    };

    sharedGame.observe(syncAll);
    sharedMessages.observe(syncAll);
    sharedUserBets.observe(syncAll);
    sharedProps.observe(syncAll);
    sharedUsers.observe(syncAll);

    // Heartbeat
    const heartbeat = setInterval(() => {
      sharedUsers.set(currentUser.id, { ...currentUser, lastPing: Date.now() });
      updateConnStats();
    }, 15000);

    sharedUsers.set(currentUser.id, { ...currentUser, lastPing: Date.now() });
    syncAll();

    return () => {
      webrtcProvider.destroy();
      wsProvider.destroy();
      persistence.destroy();
      clearInterval(heartbeat);
    };
  }, [currentUser, doc, partyCode, sharedGame, sharedMessages, sharedProps, sharedUsers, sharedUserBets]);

  const onSendMessage = useCallback((text: string) => {
    if (!currentUser) return;
    const msg: ChatMessage = { 
      id: generateId(), 
      userId: currentUser.id, 
      username: currentUser.username, 
      text, 
      timestamp: Date.now() 
    };
    try {
      doc.transact(() => {
        sharedMessages.push([msg]);
      });
    } catch (e) {
      console.error("[SBLIX] Chat Send Failed:", e);
    }
  }, [currentUser, doc, sharedMessages]);

  const onPlaceBet = useCallback((betId: string, amount: number, selection: string) => {
    if (!currentUser) return;
    const newBet: UserBet = {
      id: generateId(),
      userId: currentUser.id,
      betId,
      amount,
      selection,
      status: BetStatus.PENDING,
      placedAt: Date.now()
    };
    doc.transact(() => {
      sharedUserBets.push([newBet]);
    });
  }, [currentUser, doc, sharedUserBets]);

  const updateGame = (updates: any) => {
    if (!isHost) return;
    doc.transact(() => {
      if (updates.quarter !== undefined) sharedGame.set('quarter', updates.quarter);
      if (updates.timeRemaining !== undefined) sharedGame.set('timeRemaining', updates.timeRemaining);
      if (updates.scoreHome !== undefined) sharedGame.set('scoreHome', updates.scoreHome);
      if (updates.scoreAway !== undefined) sharedGame.set('scoreAway', updates.scoreAway);
      if (updates.possession !== undefined) sharedGame.set('possession', updates.possession);
    });
  };

  const resolveProp = (betId: string, outcome: string) => {
    if (!isHost) return;
    doc.transact(() => {
      sharedProps.set(betId, { resolved: true, outcome });
    });
  };

  const onTriggerAiCommentary = async () => {
    if (!isHost || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const commentary = await getAICommentary(messages, gameState, users);
      const msg: ChatMessage = {
        id: generateId(), userId: 'AI_GERRY', username: 'GERRY THE GAMBLER',
        text: commentary, timestamp: Date.now(), isAI: true
      };
      sharedMessages.push([msg]);
    } catch (err) {
      console.error("[SBLIX] AI Failure:", err);
    } finally { setIsAiLoading(false); }
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl border-white/20">
          <div className="absolute top-4 right-4 text-[7px] text-white/30 font-mono">{APP_VERSION}</div>
          <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-3 border-4 border-blue-600">
            <i className="fas fa-satellite-dish text-blue-600 text-4xl animate-pulse"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 tracking-tighter">SBLIX GRID-MESH</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8 text-center">HYPER-SYNC RELIABILITY v25</p>
          <GuestLogin onLogin={(e, h, r, t) => {
            e.preventDefault();
            const newUser = { id: generateId(), username: h, realName: r, avatar: t, credits: 0 };
            setCurrentUser(newUser);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser)); } catch {}
            setMode('GAME');
          }} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      <div className="h-1 w-full bg-slate-900 flex overflow-hidden">
        <div className={`h-full transition-all duration-1000 ${
          connStatus === 'ROBUST' ? 'bg-blue-500 w-full shadow-[0_0_10px_#3b82f6]' : 
          connStatus === 'SYNCED' ? 'bg-green-500 w-2/3 shadow-[0_0_10px_#22c55e]' : 
          'bg-yellow-500 w-1/3 animate-pulse'}`} />
      </div>

      <header className="bg-slate-900 border-b border-slate-800 p-3 shrink-0 z-40">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <h1 className="text-lg font-black font-orbitron text-blue-500 leading-none">SBLIX</h1>
              <span className="text-[6px] text-slate-500 font-mono mt-0.5">{APP_VERSION}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px]">
              <span className="font-orbitron font-black text-slate-200 uppercase">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold tabular-nums">{gameState.score.home}-{gameState.score.away}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[7px] font-black uppercase tracking-tighter text-right leading-tight">
                <div className={wsConnected ? 'text-blue-400' : 'text-slate-600'}>{wsConnected ? 'RELAY ACTIVE' : 'RELAY OFFLINE'}</div>
                <div className={connectedPeers > 0 ? 'text-green-400' : 'text-slate-600'}>{connectedPeers} MESH PEERS</div>
             </div>
             <TeamHelmet teamId={currentUser.avatar} size="md" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && <ChatRoom user={currentUser} messages={messages} users={users} onSendMessage={onSendMessage} />}
        {activeTab === 'bets' && <BettingPanel propBets={propBets} user={currentUser} allBets={allUserBets} onPlaceBet={onPlaceBet} />}
        {activeTab === 'leaderboard' && <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={allUserBets} />}
        
        {activeTab === 'command' && isHost && (
          <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24 h-full bg-slate-950 custom-scrollbar">
             <div className="flex items-center justify-between">
                <div>
                   <h2 className="text-sm font-black font-orbitron text-white">COMMAND CONSOLE</h2>
                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">MESH KEY: {partyCode}</p>
                </div>
                <button onClick={() => { if (confirm("Exit Host?")) { setIsHost(false); localStorage.removeItem(HOST_KEY); setActiveTab('chat'); }}} className="text-[8px] font-black text-red-500 border border-red-500/30 px-2 py-1 rounded uppercase">Exit</button>
             </div>

             <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-[2rem] p-6 shadow-2xl">
                <button onClick={onTriggerAiCommentary} disabled={isAiLoading} className={`w-full py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-all ${isAiLoading ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 border-b-4 border-indigo-800 active:scale-95'}`}>
                  {isAiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                  {isAiLoading ? 'ANALYZING...' : 'SUMMON GERRY THE GAMBLER'}
                </button>
             </div>

             <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 shadow-2xl">
                <h3 className="text-center text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-8 font-orbitron">SCOREBOARD MASTER</h3>
                <div className="grid grid-cols-2 gap-8 mb-8">
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">HOME</p>
                      <div className="text-5xl font-black font-orbitron mb-4 text-white tabular-nums">{gameState.score.home}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateGame({ scoreHome: gameState.score.home + 6 })} className="bg-blue-600 text-[9px] py-2 rounded-lg font-black">+6 TD</button>
                        <button onClick={() => updateGame({ scoreHome: gameState.score.home + 3 })} className="bg-blue-800 text-[9px] py-2 rounded-lg font-black">+3 FG</button>
                        <button onClick={() => updateGame({ scoreHome: Math.max(0, gameState.score.home - 1) })} className="bg-slate-800 text-[9px] py-2 rounded-lg font-black">-1</button>
                        <button onClick={() => updateGame({ scoreHome: gameState.score.home + 1 })} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black">+1</button>
                      </div>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">AWAY</p>
                      <div className="text-5xl font-black font-orbitron mb-4 text-white tabular-nums">{gameState.score.away}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateGame({ scoreAway: gameState.score.away + 6 })} className="bg-red-600 text-[9px] py-2 rounded-lg font-black">+6 TD</button>
                        <button onClick={() => updateGame({ scoreAway: gameState.score.away + 3 })} className="bg-red-800 text-[9px] py-2 rounded-lg font-black">+3 FG</button>
                        <button onClick={() => updateGame({ scoreAway: Math.max(0, gameState.score.away - 1) })} className="bg-slate-800 text-[9px] py-2 rounded-lg font-black">-1</button>
                        <button onClick={() => updateGame({ scoreAway: gameState.score.away + 1 })} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black">+1</button>
                      </div>
                   </div>
                </div>
                {/* ... other controls ... */}
             </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe flex shrink-0 shadow-2xl">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rankings' },
            ...(isHost ? [{ id: 'command', icon: 'fa-user-shield', label: 'Console' }] : [])
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-all ${activeTab === tab.id ? 'text-blue-500 bg-blue-500/5' : 'text-slate-600'}`}>
              <i className={`fas ${tab.icon} text-lg ${activeTab === tab.id ? 'scale-110' : ''}`}></i>
              <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
      </nav>
    </div>
  );
};

const GuestLogin: React.FC<{ onLogin: (e: React.FormEvent, h: string, r: string, a: string) => void }> = ({ onLogin }) => {
  const [handle, setHandle] = useState('');
  const [real, setReal] = useState('');
  const [av, setAv] = useState(NFL_TEAMS[15].id);
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-2 h-32 overflow-y-auto no-scrollbar p-2 bg-black/30 rounded-2xl border border-white/5">
        {NFL_TEAMS.map(t => (
          <button type="button" key={t.id} onClick={() => setAv(t.id)} className={`flex flex-col items-center p-2 rounded-xl transition-all ${av === t.id ? 'bg-white/10 ring-2 ring-blue-500 scale-105' : 'opacity-40 hover:scale-105'}`}>
            <TeamHelmet teamId={t.id} size="sm" />
            <span className="text-[7px] font-black mt-1 text-slate-400">{t.id}</span>
          </button>
        ))}
      </div>
      <form onSubmit={e => onLogin(e, handle, real, av)} className="space-y-4 text-left">
        <input type="text" placeholder="Huddle Handle" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-500 text-sm" />
        <input type="text" placeholder="Real Name" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-500 text-sm" />
        <button type="submit" className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 border-b-4 border-slate-300">
          ENTER THE HUDDLE
        </button>
      </form>
      <div className="pt-4 border-t border-white/5">
         <button onClick={() => { 
           const pin = prompt("PIN:");
           if (pin === 'SB2026') { 
             try { localStorage.setItem(HOST_KEY, 'true'); window.location.reload(); } catch {}
           } 
         }} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white">Commissioner Access</button>
      </div>
    </div>
  );
};

export default App;
