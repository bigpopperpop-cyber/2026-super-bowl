
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
import { User, ChatMessage, PropBet, UserBet, GameState } from './types';
import { NFL_TEAMS, INITIAL_PROPS } from './constants';
import { GoogleGenAI } from '@google/genai';

const STORAGE_KEY = 'sblix_profile_v3';
const ROOM_NAME = 'sblix-party-lix';

const generateId = () => Math.random().toString(36).substring(2, 11);

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<'chat' | 'bets' | 'leaderboard' | 'host'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState>({ scoreHome: 0, scoreAway: 0, quarter: '1st', time: '15:00', possession: 'home' });
  const [props, setProps] = useState<PropBet[]>(INITIAL_PROPS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [connected, setConnected] = useState(false);
  const [isHost, setIsHost] = useState(() => localStorage.getItem('sblix_host') === 'true');

  // YJS Setup
  const doc = useMemo(() => new Y.Doc(), []);
  const sharedMessages = useMemo(() => doc.getArray<ChatMessage>('messages'), [doc]);
  const sharedGame = useMemo(() => doc.getMap('gameState'), [doc]);
  const sharedProps = useMemo(() => doc.getMap('props'), [doc]);
  const sharedUserBets = useMemo(() => doc.getArray<UserBet>('userBets'), [doc]);
  const sharedUsers = useMemo(() => doc.getMap('users'), [doc]);

  useEffect(() => {
    if (!user) return;

    const webrtc = new WebrtcProvider(ROOM_NAME, doc, { signaling: ['wss://signaling.yjs.dev'] });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', ROOM_NAME, doc);

    const sync = () => {
      setMessages(sharedMessages.toArray());
      setGameState(sharedGame.toJSON() as GameState);
      setAllBets(sharedUserBets.toArray());
      
      const pData = sharedProps.toJSON();
      setProps(prev => prev.map(p => pData[p.id] ? { ...p, ...pData[p.id] } : p));
      
      const uMap = sharedUsers.toJSON();
      setUsers(Object.values(uMap) as User[]);
      setConnected(ws.wsconnected || webrtc.connected);
    };

    sharedMessages.observe(sync);
    sharedGame.observe(sync);
    sharedProps.observe(sync);
    sharedUserBets.observe(sync);
    sharedUsers.observe(sync);

    const heartbeat = setInterval(() => {
      sharedUsers.set(user.id, { ...user, lastSeen: Date.now() });
    }, 10000);

    return () => {
      webrtc.destroy();
      ws.destroy();
      clearInterval(heartbeat);
    };
  }, [user, doc]);

  const [allBets, setAllBets] = useState<UserBet[]>([]);

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

  if (!user) return <Login onEnter={(u) => { setUser(u); localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); }} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 max-w-lg mx-auto overflow-hidden">
      {/* HUD Header */}
      <header className="glass p-4 border-b border-white/10 shrink-0">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
            <h1 className="font-orbitron font-black text-xl tracking-tighter text-sky-400">SBLIX</h1>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {connected ? 'LIVE HUDDLE' : 'CONNECTING...'}
          </div>
        </div>
        
        <div className="flex justify-between items-center bg-black/40 rounded-xl p-3 border border-white/5">
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
          <HostConsole state={gameState} update={updateGame} props={props} settle={settleBet} ai={triggerAI} />
        )}
      </main>

      {/* Tab Nav */}
      <nav className="glass border-t border-white/10 flex pb-safe">
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

