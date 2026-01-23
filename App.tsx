
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';

type AppMode = 'LANDING' | 'GAME';
type TabType = 'chat' | 'bets' | 'halftime' | 'leaderboard' | 'command';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

// Unique token and key for the 2024 Super Bowl Hub
const SYNC_TOKEN = "sblix_v18_final"; 

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sb_user_v18');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  
  const [partyCode, setPartyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || params.get('code');
    return (room || 'SUPERBOWL_PARTY').toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'connected'>('idle');
  const [isHostAuthenticated, setIsHostAuthenticated] = useState(localStorage.getItem('sb_is_host_v18') === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Use refs to prevent stale closure bugs in the polling interval
  const stateRef = useRef({ users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated });
  const hasPulledOnce = useRef(false);
  const lastCloudTimestamp = useRef(0);

  const [gameState, setGameState] = useState<GameState>({
    quarter: 1,
    timeRemaining: "15:00",
    score: { home: 0, away: 0 },
    possession: 'home'
  });

  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated };
    if (currentUser) {
      localStorage.setItem('sb_user_v18', JSON.stringify(currentUser));
      if (mode === 'LANDING') setMode('GAME');
    }
  }, [users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated, mode]);

  const mergeFromCloud = useCallback((cloud: any) => {
    if (!cloud) return;

    // 1. ATOMIC ROSTER MERGE: Combine local and cloud users (prevents islands)
    setUsers(prev => {
      const userMap = new Map<string, User>();
      (cloud.users || []).forEach((u: User) => userMap.set(u.id, u));
      prev.forEach(u => userMap.set(u.id, u)); // Local users always stay
      if (stateRef.current.currentUser) userMap.set(stateRef.current.currentUser.id, stateRef.current.currentUser);
      return Array.from(userMap.values());
    });

    // 2. CHAT MERGE: Unique messages only
    setMessages(prev => {
      const msgMap = new Map<string, ChatMessage>(prev.map(m => [m.id, m]));
      (cloud.messages || []).forEach((m: ChatMessage) => msgMap.set(m.id, m));
      return Array.from(msgMap.values()).sort((a, b) => a.timestamp - b.timestamp).slice(-100);
    });

    // 3. GLOBAL UPDATES: Only if cloud has a newer timestamp
    if (cloud.updatedAt > lastCloudTimestamp.current) {
      if (cloud.propBets) setPropBets(cloud.propBets);
      if (cloud.gameState) setGameState(cloud.gameState);
      if (cloud.userBets) {
        setUserBets(prev => {
          const betMap = new Map<string, UserBet>(prev.map(b => [b.id, b]));
          cloud.userBets.forEach((b: UserBet) => betMap.set(b.id, b));
          return Array.from(betMap.values());
        });
      }
      lastCloudTimestamp.current = cloud.updatedAt;
    }

    hasPulledOnce.current = true;
    setSyncStatus('connected');
  }, []);

  const runSyncCycle = useCallback(async (isUrgent: boolean = false) => {
    const code = stateRef.current.partyCode;
    // Standardizing on the most reliable keyValue.xyz endpoint format
    const url = `https://api.keyvalue.xyz/80c43666/sblix_room_${code.toLowerCase()}`;
    
    try {
      setSyncStatus('syncing');

      // STEP 1: PULL (Crucial for 20+ guests - MUST see others before saving)
      const pull = await fetch(url, { mode: 'cors', cache: 'no-store' });
      let cloudData: any = null;
      if (pull.ok) {
        const text = await pull.text();
        if (text && text !== "null" && text.length > 5) {
          cloudData = JSON.parse(text);
          mergeFromCloud(cloudData);
        }
      }

      // STEP 2: PUSH (Only if we have a reason to)
      const isMeInCloud = cloudData?.users?.some((u: User) => u.id === stateRef.current.currentUser?.id);
      const needsJoinBroadcast = stateRef.current.currentUser && !isMeInCloud;

      if (isUrgent || stateRef.current.isHostAuthenticated || needsJoinBroadcast) {
        const payload = {
          users: stateRef.current.users,
          messages: stateRef.current.messages,
          userBets: stateRef.current.userBets,
          propBets: stateRef.current.propBets,
          gameState: stateRef.current.isHostAuthenticated ? gameState : (cloudData?.gameState || gameState),
          updatedAt: Date.now()
        };

        await fetch(url, {
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      setSyncStatus('connected');
    } catch (e) {
      console.warn("Sync interrupted (Retrying...):", e);
      setSyncStatus('error');
    }
  }, [mergeFromCloud, gameState]);

  useEffect(() => {
    runSyncCycle(false);
    const interval = setInterval(() => runSyncCycle(false), 4200);
    return () => clearInterval(interval);
  }, [runSyncCycle]);

  const handleHostAuth = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hostKeyInput === 'SB2026') {
      setIsHostAuthenticated(true);
      localStorage.setItem('sb_is_host_v18', 'true');
      setHostKeyInput('');
      setActiveTab('command');
    } else {
      alert("Invalid Passkey");
    }
  };

  const onJoin = (e: React.FormEvent, handle: string, real: string, av: string) => {
    e.preventDefault();
    const id = currentUser?.id || generateId();
    const newUser: User = { id, username: handle, realName: real, avatar: av, credits: currentUser?.credits || 0 };
    setCurrentUser(newUser);
    setUsers(prev => [...prev.filter(u => u.id !== id), newUser]);
    setMode('GAME');
    // Immediate handshake to join the roster
    setTimeout(() => runSyncCycle(true), 200);
  };

  const resolveBet = (betId: string, outcome: string) => {
    const updatedPropBets = propBets.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome } : pb);
    setPropBets(updatedPropBets);
    
    // Distribute local points
    setUsers(uList => uList.map(u => {
      const myBet = userBets.find(ub => ub.betId === betId && ub.userId === u.id);
      if (myBet) {
        const win = myBet.selection === outcome;
        const pts = (u.credits || 0) + (win ? 10 : -3);
        if (u.id === currentUser?.id) setCurrentUser(c => c ? { ...c, credits: pts } : null);
        return { ...u, credits: pts };
      }
      return u;
    }));

    setUserBets(prev => prev.map(b => b.betId === betId ? { ...b, status: b.selection === outcome ? BetStatus.WON : BetStatus.LOST } : b));
    setTimeout(() => runSyncCycle(true), 50);
  };

  const copyInvite = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6 overflow-hidden">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl animate-in zoom-in duration-500">
          <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-6 border-4 border-red-600">
            <i className="fas fa-football-ball text-red-600 text-4xl"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 tracking-tighter">SBLIX HUB</h1>
          <div className="bg-slate-900/50 py-1.5 px-4 rounded-full border border-white/10 w-fit mx-auto text-[10px] font-black uppercase text-slate-400 tracking-widest mb-8">
            ROOM CODE: {partyCode}
          </div>

          <GuestLogin onLogin={onJoin} isHost={isHostAuthenticated} />

          {!isHostAuthenticated && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <form onSubmit={handleHostAuth} className="flex gap-2">
                <input 
                  type="password" 
                  placeholder="Commish Passkey" 
                  value={hostKeyInput} 
                  onChange={e => setHostKeyInput(e.target.value)}
                  className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-red-500 text-white"
                />
                <button type="submit" className="bg-slate-800 text-slate-500 px-4 py-2 rounded-xl text-[9px] font-black uppercase">Verify</button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?room=' + partyCode)}`;

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      <header className="bg-slate-900 border-b border-slate-800 p-3 shrink-0 z-40 shadow-xl">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black font-orbitron text-red-600">SBLIX</h1>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px]">
              <span className="font-orbitron font-black text-slate-200 uppercase">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]'}`}></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[10px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-green-400">
               {currentUser.credits} PTS
             </div>
             {isHostAuthenticated && <div className="bg-red-600 text-[7px] font-black px-1 py-0.5 rounded uppercase text-white">COMMISH</div>}
             <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-lg">
               {currentUser.avatar}
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="h-full container mx-auto flex flex-col">
          {activeTab === 'chat' && (
            <ChatRoom 
              user={currentUser} 
              messages={messages} 
              users={users}
              onSendMessage={(text) => {
                const msg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
                setMessages(prev => [...prev, msg]);
                setTimeout(() => runSyncCycle(true), 100);
                if (Math.random() > 0.6) {
                   setTimeout(async () => {
                     const talk = await getAICommentary(stateRef.current.messages, gameState, [...stateRef.current.users].sort((a,b) => b.credits - a.credits));
                     const ai: ChatMessage = { id: generateId(), userId: 'ai', username: 'Gerry Bot', text: talk, timestamp: Date.now(), isAI: true };
                     setMessages(p => [...p, ai]);
                     runSyncCycle(true);
                   }, 3000);
                }
              }} 
            />
          )}
          {activeTab === 'bets' && (
            <BettingPanel 
              propBets={propBets.filter(b => b.category !== 'Halftime')} 
              user={currentUser} 
              allBets={userBets}
              onPlaceBet={(bid, amt, sel) => {
                const bet: UserBet = { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
                setUserBets(p => [...p, bet]);
                setTimeout(() => runSyncCycle(true), 150);
              }}
            />
          )}
          {activeTab === 'leaderboard' && (
            <div className="h-full flex flex-col">
              <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
              <div className="p-4 border-t border-white/5 flex flex-col gap-2 bg-slate-900/50 shrink-0">
                 {!isHostAuthenticated ? (
                   <>
                    <p className="text-[8px] font-black uppercase text-slate-500 text-center tracking-widest">Host Command Center</p>
                    <div className="flex gap-2">
                      <input 
                        type="password" 
                        placeholder="Key" 
                        value={hostKeyInput}
                        onChange={e => setHostKeyInput(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-bold outline-none text-white"
                      />
                      <button onClick={() => handleHostAuth()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase">Auth</button>
                    </div>
                   </>
                 ) : (
                   <p className="text-[9px] text-center font-black text-green-500 uppercase tracking-widest py-2">COMMISSIONER MODE ACTIVE</p>
                 )}
              </div>
            </div>
          )}
          {activeTab === 'command' && isHostAuthenticated && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
              <div className="glass-card p-6 rounded-[2rem] text-center border-blue-500/20 bg-blue-600/5">
                <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Connect Your Guests (Room: {partyCode})</h2>
                <div className="bg-white p-4 rounded-2xl w-fit mx-auto shadow-2xl mb-4">
                   <img src={qrUrl} alt="QR" className="w-48 h-48" />
                </div>
                <button onClick={copyInvite} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all">
                  {copied ? 'LINK COPIED' : 'COPY JOIN LINK'}
                </button>
                <p className="text-[9px] text-slate-500 font-black uppercase mt-3 italic">Scanning this adds guests to your global roster.</p>
              </div>

              <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Live Bet Settlement</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col gap-3 shadow-inner">
                    <span className="text-[11px] font-bold text-slate-300 leading-tight">{bet.question}</span>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button 
                          key={opt}
                          onClick={() => resolveBet(bet.id, opt)}
                          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${bet.outcome === opt ? 'bg-green-600 text-white ring-2 ring-white/20' : 'bg-slate-800 text-slate-500 active:bg-slate-700'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe shrink-0">
        <div className="container mx-auto flex">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' },
            ...(isHostAuthenticated ? [{ id: 'command', icon: 'fa-cog', label: 'Host' }] : [])
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 py-4 flex flex-col items-center gap-1.5 transition-all ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}
            >
              <i className={`fas ${tab.icon} text-lg`}></i>
              <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

const GuestLogin: React.FC<{ onLogin: (e: React.FormEvent, h: string, r: string, a: string) => void, isHost: boolean }> = ({ onLogin, isHost }) => {
  const [handle, setHandle] = useState('');
  const [real, setReal] = useState('');
  const [av, setAv] = useState(AVATARS[0]);

  return (
    <div className="space-y-6">
      <div className="flex justify-center gap-2 overflow-x-auto no-scrollbar py-2">
        {AVATARS.map(a => (
          <button type="button" key={a} onClick={() => setAv(a)} className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${av === a ? 'bg-red-600 border-2 border-white scale-110 shadow-lg' : 'bg-slate-800 opacity-40 hover:opacity-100'}`}>
            {a}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        <input type="text" placeholder="Pick a Chat Name" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <input type="text" placeholder="Real Name (to track wins)" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all hover:bg-slate-100">
          {isHost ? 'ENTER COMMISSIONER HUB' : 'JOIN SUPER BOWL PARTY'}
        </button>
      </div>
    </div>
  );
};

export default App;
