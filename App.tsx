
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, NFL_TEAMS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';
import TeamHelmet from './components/TeamHelmet';

type AppMode = 'LANDING' | 'GAME';
type TabType = 'chat' | 'bets' | 'leaderboard' | 'command';

const generateId = () => Math.random().toString(36).substring(2, 9);

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(() => localStorage.getItem('sblix_user_v22') ? 'GAME' : 'LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_user_v22');
    return saved ? JSON.parse(saved) : null;
  });

  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [connectedPeers, setConnectedPeers] = useState(0);

  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isHost, setIsHost] = useState(localStorage.getItem('sblix_host_v22') === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');

  const partyCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || 'SBLIX').toUpperCase();
  }, []);

  // Y.js Shared Document Setup
  const { doc, sharedGame, sharedMessages, sharedProps, sharedUsers } = useMemo(() => {
    const d = new Y.Doc();
    return {
      doc: d,
      sharedGame: d.getMap('gameState'),
      sharedMessages: d.getArray('messages'),
      sharedProps: d.getMap('props'),
      sharedUsers: d.getMap('users')
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    // Fixed: Using imported WebrtcProvider
    const provider = new WebrtcProvider(`sblix-party-${partyCode}-v22`, doc, {
      signaling: [
        'wss://signaling.yjs.dev', 
        'wss://y-webrtc-signaling-eu.herokuapp.com', 
        'wss://y-webrtc-signaling-us.herokuapp.com'
      ]
    });

    provider.on('status', () => {
      setConnectedPeers(provider.room.webrtcConns.size + 1);
    });

    // Sync Game State
    const updateLocalGame = () => {
      const data = sharedGame.toJSON();
      if (Object.keys(data).length > 0) {
        setGameState({
          quarter: data.quarter ?? 1,
          timeRemaining: data.timeRemaining ?? "15:00",
          score: { home: data.scoreHome ?? 0, away: data.scoreAway ?? 0 },
          possession: data.possession ?? 'home'
        });
      }
    };
    sharedGame.observe(updateLocalGame);
    updateLocalGame();

    // Sync Messages
    const updateLocalMessages = () => {
      setMessages(sharedMessages.toArray().slice(-50));
    };
    sharedMessages.observe(updateLocalMessages);
    updateLocalMessages();

    // Sync User Roster (Awareness/Heartbeat)
    const updateLocalUsers = () => {
      const userMap = sharedUsers.toJSON();
      const now = Date.now();
      const activeUsers = Object.values(userMap)
        .filter((u: any) => now - u.lastPing < 60000) as User[];
      setUsers(activeUsers);
    };
    sharedUsers.observe(updateLocalUsers);
    
    // Initial User Registration
    sharedUsers.set(currentUser.id, { ...currentUser, lastPing: Date.now() });

    // Sync Props
    const updateLocalProps = () => {
      const pMap = sharedProps.toJSON();
      setPropBets(prev => prev.map(p => pMap[p.id] ? { ...p, ...pMap[p.id] } : p));
    };
    sharedProps.observe(updateLocalProps);

    const heartbeat = setInterval(() => {
      sharedUsers.set(currentUser.id, { ...currentUser, lastPing: Date.now() });
      setConnectedPeers(provider.room.webrtcConns.size + 1);
    }, 5000);

    return () => {
      provider.destroy();
      clearInterval(heartbeat);
    };
  }, [currentUser, doc, partyCode, sharedGame, sharedMessages, sharedUsers, sharedProps]);

  const onSendMessage = (text: string) => {
    if (!currentUser) return;
    const msg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
    sharedMessages.push([msg]);
  };

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
    } finally { setIsAiLoading(false); }
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl border-white/20">
          <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-3 border-4 border-blue-600">
            <i className="fas fa-satellite-dish text-blue-600 text-4xl animate-pulse"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 tracking-tighter">SBLIX HYPER-MESH</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">REAL-TIME PARTY SYNC</p>
          <GuestLogin onLogin={(e, h, r, t) => {
            e.preventDefault();
            const newUser = { id: generateId(), username: h, realName: r, avatar: t, credits: 0 };
            setCurrentUser(newUser);
            localStorage.setItem('sblix_user_v22', JSON.stringify(newUser));
            setMode('GAME');
          }} isHost={isHost} />
          {!isHost && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <form onSubmit={e => {
                e.preventDefault();
                if (hostKeyInput === 'SB2026') { setIsHost(true); localStorage.setItem('sblix_host_v22', 'true'); setHostKeyInput(''); }
              }} className="flex gap-2">
                <input type="password" placeholder="COMMISH PIN" value={hostKeyInput} onChange={e => setHostKeyInput(e.target.value)} className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none text-white focus:border-blue-500" />
                <button type="submit" className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase">Auth</button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      <header className="bg-slate-900 border-b border-slate-800 p-3 shrink-0 z-40">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black font-orbitron text-blue-500">SBLIX</h1>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px]">
              <span className="font-orbitron font-black text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              <i className={`fas fa-football-ball text-[7px] ${gameState.possession === 'home' ? 'text-blue-400' : 'text-red-400'}`}></i>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[7px] font-black text-slate-500 uppercase tracking-tighter text-right leading-tight">
                {connectedPeers} PEERS ACTIVE<br/>
                <span className="text-blue-400">HYPER-MESH SECURE</span>
             </div>
             <TeamHelmet teamId={currentUser.avatar} size="md" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatRoom user={currentUser} messages={messages} users={users} onSendMessage={onSendMessage} />}
        {activeTab === 'bets' && <BettingPanel propBets={propBets} user={currentUser} allBets={userBets} onPlaceBet={(bid, amt, sel) => {
              setUserBets(p => [...p, { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() }]);
            }} />}
        {activeTab === 'leaderboard' && (
          <div className="h-full flex flex-col overflow-hidden">
            <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
            {!isHost && (
              <div className="px-4 py-2 border-t border-white/5 bg-slate-900">
                 <button onClick={() => { if (prompt("PIN:") === 'SB2026') { setIsHost(true); localStorage.setItem('sblix_host_v22', 'true'); } }} className="w-full py-2 bg-slate-800 text-slate-500 rounded-xl text-[9px] font-black uppercase">Host Login</button>
              </div>
            )}
          </div>
        )}
        {activeTab === 'command' && isHost && (
          <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
             {/* COMMAND HEADER */}
             <div className="flex items-center justify-between mb-2">
                <div>
                   <h2 className="text-sm font-black font-orbitron text-white">COMMISSIONER HUB</h2>
                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">MESH KEY: {partyCode}</p>
                </div>
                <div className="flex items-center gap-2">
                   <div className="flex items-center gap-1.5 bg-blue-600/10 px-2 py-1 rounded-full border border-blue-600/20 animate-pulse-blue">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      <span className="text-[7px] text-blue-400 font-black uppercase tracking-tighter">Broadcasting Live</span>
                   </div>
                </div>
             </div>

             {/* AI TRIGGER */}
             <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-[2rem] p-6 shadow-2xl">
                <button onClick={onTriggerAiCommentary} disabled={isAiLoading} className={`w-full py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-all ${isAiLoading ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 border-b-4 border-indigo-800 active:scale-95'}`}>
                  {isAiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                  {isAiLoading ? 'SYNCING GERRY...' : 'SUMMON GERRY THE GAMBLER'}
                </button>
             </div>

             {/* LIVE SCOREBOARD CONSOLE */}
             <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 shadow-2xl">
                <h3 className="text-center text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-8">SCOREBOARD CONTROL</h3>
                <div className="grid grid-cols-2 gap-8 mb-8">
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">HOME</p>
                      <div className="text-5xl font-black font-orbitron mb-4 text-white">{gameState.score.home}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateGame({ scoreHome: gameState.score.home + 6 })} className="bg-blue-600 text-[9px] py-2 rounded-lg font-black">+6 TD</button>
                        <button onClick={() => updateGame({ scoreHome: gameState.score.home + 3 })} className="bg-blue-800 text-[9px] py-2 rounded-lg font-black">+3 FG</button>
                        <button onClick={() => updateGame({ scoreHome: Math.max(0, gameState.score.home - 1) })} className="bg-slate-800 text-[9px] py-2 rounded-lg font-black">-1</button>
                        <button onClick={() => updateGame({ scoreHome: gameState.score.home + 1 })} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black">+1</button>
                      </div>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">AWAY</p>
                      <div className="text-5xl font-black font-orbitron mb-4 text-white">{gameState.score.away}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateGame({ scoreAway: gameState.score.away + 6 })} className="bg-red-600 text-[9px] py-2 rounded-lg font-black">+6 TD</button>
                        <button onClick={() => updateGame({ scoreAway: gameState.score.away + 3 })} className="bg-red-800 text-[9px] py-2 rounded-lg font-black">+3 FG</button>
                        <button onClick={() => updateGame({ scoreAway: Math.max(0, gameState.score.away - 1) })} className="bg-slate-800 text-[9px] py-2 rounded-lg font-black">-1</button>
                        <button onClick={() => updateGame({ scoreAway: gameState.score.away + 1 })} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black">+1</button>
                      </div>
                   </div>
                </div>

                <div className="border-t border-slate-800 pt-6 space-y-6">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quarter</span>
                      <div className="flex gap-1">
                         {[1, 2, 3, 4, 'OT'].map(q => (
                           <button key={q} onClick={() => updateGame({ quarter: typeof q === 'string' ? 5 : q })} 
                             className={`w-9 h-9 rounded-xl text-[10px] font-black ${gameState.quarter === (q === 'OT' ? 5 : q) ? 'bg-white text-black scale-110 shadow-xl' : 'bg-slate-800 text-slate-500'}`}>{q}</button>
                         ))}
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ball</span>
                      <div className="flex bg-slate-950 rounded-xl p-1 border border-slate-800">
                         <button onClick={() => updateGame({ possession: 'home' })} className={`px-5 py-2 rounded-lg text-[10px] font-black ${gameState.possession === 'home' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>HOME</button>
                         <button onClick={() => updateGame({ possession: 'away' })} className={`px-5 py-2 rounded-lg text-[10px] font-black ${gameState.possession === 'away' ? 'bg-red-600 text-white' : 'text-slate-600'}`}>AWAY</button>
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Clock</span>
                      <input type="text" value={gameState.timeRemaining} onChange={e => updateGame({ timeRemaining: e.target.value })} className="bg-black border border-slate-700 rounded-xl px-4 py-2 text-sm font-black text-center w-24 text-blue-400 outline-none" />
                   </div>
                </div>
             </div>

             {/* PROP SETTLEMENT */}
             <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">SETTLE LIVE PROPS</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className={`p-5 bg-slate-900 border rounded-2xl ${bet.resolved ? 'opacity-40 border-slate-800' : 'border-slate-700 shadow-xl'}`}>
                    <p className="text-xs font-black text-slate-200 mb-4">{bet.question}</p>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button key={opt} onClick={() => sharedProps.set(bet.id, { resolved: true, outcome: opt })} 
                          className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase transition-all ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{opt}</button>
                      ))}
                    </div>
                  </div>
                ))}
             </div>

             {/* RECRUIT GUESTS / QR CODE */}
             <div className="glass-card p-8 rounded-[3rem] text-center border-white/10 shadow-2xl">
                <h2 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-6">RECRUIT THE SQUAD</h2>
                <div className="bg-white p-4 rounded-3xl w-fit mx-auto shadow-2xl mb-6 transform hover:scale-105 transition-transform">
                   <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?room=' + partyCode)}`} 
                    alt="Invite QR Code" 
                    className="w-44 h-44"
                   />
                </div>
                <div className="space-y-3">
                   <button 
                    onClick={() => { 
                      const link = window.location.origin + window.location.pathname + '?room=' + partyCode;
                      navigator.clipboard.writeText(link); 
                      alert("Link Copied!"); 
                    }} 
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 border-b-4 border-blue-800"
                   >
                    COPY INVITE LINK
                   </button>
                   <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest">AUTO-JOIN CODE: {partyCode}</p>
                </div>
             </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe flex shrink-0 shadow-2xl">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rankings' },
            ...(isHost ? [{ id: 'command', icon: 'fa-user-shield', label: 'Commish' }] : [])
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-5 flex flex-col items-center gap-1.5 transition-all ${activeTab === tab.id ? 'text-blue-500 bg-blue-500/5' : 'text-slate-600'}`}>
              <i className={`fas ${tab.icon} text-xl ${activeTab === tab.id ? 'animate-pulse' : ''}`}></i>
              <span className="text-[9px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
      </nav>
    </div>
  );
};

const GuestLogin: React.FC<{ onLogin: (e: React.FormEvent, h: string, r: string, a: string) => void, isHost: boolean }> = ({ onLogin, isHost }) => {
  const [handle, setHandle] = useState('');
  const [real, setReal] = useState('');
  const [av, setAv] = useState(NFL_TEAMS[0].id);
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-2 h-40 overflow-y-auto no-scrollbar p-2 bg-black/30 rounded-2xl border border-white/5">
        {NFL_TEAMS.map(t => (
          <button type="button" key={t.id} onClick={() => setAv(t.id)} className={`flex flex-col items-center p-2 rounded-xl transition-all ${av === t.id ? 'bg-white/10 ring-2 ring-blue-500 scale-105' : 'opacity-40 hover:scale-105'}`}>
            <TeamHelmet teamId={t.id} size="sm" />
            <span className="text-[8px] font-black mt-1 text-slate-400">{t.id}</span>
          </button>
        ))}
      </div>
      <div className="space-y-4 text-left">
        <input type="text" placeholder="Huddle Handle" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-500 text-sm" />
        <input type="text" placeholder="Full Name" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 border-b-4 border-slate-300">
          {isHost ? 'LAUNCH COMMISSIONER WAR ROOM' : 'JOIN THE HUDDLE'}
        </button>
      </div>
    </div>
  );
};

export default App;