function Login({ onEnter }: { onEnter: (u: User) => void }) {
  const [handle, setHandle] = useState('');
  const [team, setTeam] = useState(NFL_TEAMS[0].id);
  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-24 h-24 bg-sky-500 rounded-[2rem] flex items-center justify-center mb-6 shadow-2xl shadow-sky-500/20">
        <i className="fas fa-football-ball text-4xl text-white"></i>
      </div>
      <h1 className="text-4xl font-orbitron font-black mb-2 italic">SBLIX</h1>
      <p className="text-slate-500 text-sm mb-12 uppercase font-black tracking-widest">LIX Party Hub Access</p>
      
      <div className="w-full max-w-xs space-y-4">
        <input 
          placeholder="HUDDLE HANDLE"
          className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white font-bold placeholder:text-slate-600 focus:border-sky-500 outline-none"
          value={handle}
          onChange={e => setHandle(e.target.value.toUpperCase().slice(0, 12))}
        />
        <div className="grid grid-cols-4 gap-2">
          {NFL_TEAMS.map(t => (
            <button 
              key={t.id}
              onClick={() => setTeam(t.id)}
              className={`p-2 rounded-xl border text-[10px] font-black transition-all ${team === t.id ? 'bg-white text-black border-white' : 'bg-slate-900 border-white/5 text-slate-500'}`}
            >
              {t.id}
            </button>
          ))}
        </div>
        <button 
          disabled={!handle}
          onClick={() => onEnter({ id: generateId(), handle, name: handle, team, credits: 1000, lastSeen: Date.now() })}
          className="w-full py-5 bg-sky-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 disabled:opacity-50"
        >
          JOIN HUDDLE
        </button>
        <button 
          onClick={() => { const p = prompt("CODE:"); if(p === 'SB59') { localStorage.setItem('sblix_host', 'true'); window.location.reload(); } }}
          className="text-[9px] font-black text-slate-700 uppercase pt-4"
        >
          HOST OVERRIDE
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
        {messages.map((m: ChatMessage) => (
          <div key={m.id} className={`flex flex-col ${m.userId === user.id ? 'items-end' : 'items-start'}`}>
            <span className="text-[8px] font-black text-slate-500 mb-1 uppercase px-1">{m.userName}</span>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${m.isAI ? 'bg-indigo-600 border border-indigo-400 font-bold italic' : m.userId === user.id ? 'bg-sky-600 rounded-tr-none' : 'bg-slate-800 rounded-tl-none border border-white/5'}`}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); if(input.trim()){ onSend(input); setInput(''); }}} className="p-4 glass border-t border-white/10 flex gap-2">
        <input 
          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none"
          placeholder="CHIRP TO HUDDLE..."
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center active:scale-95 transition-all">
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
}

function BetsView({ props, allBets, user, onBet }: any) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 no-scrollbar pb-24">
      <h2 className="font-orbitron font-black text-sm uppercase text-slate-400 mb-2">LIVE PROPS</h2>
      {props.map((p: PropBet) => {
        const myBet = allBets.find((b: any) => b.userId === user.id && b.betId === p.id);
        const stats = allBets.filter((b: any) => b.betId === p.id).length;
        return (
          <div key={p.id} className={`p-5 rounded-2xl border transition-all ${p.resolved ? 'opacity-40 bg-slate-900 border-white/5' : myBet ? 'border-sky-500 bg-sky-500/5' : 'bg-slate-900 border-white/10'}`}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-black bg-slate-800 text-slate-500 px-2 py-0.5 rounded uppercase">{p.category}</span>
              <span className="text-[9px] font-black text-slate-500 uppercase">{stats} PICKS</span>
            </div>
            <p className="font-bold text-lg leading-tight mb-4">{p.question}</p>
            {p.resolved ? (
              <div className="text-sm font-black text-green-400 uppercase">WINNER: {p.winner}</div>
            ) : myBet ? (
              <div className="text-sm font-black text-sky-400 uppercase flex items-center gap-2">
                <i className="fas fa-lock"></i> LOCKED: {myBet.selection}
              </div>
            ) : (
              <div className="flex gap-2">
                {p.options.map(opt => (
                  <button key={opt} onClick={() => onBet(p.id, opt)} className="flex-1 py-3 bg-slate-800 border border-white/5 rounded-xl text-xs font-black uppercase hover:bg-sky-500 transition-all active:scale-95">
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
    <div className="h-full p-4 space-y-4 overflow-y-auto no-scrollbar">
      <h2 className="font-orbitron font-black text-sm uppercase text-slate-400 mb-2">HUDDLE RANKINGS</h2>
      {standings.map((u: any, i: number) => (
        <div key={u.id} className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/5">
          <span className="w-8 font-orbitron font-black text-xl text-slate-700">#{i+1}</span>
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-black">{u.team}</div>
          <div className="flex-1">
            <p className="font-black text-sm uppercase">{u.handle}</p>
            <p className="text-[10px] text-slate-500 font-bold">GRID SCORE</p>
          </div>
          <div className="text-right">
            <p className={`text-xl font-orbitron font-black ${u.score >= 0 ? 'text-green-500' : 'text-red-500'}`}>{u.score}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HostConsole({ state, update, props, settle, ai }: any) {
  return (
    <div className="h-full p-6 space-y-8 overflow-y-auto no-scrollbar pb-32">
      <div className="space-y-4">
        <h3 className="font-orbitron font-black text-sky-400 text-xs tracking-widest uppercase">Score Master</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-500 text-center">HOME</p>
            <div className="flex gap-2">
              <button onClick={() => update({ scoreHome: state.scoreHome + 3 })} className="flex-1 py-2 bg-slate-800 rounded-lg text-[10px] font-black">+3</button>
              <button onClick={() => update({ scoreHome: state.scoreHome + 7 })} className="flex-1 py-2 bg-slate-800 rounded-lg text-[10px] font-black">+7</button>
              <button onClick={() => update({ scoreHome: Math.max(0, state.scoreHome - 1) })} className="flex-1 py-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] font-black">-1</button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-500 text-center">AWAY</p>
            <div className="flex gap-2">
              <button onClick={() => update({ scoreAway: state.scoreAway + 3 })} className="flex-1 py-2 bg-slate-800 rounded-lg text-[10px] font-black">+3</button>
              <button onClick={() => update({ scoreAway: state.scoreAway + 7 })} className="flex-1 py-2 bg-slate-800 rounded-lg text-[10px] font-black">+7</button>
              <button onClick={() => update({ scoreAway: Math.max(0, state.scoreAway - 1) })} className="flex-1 py-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] font-black">-1</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input className="bg-slate-900 border border-white/5 p-3 rounded-xl text-xs font-black uppercase" value={state.time} onChange={e => update({ time: e.target.value })} />
          <select className="bg-slate-900 border border-white/5 p-3 rounded-xl text-xs font-black uppercase" value={state.quarter} onChange={e => update({ quarter: e.target.value })}>
            <option>1st</option><option>2nd</option><option>Halftime</option><option>3rd</option><option>4th</option><option>Final</option>
          </select>
        </div>
        <button onClick={ai} className="w-full py-4 bg-indigo-600 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95">Summon Gerry (AI)</button>
      </div>

      <div className="space-y-4">
        <h3 className="font-orbitron font-black text-red-500 text-xs tracking-widest uppercase">Settle Props</h3>
        {props.map((p: PropBet) => (
          <div key={p.id} className="p-4 bg-slate-900 rounded-2xl border border-white/5 space-y-3">
            <p className="text-xs font-bold">{p.question}</p>
            {!p.resolved ? (
              <div className="flex gap-2">
                {p.options.map(opt => (
                  <button key={opt} onClick={() => settle(p.id, opt)} className="flex-1 py-2 bg-green-600 rounded-lg text-[10px] font-black uppercase">Win: {opt}</button>
                ))}
              </div>
            ) : (
              <div className="text-[10px] font-black text-slate-500 uppercase">Settled: {p.winner}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
