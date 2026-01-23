
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
const SYNC_VERSION = "hp_v19_pro";
const API_BASE = "https://api.keyvalue.xyz";

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(() => {
    return localStorage.getItem('sblix_user_v18') ? 'GAME' : 'LANDING';
  });
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_user_v18');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'connected'>('idle');
  
  const [partyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || 'SBLIX').toUpperCase();
  });

  const [isHost, setIsHost] = useState(localStorage.getItem('sblix_host_v18') === 'true');
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
    if (currentUser) localStorage.setItem('sblix_user_v18', JSON.stringify(currentUser));
    localStorage.setItem('sblix_host_v18', isHost.toString());
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

      const combinedMsgs = [...(cloudState.messages || []), ...outbox.current];
      const uniqueMsgs = Array.from(new Map(combinedMsgs.map(m => [m.id, m])).values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-50);

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
            <i className="fas fa-satellite text-red-600 text-4xl animate-pulse"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 uppercase tracking-tighter">SBLIX HQ</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">Isolated Huddle: {partyCode}</p>
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
                if (hostKeyInput === 'SB2026') { setIsHost(true); localStorage.setItem('sblix_host_v18', 'true'); setHostKeyInput(''); }
              }} className="flex gap-2">
                <input type="password" placeholder="PIN" value={hostKeyInput} onChange={e => setHostKeyInput(e.target.value)} className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none text-white focus:border-red-500" />
                <button type="submit" className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase">Host Access</button>
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
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px]">
              <span className="font-orbitron font-black text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              {gameState.possession === 'home' ? <i className="fas fa-football-ball text-blue-400 text-[7px]"></i> : <i className="fas fa-football-ball text-red-400 text-[7px]"></i>}
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`}></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[7px] font-black text-slate-500 uppercase tracking-tighter text-right leading-tight">
                {users.length} FRANCHISES<br/>
                <span className={syncStatus === 'connected' ? 'text-green-500' : 'text-slate-700'}>HYPER-PULSE ACTIVE</span>
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
            <div className="p-4 border-t border-white/5 bg-slate-900 text-center shrink-0">
               <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">SYNC RADAR</h4>
               <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {users.map(u => (
                    <div key={u.id} className="relative group">
                      <TeamHelmet teamId={u.avatar} size="sm" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-slate-900 shadow-lg"></div>
                    </div>
                  ))}
               </div>
               <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">
                 {users.length} GUESTS DETECTED
               </p>
            </div>
          </div>
        )}
        {activeTab === 'command' && isHost && (
          <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
             {/* SCOREBOARD CONSOLE */}
             <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 shadow-2xl">
                <h3 className="text-center text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">LIVE SCOREBOARD CONSOLE</h3>
                <div className="grid grid-cols-2 gap-8 mb-8">
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">HOME</p>
                      <div className="text-4xl font-black font-orbitron mb-4">{gameState.score.home}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateScore('home', 6)} className="bg-blue-600 text-[9px] py-2 rounded-lg font-black">+6 TD</button>
                        <button onClick={() => updateScore('home', 3)} className="bg-blue-800 text-[9px] py-2 rounded-lg font-black">+3 FG</button>
                        <button onClick={() => updateScore('home', 1)} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black">+1 PAT</button>
                        <button onClick={() => updateScore('home', -1)} className="bg-red-900/40 text-[9px] py-2 rounded-lg font-black">-1 ERR</button>
                      </div>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">AWAY</p>
                      <div className="text-4xl font-black font-orbitron mb-4">{gameState.score.away}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateScore('away', 6)} className="bg-red-600 text-[9px] py-2 rounded-lg font-black">+6 TD</button>
                        <button onClick={() => updateScore('away', 3)} className="bg-red-800 text-[9px] py-2 rounded-lg font-black">+3 FG</button>
                        <button onClick={() => updateScore('away', 1)} className="bg-slate-700 text-[9px] py-2 rounded-lg font-black">+1 PAT</button>
                        <button onClick={() => updateScore('away', -1)} className="bg-red-900/40 text-[9px] py-2 rounded-lg font-black">-1 ERR</button>
                      </div>
                   </div>
                </div>

                <div className="border-t border-slate-800 pt-6 space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Quarter</span>
                      <div className="flex gap-1">
                         {[1, 2, 3, 4, 'OT'].map(q => (
                           <button key={q} onClick={() => setGameState(p => ({...p, quarter: typeof q === 'string' ? 5 : q}))} 
                             className={`w-8 h-8 rounded-lg text-[10px] font-black ${gameState.quarter === (q === 'OT' ? 5 : q) ? 'bg-white text-black' : 'bg-slate-800 text-slate-500'}`}>{q}</button>
                         ))}
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Possession</span>
                      <div className="flex bg-slate-800 rounded-xl p-1">
                         <button onClick={() => setGameState(p => ({...p, possession: 'home'}))} className={`px-4 py-2 rounded-lg text-[9px] font-black ${gameState.possession === 'home' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>HOME</button>
                         <button onClick={() => setGameState(p => ({...p, possession: 'away'}))} className={`px-4 py-2 rounded-lg text-[9px] font-black ${gameState.possession === 'away' ? 'bg-red-600 text-white' : 'text-slate-500'}`}>AWAY</button>
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Clock</span>
                      <input type="text" value={gameState.timeRemaining} onChange={e => setGameState(p => ({...p, timeRemaining: e.target.value}))} className="bg-black/40 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-center w-20 outline-none focus:border-blue-500" />
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">PROP SETTLEMENT</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                    <p className="text-xs font-bold text-slate-300 mb-3">{bet.question}</p>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button key={opt} onClick={() => {
                            const upd = propBets.map(pb => pb.id === bet.id ? { ...pb, resolved: true, outcome: opt } : pb);
                            setPropBets(upd);
                          }} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{opt}</button>
                      ))}
                    </div>
                  </div>
                ))}
             </div>

             <div className="glass-card p-6 rounded-[2rem] text-center border-white/5">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">RECRUIT GUESTS</h2>
                <div className="bg-white p-4 rounded-2xl w-fit mx-auto shadow-2xl mb-4">
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?room=' + partyCode)}`} alt="QR" />
                </div>
                <button onClick={() => { navigator.clipboard.writeText(window.location.origin + window.location.pathname + '?room=' + partyCode); alert("Copied!"); }} className="w-full py-4 bg-white/10 text-white rounded-xl font-black uppercase text-xs">COPY INVITE LINK</button>
             </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe flex shrink-0 shadow-2xl">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' },
            ...(isHost ? [{ id: 'command', icon: 'fa-user-shield', label: 'Commish' }] : [])
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-4 flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}>
              <i className={`fas ${tab.icon} text-lg`}></i>
              <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
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
        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Chat Handle</label>
        <input type="text" placeholder="e.g. EndZone" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Real Name</label>
        <input type="text" placeholder="e.g. John Doe" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
          {isHost ? 'LAUNCH AS COMMISSIONER' : 'JOIN THE PARTY'}
        </button>
      </div>
    </div>
  );
};

export default App;
