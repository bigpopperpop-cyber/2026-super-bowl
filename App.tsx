
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

const STORAGE_KEY = 'sblix_profile_v3';

const generateId = () => Math.random().toString(36).substring(2, 11);

export default function App() {
  // Get room from URL or default
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
  const [isSynced, setIsSynced] = useState(false);
  const [isHost, setIsHost] = useState(() => localStorage.getItem('sblix_host') === 'true');

  // Shared Doc
  const doc = useMemo(() => new Y.Doc(), []);
  const sharedMessages = useMemo(() => doc.getArray<ChatMessage>('messages'), [doc]);
  const sharedGame = useMemo(() => doc.getMap('gameState'), [doc]);
  const sharedProps = useMemo(() => doc.getMap('props'), [doc]);
  const sharedUserBets = useMemo(() => doc.getArray<UserBet>('userBets'), [doc]);
  const sharedUsers = useMemo(() => doc.getMap('users'), [doc]);

  useEffect(() => {
    if (!user || !roomCode) return;

    const fullRoomName = `sblix-v4-${roomCode}`;
    
    // Providers
    const persistence = new IndexeddbPersistence(fullRoomName, doc);
    const webrtc = new WebrtcProvider(fullRoomName, doc, { 
      signaling: [
        'wss://signaling.yjs.dev', 
        'wss://y-webrtc-signaling-us.herokuapp.com',
        'wss://y-webrtc-signaling-eu.herokuapp.com'
      ] 
    });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', fullRoomName, doc);

    const sync = () => {
      setMessages(sharedMessages.toArray());
      setGameState(sharedGame.toJSON() as GameState);
      setAllBets(sharedUserBets.toArray());
      
      const pData = sharedProps.toJSON();
      setProps(prev => prev.map(p => pData[p.id] ? { ...p, ...pData[p.id] } : p));
      
      const uMap = sharedUsers.toJSON();
      const activeUsers = Object.values(uMap) as User[];
      setUsers(activeUsers.filter(u => Date.now() - u.lastSeen < 30000));
      
      setPeerCount(webrtc.room ? webrtc.room.webrtcConns.size : 0);
      setIsSynced(ws.wsconnected || webrtc.connected);
    };

    sharedMessages.observe(sync);
    sharedGame.observe(sync);
    sharedProps.observe(sync);
    sharedUserBets.observe(sync);
    sharedUsers.observe(sync);

    // Heartbeat & Initial Update
    const heartbeat = setInterval(() => {
      sharedUsers.set(user.id, { ...user, lastSeen: Date.now() });
      setPeerCount(webrtc.room ? webrtc.room.webrtcConns.size : 0);
    }, 5000);

    webrtc.on('status', sync);
    ws.on('status', sync);

    return () => {
      webrtc.destroy();
      ws.destroy();
      persistence.destroy();
      clearInterval(heartbeat);
    };
  }, [user, doc, roomCode]);

  const handleSendMessage = (text: string) => {
    if (!user) return;
    const msg: ChatMessage = { id: generateId(), userId: user.id, userName: user.handle, text, timestamp: Date.now() };
    sharedMessages.push([msg]);
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const context = `Score: Home ${gameState.scoreHome} - Away ${gameState.scoreAway}. Chat: ${messages.slice(-3).map(m => m.text).join(', ')}`;
    const res = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are Gerry the Gambler, a high-energy Super Bowl host. Context: ${context}. Give a 1-sentence wild commentary.`,
    });
    const text = res.text || "THE HUDDLE IS HEATED!";
    sharedMessages.push([{ id: generateId(), userId: 'AI', userName: 'GERRY', text, timestamp: Date.now(), isAI: true }]);
  };

  const copyInvite = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    alert("Invite link copied! Send it to your 20 guests.");
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
    <div className="flex flex-col h-screen bg-slate-950 max-w-lg mx-auto overflow-hidden border-x border-white/5">
      {/* HUD Header */}
      <header className="glass p-4 border-b border-white/10 shrink-0 z-50">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`} />
            <h1 className="font-orbitron font-black text-xl tracking-tighter text-sky-400">SBLIX</h1>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={copyInvite} className="text-[9px] font-black bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 uppercase transition-all">
                Invite
             </button>
             <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
               <i className="fas fa-users text-sky-500"></i> {peerCount + 1}
             </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center bg-black/40 rounded-xl p-3 border border-white/5 shadow-inner">
          <div className="text-center flex-1">
            <p className="text-[9px] font-bold text-slate-500 uppercase">HOME</p>
            <p className="text-3xl font-orbitron font-black leading-none">{gameState.scoreHome}</p>
          </div>
          <div className="px-4 text-center">
            <div className="text-[10px] font-black bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full mb-1">
              {gameState.quarter} · {gameState.time}
            </div>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">POSS: {gameState.possession}</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-[9px] font-bold text-slate-500 uppercase">AWAY</p>
            <p className="text-3xl font-orbitron font-black leading-none">{gameState.scoreAway}</p>
          </div>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && <ChatView messages={messages} user={user} onSend={handleSendMessage} />}
        {activeTab === 'bets' && <BetsView props={props} allBets={allBets} user={user} onBet={handlePlaceBet} />}
        {activeTab === 'leaderboard' && <LeaderboardView users={users} allBets={allBets} props={props} />}
        {activeTab === 'host' && (
          <HostConsole state={gameState} update={updateGame} props={props} settle={settleBet} ai={triggerAI} roomCode={roomCode} />
        )}
      </main>

      {/* Tab Nav */}
      <nav className="glass border-t border-white/10 flex pb-safe shrink-0">
        <NavBtn active={activeTab === 'chat'} icon="fa-comments" label="Chat" onClick={() => setActiveTab('chat')} />
        <NavBtn active={activeTab === 'bets'} icon="fa-ticket-alt" label="Props" onClick={() => setActiveTab('bets')} />
        <NavBtn active={activeTab === 'leaderboard'} icon="fa-trophy" label="Ranks" onClick={() => setActiveTab('leaderboard')} />
        {isHost && <NavBtn active={activeTab === 'host'} icon="fa-shield-halved" label="Admin" onClick={() => setActiveTab('host')} />}
      </nav>
    </div>
  );
}

