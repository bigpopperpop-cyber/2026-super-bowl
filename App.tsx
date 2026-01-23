
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, NFL_TEAMS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';
import TeamHelmet from './components/TeamHelmet';

type AppMode = 'LANDING' | 'GAME';
type TabType = 'chat' | 'bets' | 'halftime' | 'leaderboard' | 'command';

const generateId = () => Math.random().toString(36).substring(2, 9);

// HYPER-PULSE CONFIG (FLAT KEY SYNC)
const SYNC_VERSION = "hp_v20_final";
const API_BASE = "https://api.keyvalue.xyz";

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(() => {
    return localStorage.getItem('sblix_user_v20') ? 'GAME' : 'LANDING';
  });
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_user_v20');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'connected'>('idle');
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const [partyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || 'SBLIX').toUpperCase();
  });

  const [isHost, setIsHost] = useState(localStorage.getItem('sblix_host_v20') === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });

  const roomSyncKey = `SBLIX_${SYNC_VERSION}_${partyCode}`;
  const outbox = useRef<ChatMessage[]>([]);
  const isSyncing = useRef(false);
  const stateRef = useRef({ users, messages, gameState, propBets, isHost, currentUser, partyCode });

  useEffect(() => {
    stateRef.current = { users, messages, gameState, propBets, isHost, currentUser, partyCode };
    if (currentUser) localStorage.setItem('sblix_user_v20', JSON.stringify(currentUser));
    localStorage.setItem('sblix_host_v20', isHost.toString());
  }, [users, messages, gameState, propBets, isHost, currentUser, partyCode]);

  const runHyperPulse = useCallback(async () => {
    if (isSyncing.current || !currentUser) return;
    isSyncing.current = true;
    setSyncStatus('syncing');

    try {
      const response = await fetch(`${API_BASE}/${roomSyncKey}?cb=${Date.now()}`);
      let cloudState: any = { users: [], messages: [], game: gameState, props: propBets };
      
      if (response.ok) {
        const text = await response.text();
        try { cloudState = JSON.parse(text); } catch (e) {}
      }

      const now = Date.now();
      const updatedUser = { ...currentUser, lastPing: now };
      const freshUsers = (cloudState.users || [])
        .filter((u: any) => u.id !== currentUser.id && (now - (u.lastPing || 0)) < 60000);
      const newRoster = [...freshUsers, updatedUser];

      // Merge and dedupe messages
      const combinedMsgs = [...(cloudState.messages || []), ...outbox.current];
      const uniqueMsgs = Array.from(new Map(combinedMsgs.map(m => [m.id, m])).values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-50);

      // Data Authority: Host overrides cloud, otherwise Cloud overrides local
      const finalGame = isHost ? stateRef.current.gameState : (cloudState.game || stateRef.current.gameState);
      const finalProps = isHost ? stateRef.current.propBets : (cloudState.props || stateRef.current.propBets);

      const nextState = {
        users: newRoster,
        messages: uniqueMsgs,
        game: finalGame,
        props: finalProps,
        ts: now
      };

      await fetch(`${API_BASE}/${roomSyncKey}`, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(nextState),
        headers: { 'Content-Type': 'text/plain' }
      });

      setUsers(newRoster);
      setMessages(uniqueMsgs);
      setGameState(finalGame);
      setPropBets(finalProps);
      setSyncStatus('connected');

      const cloudIds = new Set(uniqueMsgs.map(m => m.id));
      outbox.current = outbox.current.filter(m => !cloudIds.has(m.id));

    } catch (e) {
      setSyncStatus('error');
    } finally {
      isSyncing.current = false;
    }
  }, [currentUser, isHost, roomSyncKey, gameState, propBets]);

  useEffect(() => {
    if (mode === 'GAME' && currentUser) {
      runHyperPulse();
      const interval = setInterval(runHyperPulse, 3500);
      return () => clearInterval(interval);
    }
  }, [mode, currentUser, runHyperPulse]);

  const updateScore = (team: 'home' | 'away', delta: number) => {
    setGameState(prev => ({
      ...prev,
      score: {
        ...prev.score,
        [team]: Math.max(0, prev.score[team] + delta)
      }
    }));
  };

  const onTriggerAiCommentary = async () => {
    if (!isHost || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const commentary = await getAICommentary(messages, gameState, users);
      const msg: ChatMessage = {
        id: generateId(),
        userId: 'AI_GERRY',
        username: 'GERRY THE GAMBLER',
        text: commentary,
        timestamp: Date.now(),
        isAI: true
      };
      setMessages(prev => [...prev, msg]);
      outbox.current.push(msg);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const onSendMessage = (text: string) => {
    if (!currentUser) return;
    const msg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    outbox.current.push(msg);
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl border-white/20 my-8">
          <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-3 border-4 border-red-600">
            <i className="fas fa-tower-broadcast text-red-600 text-4xl animate-pulse"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 uppercase tracking-tighter">SBLIX PRO</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">Official Party Sync: {partyCode}</p>
          <GuestLogin onLogin={(e, h, r, t) => {
            e.preventDefault();
            const newUser = { id: generateId(), username: h, realName: r, avatar: t, credits: 0 };
            setCurrentUser(newUser);
            setMode('GAME');
          }} isHost={isHost} />
          {!isHost && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <form onSubmit={e => {
                e.preventDefault();
                if (hostKeyInput === 'SB2026') { setIsHost(true); localStorage.setItem('sblix_host_v20', 'true'); setHostKeyInput(''); }
              }} className="flex gap-2">
                <input type="password" placeholder="COMMISH PIN" value={hostKeyInput} onChange={e => setHostKeyInput(e.target.value)} className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none text-white focus:border-red-500" />
                <button type="submit" className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase">Auth Host</button>
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
            <h1 className="text-lg font-black font-orbitron text-red-600">SBLIX</h1>
            {isHost && <span className="text-[7px] bg-red-600 text-white font-black px-1 rounded uppercase tracking-tighter animate-pulse">COMMISH</span>}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px]">
              <span className="font-orbitron font-black text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              {gameState.possession === 'home' ? <i className="fas fa-football-ball text-blue-400 text-[7px]"></i> : <i className="fas fa-football-ball text-red-400 text-[7px]"></i>}
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[7px] font-black text-slate-500 uppercase tracking-tighter text-right leading-tight">
                {users.length} FRANCHISES<br/>
                <span className={syncStatus === 'connected' ? 'text-green-500' : 'text-slate-700'}>HYPER-PULSE V20</span>
             </div>
             <TeamHelmet teamId={currentUser.avatar} size="md" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatRoom user={currentUser} messages={messages} users={users} onSendMessage={onSendMessage} />}
        {activeTab === 'bets' && <BettingPanel propBets={propBets} user={currentUser} allBets={userBets} onPlaceBet={(bid, amt, sel) => {
              const bet: UserBet = { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
              setUserBets(p => [...p, bet]);
            }} />}
        {activeTab === 'leaderboard' && (
          <div className="h-full flex flex-col overflow-hidden">
            <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
            
            {/* GUEST-SIDE HOST UPGRADE PORTAL */}
            {!isHost && (
              <div className="px-4 py-2 border-t border-white/5 bg-slate-900 shrink-0">
                 <button onClick={() => {
                   const pin = prompt("Enter Commissioner PIN:");
                   if (pin === 'SB2026') { setIsHost(true); localStorage.setItem('sblix_host_v20', 'true'); alert("Welcome back, Commish."); }
                 }} className="w-full py-2 bg-slate-800 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-700">
                    Host Login
                 </button>
              </div>
            )}

            <div className="p-4 border-t border-white/5 bg-slate-900 text-center shrink-0">
               <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">ROOM RADAR</h4>
               <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {users.map(u => (
                    <div key={u.id} className="relative group">
                      <TeamHelmet teamId={u.avatar} size="sm" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-slate-900 shadow-lg"></div>
                    </div>
                  ))}
               </div>
               <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">
                 {users.length} GUESTS ONLINE
               </p>
            </div>
          </div>
        )}
        {activeTab === 'command' && isHost && (
          <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
             {/* AI COMMENTARY TOOL */}
             <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-[2rem] p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">GERRY THE GAMBLER AI</h3>
                  <i className="fas fa-robot text-indigo-400 animate-bounce"></i>
                </div>
                <button 
                  onClick={onTriggerAiCommentary} 
                  disabled={isAiLoading}
                  className={`w-full py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${
                    isAiLoading ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 text-white border-b-4 border-indigo-800'
                  }`}>
                  {isAiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                  {isAiLoading ? 'GENERATING SMACK TALK...' : 'TRIGGER AI COMMENTARY'}
                </button>
                <p className="text-[8px] text-indigo-300/50 mt-3 text-center uppercase font-bold tracking-tighter">Broadcasts Gerry's reaction to all guests</p>
             </div>

             {/* SCOREBOARD CONSOLE */}
             <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                   <div className="flex items-center gap-1.5 bg-red-600/10 px-2 py-1 rounded-full border border-red-600/30">
                      <div className="w-1 h-1 bg-red-600 rounded-full animate-ping"></div>
                      <span className="text-[7px] text-red-500 font-black uppercase">Broadcasting Live</span>
                   </div>
                </div>
                <h3 className="text-center text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6 mt-2">SCOREBOARD CONSOLE</h3>
                <div className="grid grid-cols-2 gap-8 mb-8">
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">HOME TEAM</p>
                      <div className="text-5xl font-black font-orbitron mb-4 text-white drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">{gameState.score.home}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateScore('home', 6)} className="bg-blue-600 text-[9px] py-2 rounded-lg font-black shadow-lg">+6 TD</button>
                        <button onClick={() => updateScore('home', 3)} className="bg-blue-800 text-[9px] py-2 rounded-lg font-black shadow-lg">+3 FG</button>
                        <button onClick={() => updateScore('home', 2)} className="bg-blue-900 text-[9px] py-2 rounded-lg font-black shadow-lg">+2 SAF</button>
                        <button onClick={() => updateScore('home', 1)} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black shadow-lg">+1 PAT</button>
                      </div>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">AWAY TEAM</p>
                      <div className="text-5xl font-black font-orbitron mb-4 text-white drop-shadow-[0_0_15px_rgba(239,68,68,0.3)]">{gameState.score.away}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateScore('away', 6)} className="bg-red-600 text-[9px] py-2 rounded-lg font-black shadow-lg">+6 TD</button>
                        <button onClick={() => updateScore('away', 3)} className="bg-red-800 text-[9px] py-2 rounded-lg font-black shadow-lg">+3 FG</button>
                        <button onClick={() => updateScore('away', 2)} className="bg-red-950 text-[9px] py-2 rounded-lg font-black shadow-lg">+2 SAF</button>
                        <button onClick={() => updateScore('away', 1)} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black shadow-lg">+1 PAT</button>
                      </div>
                   </div>
                </div>

                <div className="border-t border-slate-800 pt-6 space-y-5">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Quarter Period</span>
                      <div className="flex gap-1.5">
                         {[1, 2, 3, 4, 'OT'].map(q => (
                           <button key={q} onClick={() => setGameState(p => ({...p, quarter: typeof q === 'string' ? 5 : q}))} 
                             className={`w-9 h-9 rounded-xl text-[10px] font-black transition-all ${gameState.quarter === (q === 'OT' ? 5 : q) ? 'bg-white text-black shadow-xl scale-110' : 'bg-slate-800 text-slate-500'}`}>{q}</button>
                         ))}
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Possession Ball</span>
                      <div className="flex bg-slate-950 rounded-xl p-1 border border-slate-800">
                         <button onClick={() => setGameState(p => ({...p, possession: 'home'}))} className={`px-5 py-2.5 rounded-lg text-[10px] font-black transition-all ${gameState.possession === 'home' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600'}`}>HOME</button>
                         <button onClick={() => setGameState(p => ({...p, possession: 'away'}))} className={`px-5 py-2.5 rounded-lg text-[10px] font-black transition-all ${gameState.possession === 'away' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-600'}`}>AWAY</button>
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Game Clock</span>
                      <div className="flex items-center gap-2">
                         <i className="fas fa-clock text-slate-700 text-xs"></i>
                         <input type="text" value={gameState.timeRemaining} onChange={e => setGameState(p => ({...p, timeRemaining: e.target.value}))} className="bg-black border border-slate-700 rounded-xl px-4 py-2 text-sm font-black text-center w-24 outline-none focus:border-blue-500 text-blue-400" />
                      </div>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">SETTLE OPEN PROPS</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className={`p-5 bg-slate-900 border rounded-2xl transition-all ${bet.resolved ? 'border-slate-800 opacity-50' : 'border-slate-700 shadow-xl'}`}>
                    <p className="text-xs font-black text-slate-200 mb-4">{bet.question}</p>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button key={opt} onClick={() => {
                            const upd = propBets.map(pb => pb.id === bet.id ? { ...pb, resolved: true, outcome: opt } : pb);
                            setPropBets(upd);
                          }} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase transition-all ${bet.outcome === opt ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500'}`}>{opt}</button>
                      ))}
                    </div>
                  </div>
                ))}
             </div>

             <div className="glass-card p-8 rounded-[3rem] text-center border-white/5">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">RECRUIT THE SQUAD</h2>
                <div className="bg-white p-4 rounded-3xl w-fit mx-auto shadow-2xl mb-6">
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?room=' + partyCode)}`} alt="QR" />
                </div>
                <button onClick={() => { navigator.clipboard.writeText(window.location.origin + window.location.pathname + '?room=' + partyCode); alert("Invite Link Copied!"); }} className="w-full py-5 bg-blue-600/10 text-blue-400 border border-blue-500/30 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em]">SHARE INVITE LINK</button>
             </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe flex shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rankings' },
            ...(isHost ? [{ id: 'command', icon: 'fa-user-shield', label: 'Commish' }] : [])
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-5 flex flex-col items-center gap-1.5 transition-all ${activeTab === tab.id ? 'text-red-600 bg-red-600/5' : 'text-slate-600'}`}>
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
          <button type="button" key={t.id} onClick={() => setAv(t.id)} className={`flex flex-col items-center p-2 rounded-xl transition-all ${av === t.id ? 'bg-white/10 ring-2 ring-red-500' : 'opacity-40 hover:opacity-100'}`}>
            <TeamHelmet teamId={t.id} size="sm" />
            <span className="text-[8px] font-black mt-1 text-slate-400">{t.id}</span>
          </button>
        ))}
      </div>
      <div className="space-y-4 text-left">
        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Display Handle</label>
        <input type="text" placeholder="e.g. BlitzMaster" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Real Name</label>
        <input type="text" placeholder="e.g. John Doe" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
          {isHost ? 'LAUNCH COMMISSIONER WAR ROOM' : 'JOIN THE HUDDLE'}
        </button>
      </div>
    </div>
  );
};

export default App;
