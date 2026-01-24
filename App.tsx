
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
// @ts-ignore
import { IndexeddbPersistence } from 'y-indexeddb';
import { User, ChatMessage, PropBet, UserBet, GameState } from './types';
import { NFL_TEAMS, INITIAL_PROPS } from './constants';
import { GoogleGenAI } from '@google/genai';

const STORAGE_KEY = 'sblix_profile_v4';

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

  const [activeTab, setActiveTab] = useState<'chat' | 'bets' | 'leaderboard' | 'host'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState>({ scoreHome: 0, scoreAway: 0, quarter: '1st', time: '15:00', possession: 'home' });
  const [props, setProps] = useState<PropBet[]>(INITIAL_PROPS);
  const [allBets, setAllBets] = useState<UserBet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [peerCount, setPeerCount] = useState(0);
  const [wsStatus, setWsStatus] = useState('connecting');
  const [isHost, setIsHost] = useState(() => localStorage.getItem('sblix_host') === 'true');

  // Shared Doc - Core Sync Data Structure
  const doc = useMemo(() => new Y.Doc(), []);
  const sharedMessages = useMemo(() => doc.getArray<ChatMessage>('messages'), [doc]);
  const sharedGame = useMemo(() => doc.getMap('gameState'), [doc]);
  const sharedProps = useMemo(() => doc.getMap('props'), [doc]);
  const sharedUserBets = useMemo(() => doc.getArray<UserBet>('userBets'), [doc]);
  const sharedUsers = useMemo(() => doc.getMap('users'), [doc]);

  useEffect(() => {
    if (!user || !roomCode) return;

    // Unique room name to avoid crosstalk with other parties
    const fullRoomName = `sblix-stadium-${roomCode.trim()}`;
    
    // 1. Persistence - survive page refreshes
    const persistence = new IndexeddbPersistence(fullRoomName, doc);
    
    // 2. WebRTC - Direct Device-to-Device Sync
    const webrtc = new WebrtcProvider(fullRoomName, doc, { 
      signaling: [
        'wss://signaling.yjs.dev', 
        'wss://y-webrtc-signaling-us.herokuapp.com',
        'wss://y-webrtc-signaling-eu.herokuapp.com'
      ] 
    });

    // 3. WebSocket - Cloud Backup Sync
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    const syncUI = () => {
      setMessages(sharedMessages.toArray());
      setGameState(sharedGame.toJSON() as GameState);
      setAllBets(sharedUserBets.toArray());
      
      const pData = sharedProps.toJSON();
      setProps(prev => prev.map(p => pData[p.id] ? { ...p, ...pData[p.id] } : p));
      
      const uMap = sharedUsers.toJSON();
      const now = Date.now();
      const active = Object.values(uMap) as User[];
      setUsers(active.filter(u => now - u.lastSeen < 60000));
      
      setPeerCount(webrtc.room ? webrtc.room.webrtcConns.size : 0);
      setWsStatus(ws.wsconnected ? 'online' : 'reconnecting');
    };

    // Watch for remote changes
    sharedMessages.observe(syncUI);
    sharedGame.observe(syncUI);
    sharedProps.observe(syncUI);
    sharedUserBets.observe(syncUI);
    sharedUsers.observe(syncUI);

    // Initial heartbeat
    const heartbeat = setInterval(() => {
      sharedUsers.set(user.id, { ...user, lastSeen: Date.now() });
      setPeerCount(webrtc.room ? webrtc.room.webrtcConns.size : 0);
    }, 10000);

    webrtc.on('status', syncUI);
    ws.on('status', syncUI);

    // Forced sync after 1s to catch up
    setTimeout(syncUI, 1000);

    return () => {
      webrtc.destroy();
      ws.destroy();
      persistence.destroy();
      clearInterval(heartbeat);
    };
  }, [user, doc, roomCode]);

  const handleSendMessage = (text: string) => {
    if (!user || !text.trim()) return;
    try {
      const msg: ChatMessage = { 
        id: generateId(), 
        userId: user.id, 
        userName: user.handle, 
        text: text.trim(), 
        timestamp: Date.now() 
      };
      sharedMessages.push([msg]);
    } catch (err) {
      console.error("Chat push failed:", err);
    }
  };

  const handlePlaceBet = (betId: string, selection: string) => {
    if (!user) return;
    const existing = allBets.find(b => b.userId === user.id && b.betId === betId);
    if (existing) return;
    const b: UserBet = { id: generateId(), userId: user.id, betId, selection, timestamp: Date.now() };
    sharedUserBets.push([b]);
  };

  const updateGame = (updates: Partial<GameState>) => {
    if (!isHost) return;
    Object.entries(updates).forEach(([k, v]) => sharedGame.set(k, v));
  };

  const settleBet = (betId: string, winner: string) => {
    if (!isHost) return;
    sharedProps.set(betId, { resolved: true, winner });
  };

  const triggerAI = async () => {
    if (!isHost) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const context = `Score: Home ${gameState.scoreHome} - Away ${gameState.scoreAway}. Chat: ${messages.slice(-3).map(m => m.text).join(', ')}`;
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are Gerry the Gambler, a wild high-stakes Super Bowl analyst. Score: ${context}. Give a snappy 1-sentence commentary on the huddle and game.`,
      });
      const text = res.text || "THE ACTION IS ELECTRIC!";
      sharedMessages.push([{ 
        id: generateId(), 
        userId: 'AI', 
        userName: 'GERRY THE GAMBLER', 
        text, 
        timestamp: Date.now(), 
        isAI: true 
      }]);
    } catch (error) {
      console.error("AI Fetch Failure:", error);
      // Fail silently to the user so the chat doesn't feel 'broken'
    }
  };

  const copyInvite = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("Huddle Invite Copied!");
    });
  };

  if (!user || !roomCode) {
    return (
      <Login 
        initialRoom={roomCode} 
        onEnter={(u, r) => { 
          setUser(u); 
          setRoomCode(r.toUpperCase());
          localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); 
          window.history.replaceState({}, '', `?room=${r.toUpperCase()}`);
        }} 
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 max-w-lg mx-auto overflow-hidden border-x border-white/5 shadow-2xl">
      {/* Header HUD */}
      <header className="glass p-4 border-b border-white/10 shrink-0 z-50">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
             <div className="relative flex items-center justify-center w-3 h-3">
                <div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${wsStatus === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className={`relative w-2 h-2 rounded-full ${wsStatus === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`} />
             </div>
             <h1 className="font-orbitron font-black text-2xl tracking-tighter text-sky-400 italic">SBLIX</h1>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={copyInvite} className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all">
                Invite Squad
             </button>
             <div className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 px-2 py-1 rounded-lg">
                <i className="fas fa-users text-sky-500 text-[10px]"></i>
                <span className="text-[10px] font-black text-sky-500">{users.length}</span>
             </div>
          </div>
        </div>
        
        <div className="bg-black/60 rounded-[1.25rem] p-4 border border-white/5 flex items-center justify-between shadow-inner">
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">HOME</p>
            <p className="text-4xl font-orbitron font-black leading-none">{gameState.scoreHome}</p>
          </div>
          <div className="text-center px-4 border-x border-white/5">
            <div className="bg-sky-500/20 text-sky-400 text-[11px] font-black px-3 py-1 rounded-full mb-1 inline-block">
              {gameState.quarter} · {gameState.time}
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">POSS: {gameState.possession}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">AWAY</p>
            <p className="text-4xl font-orbitron font-black leading-none">{gameState.scoreAway}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative bg-slate-950/50">
        {activeTab === 'chat' && <ChatView messages={messages} user={user} onSend={handleSendMessage} />}
        {activeTab === 'bets' && <BetsView props={props} allBets={allBets} user={user} onBet={handlePlaceBet} />}
        {activeTab === 'leaderboard' && <LeaderboardView users={users} allBets={allBets} props={props} />}
        {activeTab === 'host' && isHost && (
          <HostConsole state={gameState} update={updateGame} props={props} settle={settleBet} ai={triggerAI} roomCode={roomCode} />
        )}
      </main>

      {/* Navigation */}
      <nav className="glass border-t border-white/10 flex pb-safe shrink-0">
        <NavBtn active={activeTab === 'chat'} icon="fa-comments" label="Chat" onClick={() => setActiveTab('chat')} />
        <NavBtn active={activeTab === 'bets'} icon="fa-ticket-alt" label="Props" onClick={() => setActiveTab('bets')} />
        <NavBtn active={activeTab === 'leaderboard'} icon="fa-trophy" label="Standings" onClick={() => setActiveTab('leaderboard')} />
        {isHost && <NavBtn active={activeTab === 'host'} icon="fa-shield-halved" label="Command" onClick={() => setActiveTab('host')} />}
      </nav>
    </div>
  );
}

function NavBtn({ active, icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-all ${active ? 'text-sky-400 bg-sky-400/5' : 'text-slate-500'}`}>
      <i className={`fas ${icon} text-lg transition-transform ${active ? 'scale-110' : ''}`}></i>
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function Login({ onEnter, initialRoom }: { onEnter: (u: User, r: string) => void, initialRoom: string }) {
  const [handle, setHandle] = useState('');
  const [room, setRoom] = useState(initialRoom || '');
  const [team, setTeam] = useState('KC');
  
  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
      <div className="w-24 h-24 bg-sky-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-sky-500/30 rotate-3 border-4 border-sky-400/50">
        <i className="fas fa-football-ball text-4xl text-white"></i>
      </div>
      <h1 className="text-5xl font-orbitron font-black mb-1 italic tracking-tighter text-white">SBLIX</h1>
      <p className="text-sky-500 text-[11px] mb-12 uppercase font-black tracking-[0.4em]">Gridiron Synchronization</p>
      
      <div className="w-full max-w-xs space-y-5">
        <div className="space-y-2 text-left">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Huddle Code</label>
          <input 
            placeholder="PARTY59"
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl p-4 text-white font-bold placeholder:text-slate-800 focus:border-sky-500 outline-none uppercase transition-colors"
            value={room}
            onChange={e => setRoom(e.target.value)}
          />
        </div>
        <div className="space-y-2 text-left">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Your Handle</label>
          <input 
            placeholder="FAN_ONE"
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl p-4 text-white font-bold placeholder:text-slate-800 focus:border-sky-500 outline-none uppercase transition-colors"
            value={handle}
            onChange={e => setHandle(e.target.value.toUpperCase().slice(0, 15))}
          />
        </div>
        
        <div className="space-y-2 text-left">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Team Allegiance</label>
          <div className="grid grid-cols-4 gap-2">
            {['KC', 'PHI', 'SF', 'DET', 'DAL', 'BAL', 'BUF', 'CIN'].map(t => (
              <button 
                key={t}
                onClick={() => setTeam(t)}
                className={`p-2 rounded-xl border text-[10px] font-black transition-all ${team === t ? 'bg-sky-500 text-white border-sky-400 shadow-lg' : 'bg-slate-900/50 border-white/5 text-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button 
          disabled={!handle || !room}
          onClick={() => onEnter({ id: generateId(), handle, name: handle, team, credits: 1000, lastSeen: Date.now() }, room)}
          className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl active:scale-95 disabled:opacity-30 transition-all mt-6 border-b-4 border-sky-800"
        >
          Enter Huddle
        </button>

        <button 
          onClick={() => { const p = prompt("ACCESS CODE:"); if(p === 'SB59') { localStorage.setItem('sblix_host', 'true'); window.location.reload(); } }}
          className="text-[10px] font-black text-slate-800 uppercase pt-8 hover:text-slate-600 transition-colors tracking-widest"
        >
          Commish Login
        </button>
      </div>
    </div>
  );
}

function ChatView({ messages, user, onSend }: any) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  
  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-10">
             <i className="fas fa-comment-slash text-6xl mb-4"></i>
             <p className="text-[12px] font-black uppercase tracking-[0.2em]">Crickets in the Huddle...</p>
          </div>
        )}
        {messages.map((m: ChatMessage) => (
          <div key={m.id} className={`flex flex-col ${m.userId === user.id ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <span className="text-[9px] font-black text-slate-500 mb-1 uppercase px-1 tracking-widest">{m.userName}</span>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[14px] shadow-xl ${m.isAI ? 'bg-indigo-600/20 border border-indigo-500/50 text-indigo-100 font-bold italic' : m.userId === user.id ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'}`}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); if(input.trim()){ onSend(input); setInput(''); }}} className="p-4 glass border-t border-white/10 flex gap-2">
        <input 
          className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-sky-500 outline-none placeholder:text-slate-800 font-bold text-white transition-all"
          placeholder="SEND TO SQUAD..."
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit" className="w-14 h-14 bg-sky-500 rounded-2xl flex items-center justify-center active:scale-95 transition-all shadow-xl text-white">
          <i className="fas fa-paper-plane text-xl"></i>
        </button>
      </form>
    </div>
  );
}

function BetsView({ props, allBets, user, onBet }: any) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 no-scrollbar pb-32">
      <div className="flex justify-between items-center mb-2 px-1">
        <h2 className="font-orbitron font-black text-[11px] uppercase text-slate-500 tracking-[0.2em]">Prop Pool</h2>
        <span className="text-[9px] font-black text-sky-500 uppercase tracking-widest">Locked Sync</span>
      </div>
      {props.map((p: PropBet) => {
        const myBet = allBets.find((b: any) => b.userId === user.id && b.betId === p.id);
        const stats = allBets.filter((b: any) => b.betId === p.id).length;
        return (
          <div key={p.id} className={`p-6 rounded-[1.75rem] border transition-all duration-300 ${p.resolved ? 'opacity-40 bg-slate-900 border-white/5' : myBet ? 'border-sky-500 bg-sky-500/5 shadow-[0_0_30px_rgba(14,165,233,0.05)]' : 'bg-slate-900 border-white/10 shadow-lg'}`}>
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black bg-slate-800 text-slate-400 px-3 py-1 rounded-full uppercase tracking-widest">{p.category}</span>
              <div className="flex items-center gap-1.5 text-slate-500">
                 <i className="fas fa-user-check text-[10px]"></i>
                 <span className="text-[11px] font-black">{stats}</span>
              </div>
            </div>
            <p className="font-bold text-xl leading-snug mb-5 text-white">{p.question}</p>
            {p.resolved ? (
              <div className="text-sm font-black text-emerald-400 uppercase flex items-center gap-2 bg-emerald-400/10 p-3 rounded-xl border border-emerald-400/20">
                <i className="fas fa-check-circle"></i> WINNER: {p.winner}
              </div>
            ) : myBet ? (
              <div className="text-sm font-black text-sky-400 uppercase flex items-center gap-2 bg-sky-400/10 p-3 rounded-xl border border-sky-400/20">
                <i className="fas fa-lock"></i> PICK: {myBet.selection}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {p.options.map(opt => (
                  <button key={opt} onClick={() => onBet(p.id, opt)} className="w-full py-4 bg-slate-800 hover:bg-sky-600 hover:text-white border border-white/5 rounded-2xl text-[13px] font-black uppercase transition-all active:scale-95 text-left px-5 flex justify-between items-center shadow-md">
                    {opt}
                    <i className="fas fa-chevron-right opacity-30"></i>
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
  const standings = useMemo(() => {
    return users.map((u: User) => {
      let score = 0;
      const uBets = allBets.filter((b: UserBet) => b.userId === u.id);
      uBets.forEach((b: UserBet) => {
        const prop = props.find((p: PropBet) => p.id === b.betId);
        if (prop?.resolved) {
          if (prop.winner === b.selection) score += 100;
          else score -= 50;
        }
      });
      return { ...u, score };
    }).sort((a: any, b: any) => b.score - a.score);
  }, [users, allBets, props]);

  return (
    <div className="h-full p-4 space-y-4 overflow-y-auto no-scrollbar pb-32">
      <h2 className="font-orbitron font-black text-[11px] uppercase text-slate-500 mb-4 tracking-[0.2em] px-1">Standings</h2>
      {standings.length === 0 && (
         <div className="py-20 text-center opacity-10">
            <i className="fas fa-medal text-6xl mb-4"></i>
            <p className="text-[12px] font-black uppercase">Waiting for player data...</p>
         </div>
      )}
      {standings.map((u: any, i: number) => (
        <div key={u.id} className={`flex items-center gap-4 p-5 rounded-2xl border transition-all ${i === 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900 border-white/5'}`}>
          <span className={`w-8 font-orbitron font-black text-2xl ${i === 0 ? 'text-amber-500' : 'text-slate-700'}`}>#{i+1}</span>
          <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-white/10 flex items-center justify-center text-[10px] font-black shadow-inner">
             {u.team}
          </div>
          <div className="flex-1">
            <p className="font-black text-sm uppercase text-white tracking-tight">{u.handle}</p>
            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Points earned</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-orbitron font-black ${u.score > 0 ? 'text-emerald-500' : u.score < 0 ? 'text-rose-500' : 'text-slate-600'}`}>
              {u.score > 0 ? `+${u.score}` : u.score}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HostConsole({ state, update, props, settle, ai, roomCode }: any) {
  return (
    <div className="h-full p-6 space-y-10 overflow-y-auto no-scrollbar pb-40">
      <div className="space-y-5">
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <h3 className="font-orbitron font-black text-sky-400 text-[12px] tracking-widest uppercase italic">Game Master</h3>
          <span className="text-[10px] font-black text-slate-700 uppercase">Huddle: {roomCode}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-500 text-center uppercase tracking-widest">HOME SCORE</p>
            <div className="flex gap-2">
              <button onClick={() => update({ scoreHome: state.scoreHome + 3 })} className="flex-1 py-4 bg-slate-800 hover:bg-sky-600 rounded-2xl text-[11px] font-black transition-all">+3</button>
              <button onClick={() => update({ scoreHome: state.scoreHome + 7 })} className="flex-1 py-4 bg-slate-800 hover:bg-sky-600 rounded-2xl text-[11px] font-black transition-all">+7</button>
            </div>
            <button onClick={() => update({ scoreHome: Math.max(0, state.scoreHome - 1) })} className="w-full py-2 bg-slate-900/50 border border-white/5 rounded-xl text-[10px] font-black text-slate-600">-1 Adjust</button>
          </div>
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-500 text-center uppercase tracking-widest">AWAY SCORE</p>
            <div className="flex gap-2">
              <button onClick={() => update({ scoreAway: state.scoreAway + 3 })} className="flex-1 py-4 bg-slate-800 hover:bg-sky-600 rounded-2xl text-[11px] font-black transition-all">+3</button>
              <button onClick={() => update({ scoreAway: state.scoreAway + 7 })} className="flex-1 py-4 bg-slate-800 hover:bg-sky-600 rounded-2xl text-[11px] font-black transition-all">+7</button>
            </div>
            <button onClick={() => update({ scoreAway: Math.max(0, state.scoreAway - 1) })} className="w-full py-2 bg-slate-900/50 border border-white/5 rounded-xl text-[10px] font-black text-slate-600">-1 Adjust</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-600 ml-2 uppercase">Time Remaining</label>
             <input className="w-full bg-slate-900 border border-white/10 p-4 rounded-2xl text-sm font-black text-white focus:border-sky-500 outline-none" value={state.time} onChange={e => update({ time: e.target.value })} />
          </div>
          <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-600 ml-2 uppercase">Current Quarter</label>
             <select className="w-full bg-slate-900 border border-white/10 p-4 rounded-2xl text-sm font-black text-white focus:border-sky-500 outline-none" value={state.quarter} onChange={e => update({ quarter: e.target.value })}>
                <option>1st</option><option>2nd</option><option>Half</option><option>3rd</option><option>4th</option><option>Final</option>
             </select>
          </div>
        </div>

        <button onClick={ai} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl transition-all border-b-4 border-indigo-800 active:scale-95 active:border-b-0 active:mt-1">
           <i className="fas fa-bolt mr-2"></i> Summon AI Commentary
        </button>
      </div>

      <div className="space-y-5">
        <h3 className="font-orbitron font-black text-rose-500 text-[12px] tracking-widest uppercase">Settle Props</h3>
        <div className="space-y-4">
          {props.map((p: PropBet) => (
            <div key={p.id} className="p-5 bg-slate-950 rounded-2xl border border-white/5 space-y-4 shadow-xl">
              <p className="text-[13px] font-bold text-slate-300 leading-tight">{p.question}</p>
              {!p.resolved ? (
                <div className="flex gap-2">
                  {p.options.map(opt => (
                    <button key={opt} onClick={() => { if(confirm(`Settle '${opt}' for this prop?`)) settle(p.id, opt); }} className="flex-1 py-4 bg-emerald-600/10 text-emerald-400 border border-emerald-600/30 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all">
                      {opt} Wins
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex justify-between items-center bg-slate-900 px-4 py-3 rounded-xl border border-white/5">
                   <span className="text-[10px] font-black text-slate-600 uppercase">Settled</span>
                   <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">{p.winner}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-10 text-center">
         <button onClick={() => { if(confirm("Log out of Commissioner access?")) { localStorage.removeItem('sblix_host'); window.location.reload(); } }} className="text-[10px] font-black text-rose-500/50 uppercase tracking-widest hover:text-rose-500 transition-colors">Terminate Commish Access</button>
      </div>
    </div>
  );
}