function NavBtn({ active, icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${active ? 'text-sky-400' : 'text-slate-500'}`}>
      <i className={`fas ${icon} text-lg`}></i>
      <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function Login({ onEnter, initialRoom }: { onEnter: (u: User, r: string) => void, initialRoom: string }) {
  const [handle, setHandle] = useState('');
  const [room, setRoom] = useState(initialRoom || '');
  const [team, setTeam] = useState(NFL_TEAMS[0].id);
  
  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
      <div className="w-20 h-20 bg-sky-500 rounded-[1.5rem] flex items-center justify-center mb-4 shadow-2xl shadow-sky-500/20 rotate-3">
        <i className="fas fa-satellite-dish text-3xl text-white"></i>
      </div>
      <h1 className="text-4xl font-orbitron font-black mb-1 italic tracking-tighter">SBLIX</h1>
      <p className="text-slate-500 text-[10px] mb-8 uppercase font-black tracking-[0.3em]">Gridiron Mesh Network</p>
      
      <div className="w-full max-w-xs space-y-4">
        <div className="space-y-1 text-left">
          <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Party Code</label>
          <input 
            placeholder="E.G. HUDDLE59"
            className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white font-bold placeholder:text-slate-700 focus:border-sky-500 outline-none uppercase"
            value={room}
            onChange={e => setRoom(e.target.value)}
          />
        </div>
        <div className="space-y-1 text-left">
          <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Your Handle</label>
          <input 
            placeholder="CHAMP_77"
            className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white font-bold placeholder:text-slate-700 focus:border-sky-500 outline-none uppercase"
            value={handle}
            onChange={e => setHandle(e.target.value.toUpperCase().slice(0, 12))}
          />
        </div>
        
        <div className="space-y-1 text-left">
          <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Favorite Team</label>
          <div className="grid grid-cols-4 gap-2">
            {NFL_TEAMS.map(t => (
              <button 
                key={t.id}
                onClick={() => setTeam(t.id)}
                className={`p-2 rounded-xl border text-[10px] font-black transition-all ${team === t.id ? 'bg-white text-black border-white' : 'bg-slate-900 border-white/5 text-slate-600'}`}
              >
                {t.id}
              </button>
            ))}
          </div>
        </div>

        <button 
          disabled={!handle || !room}
          onClick={() => onEnter({ id: generateId(), handle, name: handle, team, credits: 1000, lastSeen: Date.now() }, room)}
          className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 disabled:opacity-30 transition-all mt-4 border-b-4 border-sky-800"
        >
          CONNECT TO HUB
        </button>

        <button 
          onClick={() => { const p = prompt("ADMIN PIN:"); if(p === 'SB59') { localStorage.setItem('sblix_host', 'true'); window.location.reload(); } }}
          className="text-[9px] font-black text-slate-800 uppercase pt-6 hover:text-slate-600 transition-colors"
        >
          Commissioner Login
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
          <div className="h-full flex flex-col items-center justify-center opacity-20">
             <i className="fas fa-comment-slash text-4xl mb-2"></i>
             <p className="text-[10px] font-black uppercase">No chatter yet...</p>
          </div>
        )}
        {messages.map((m: ChatMessage) => (
          <div key={m.id} className={`flex flex-col ${m.userId === user.id ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <span className="text-[8px] font-black text-slate-500 mb-1 uppercase px-1">{m.userName}</span>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-lg ${m.isAI ? 'bg-indigo-600 border border-indigo-400 font-bold italic text-white' : m.userId === user.id ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'}`}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); if(input.trim()){ onSend(input); setInput(''); }}} className="p-4 glass border-t border-white/10 flex gap-2">
        <input 
          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none placeholder:text-slate-700"
          placeholder="TYPE A MESSAGE..."
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center active:scale-95 transition-all shadow-lg">
          <i className="fas fa-paper-plane text-white"></i>
        </button>
      </form>
    </div>
  );
}

function BetsView({ props, allBets, user, onBet }: any) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 no-scrollbar pb-32">
      <div className="flex justify-between items-end mb-2">
        <h2 className="font-orbitron font-black text-xs uppercase text-slate-500 tracking-widest">Live Prop Pool</h2>
        <span className="text-[8px] font-black text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded uppercase">Verified Sync</span>
      </div>
      {props.map((p: PropBet) => {
        const myBet = allBets.find((b: any) => b.userId === user.id && b.betId === p.id);
        const stats = allBets.filter((b: any) => b.betId === p.id).length;
        return (
          <div key={p.id} className={`p-5 rounded-2xl border transition-all duration-300 ${p.resolved ? 'opacity-40 bg-slate-900 border-white/5' : myBet ? 'border-sky-500 bg-sky-500/5 shadow-[0_0_20px_rgba(14,165,233,0.05)]' : 'bg-slate-900 border-white/10'}`}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-black bg-slate-800 text-slate-400 px-2 py-0.5 rounded uppercase">{p.category}</span>
              <div className="flex items-center gap-1">
                 <i className="fas fa-user-friends text-[8px] text-slate-600"></i>
                 <span className="text-[9px] font-black text-slate-500 uppercase">{stats}</span>
              </div>
            </div>
            <p className="font-bold text-lg leading-tight mb-4 text-white">{p.question}</p>
            {p.resolved ? (
              <div className="text-sm font-black text-green-400 uppercase flex items-center gap-2">
                <i className="fas fa-check-circle"></i> WINNER: {p.winner}
              </div>
            ) : myBet ? (
              <div className="text-sm font-black text-sky-400 uppercase flex items-center gap-2 bg-sky-400/10 p-2 rounded-lg border border-sky-400/20">
                <i className="fas fa-lock"></i> LOCKED: {myBet.selection}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {p.options.map(opt => (
                  <button key={opt} onClick={() => onBet(p.id, opt)} className="w-full py-4 bg-slate-800 border border-white/5 rounded-xl text-xs font-black uppercase hover:bg-sky-600 hover:text-white transition-all active:scale-95 text-left px-4 flex justify-between items-center">
                    {opt}
                    <i className="fas fa-chevron-right opacity-20"></i>
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
      <h2 className="font-orbitron font-black text-xs uppercase text-slate-500 mb-2 tracking-widest">Huddle Rankings</h2>
      {standings.length === 0 && (
         <div className="py-20 text-center opacity-20">
            <i className="fas fa-trophy text-4xl mb-2"></i>
            <p className="text-[10px] font-black uppercase">Syncing player data...</p>
         </div>
      )}
      {standings.map((u: any, i: number) => (
        <div key={u.id} className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/5 shadow-sm">
          <span className={`w-8 font-orbitron font-black text-xl ${i === 0 ? 'text-yellow-500' : 'text-slate-700'}`}>#{i+1}</span>
          <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-white/10 flex items-center justify-center text-[10px] font-black shadow-inner">
             {u.team}
          </div>
          <div className="flex-1">
            <p className="font-black text-sm uppercase text-white tracking-tighter">{u.handle}</p>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">Current Score</p>
          </div>
          <div className="text-right">
            <p className={`text-xl font-orbitron font-black ${u.score > 0 ? 'text-green-500' : u.score < 0 ? 'text-red-500' : 'text-slate-500'}`}>
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
    <div className="h-full p-6 space-y-8 overflow-y-auto no-scrollbar pb-40 bg-slate-900/20">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-orbitron font-black text-sky-400 text-[10px] tracking-[0.3em] uppercase">Score Controller</h3>
          <span className="text-[8px] font-black text-slate-600 uppercase">Room: {roomCode}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3 bg-black/30 p-4 rounded-2xl border border-white/5">
            <p className="text-[10px] font-black text-slate-500 text-center uppercase tracking-widest">HOME</p>
            <div className="flex gap-2">
              <button onClick={() => update({ scoreHome: state.scoreHome + 3 })} className="flex-1 py-3 bg-slate-800 hover:bg-sky-600 rounded-xl text-[10px] font-black transition-all">+3</button>
              <button onClick={() => update({ scoreHome: state.scoreHome + 7 })} className="flex-1 py-3 bg-slate-800 hover:bg-sky-600 rounded-xl text-[10px] font-black transition-all">+7</button>
            </div>
            <button onClick={() => update({ scoreHome: Math.max(0, state.scoreHome - 1) })} className="w-full py-2 bg-slate-900 border border-white/5 rounded-lg text-[9px] font-black text-slate-600">-1 Adjust</button>
          </div>
          <div className="space-y-3 bg-black/30 p-4 rounded-2xl border border-white/5">
            <p className="text-[10px] font-black text-slate-500 text-center uppercase tracking-widest">AWAY</p>
            <div className="flex gap-2">
              <button onClick={() => update({ scoreAway: state.scoreAway + 3 })} className="flex-1 py-3 bg-slate-800 hover:bg-sky-600 rounded-xl text-[10px] font-black transition-all">+3</button>
              <button onClick={() => update({ scoreAway: state.scoreAway + 7 })} className="flex-1 py-3 bg-slate-800 hover:bg-sky-600 rounded-xl text-[10px] font-black transition-all">+7</button>
            </div>
            <button onClick={() => update({ scoreAway: Math.max(0, state.scoreAway - 1) })} className="w-full py-2 bg-slate-900 border border-white/5 rounded-lg text-[9px] font-black text-slate-600">-1 Adjust</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
             <label className="text-[8px] font-black text-slate-600 ml-2 uppercase">Game Clock</label>
             <input className="w-full bg-slate-900 border border-white/10 p-3 rounded-xl text-xs font-black text-white outline-none focus:border-sky-500" value={state.time} onChange={e => update({ time: e.target.value })} />
          </div>
          <div className="space-y-1">
             <label className="text-[8px] font-black text-slate-600 ml-2 uppercase">Quarter</label>
             <select className="w-full bg-slate-900 border border-white/10 p-3 rounded-xl text-xs font-black text-white outline-none appearance-none" value={state.quarter} onChange={e => update({ quarter: e.target.value })}>
                <option>1st</option><option>2nd</option><option>Half</option><option>3rd</option><option>4th</option><option>OT</option><option>Final</option>
             </select>
          </div>
        </div>
        <button onClick={ai} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-600/10 active:scale-95 transition-all border-b-4 border-indigo-800">
           Summon Gerry the Gambler
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="font-orbitron font-black text-red-500 text-[10px] tracking-[0.3em] uppercase">Settle Prop Bets</h3>
        <div className="space-y-3">
          {props.map((p: PropBet) => (
            <div key={p.id} className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-3">
              <p className="text-[11px] font-bold text-slate-300">{p.question}</p>
              {!p.resolved ? (
                <div className="flex gap-2">
                  {p.options.map(opt => (
                    <button key={opt} onClick={() => { if(confirm(`Settle '${p.question}' as '${opt}'?`)) settle(p.id, opt); }} className="flex-1 py-3 bg-green-600/20 text-green-400 border border-green-600/30 rounded-xl text-[9px] font-black uppercase hover:bg-green-600 hover:text-white transition-all">
                      {opt} Wins
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex justify-between items-center bg-slate-900 p-2 rounded-lg">
                   <span className="text-[9px] font-black text-slate-500 uppercase">Settled</span>
                   <span className="text-[9px] font-black text-green-500 uppercase">{p.winner}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-8 text-center">
         <button onClick={() => { localStorage.removeItem('sblix_host'); window.location.reload(); }} className="text-[9px] font-black text-red-500/50 uppercase hover:text-red-500">Log out Admin</button>
      </div>
    </div>
  );
}
