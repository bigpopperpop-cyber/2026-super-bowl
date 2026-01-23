
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

// NEW HIGH-CAPACITY SYNC TOKEN FOR SBLIX
const SYNC_TOKEN = "7ea3047a"; 
const SYNC_VERSION = "v22";

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(`sblix_user_${SYNC_VERSION}`);
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  
  const [partyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || params.get('code');
    return (room || 'SBLIX').toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'connected'>('idle');
  const [isHostAuthenticated, setIsHostAuthenticated] = useState(localStorage.getItem(`sblix_is_host_${SYNC_VERSION}`) === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Persistence Refs to prevent state-clobbering during async cycles
  const stateRef = useRef({ users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated });
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });
  const gameStateRef = useRef(gameState);

  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated };
    gameStateRef.current = gameState;
    if (currentUser) {
      localStorage.setItem(`sblix_user_${SYNC_VERSION}`, JSON.stringify(currentUser));
      if (mode === 'LANDING') setMode('GAME');
    }
    localStorage.setItem(`sblix_is_host_${SYNC_VERSION}`, isHostAuthenticated.toString());
  }, [users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated, mode, gameState]);

  // ATOMIC SYNC ENGINE
  const sync = useCallback(async (urgent: boolean = false) => {
    // Generate a unique key per party
    const syncKey = `sblix_${SYNC_VERSION}_${stateRef.current.partyCode.toLowerCase()}`;
    const url = `https://api.keyvalue.xyz/${SYNC_TOKEN}/${syncKey}`;
    
    try {
      setSyncStatus('syncing');

      // 1. PULL - Fetch Global State
      const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
      let cloud: any = null;
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 10 && text !== "null") cloud = JSON.parse(text);
      }

      // 2. MERGE - Combine Local & Cloud
      // Users: Union merge to ensure everyone shows up
      const mergedUsers = [...(stateRef.current.users)];
      if (cloud?.users) {
        cloud.users.forEach((u: User) => {
          if (!mergedUsers.find(mu => mu.id === u.id)) mergedUsers.push(u);
        });
      }
      // Messages: Unique ID merge
      const mergedMessages = [...(stateRef.current.messages)];
      if (cloud?.messages) {
        cloud.messages.forEach((m: ChatMessage) => {
          if (!mergedMessages.find(mm => mm.id === m.id)) mergedMessages.push(m);
        });
      }
      const finalMessages = mergedMessages.sort((a,b) => a.timestamp - b.timestamp).slice(-50);

      // 3. APPLY - Set React State
      setUsers(mergedUsers);
      setMessages(finalMessages);
      
      // Game State / Prop Bets: Commish is the absolute source of truth
      if (cloud) {
        if (!stateRef.current.isHostAuthenticated) {
          if (cloud.propBets) setPropBets(cloud.propBets);
          if (cloud.gameState) setGameState(cloud.gameState);
        }
        if (cloud.userBets) {
          setUserBets(prev => {
            const bMap = new Map<string, UserBet>(prev.map(b => [b.id, b]));
            cloud.userBets.forEach((b: UserBet) => bMap.set(b.id, b));
            return Array.from(bMap.values());
          });
        }
      }

      // 4. PUSH - Broadcast Updates
      // We push if: we are the host, we have a local change (urgent), or we are not yet in the cloud list
      const amIInCloud = cloud?.users?.some((u: User) => u.id === stateRef.current.currentUser?.id);
      const needsPush = urgent || stateRef.current.isHostAuthenticated || (stateRef.current.currentUser && !amIInCloud);

      if (needsPush) {
        const payload = {
          users: mergedUsers,
          messages: finalMessages,
          userBets: stateRef.current.userBets,
          propBets: stateRef.current.isHostAuthenticated ? stateRef.current.propBets : (cloud?.propBets || stateRef.current.propBets),
          gameState: stateRef.current.isHostAuthenticated ? gameStateRef.current : (cloud?.gameState || gameStateRef.current),
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
      console.warn("Sync Glitch (Retrying):", e);
      setSyncStatus('error');
    }
  }, []);

  // Poll aggressively for a live feel (every 3 seconds)
  useEffect(() => {
    sync(true);
    const itv = setInterval(() => sync(false), 3500);
    return () => clearInterval(itv);
  }, [sync]);

  const handleHostAuth = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hostKeyInput === 'SB2026') {
      setIsHostAuthenticated(true);
      setHostKeyInput('');
      setActiveTab('command');
    } else {
      alert("Commish Key Rejected");
    }
  };

  const onJoin = (e: React.FormEvent, handle: string, real: string, av: string) => {
    e.preventDefault();
    const id = currentUser?.id || generateId();
    const newUser: User = { id, username: handle, realName: real, avatar: av, credits: currentUser?.credits || 0 };
    setCurrentUser(newUser);
    setUsers(prev => [...prev.filter(u => u.id !== id), newUser]);
    setMode('GAME');
    // Force immediate broadcast to show on the Roster
    setTimeout(() => sync(true), 200);
  };

  const resolveBet = (betId: string, outcome: string) => {
    setPropBets(p => p.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome } : pb));
    
    // Distribute points locally for immediate feedback
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
    setTimeout(() => sync(true), 100);
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6 overflow-hidden">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl">
          <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-6 border-4 border-red-600">
            <i className="fas fa-football-ball text-red-600 text-4xl"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 tracking-tighter uppercase">SBLIX LIX</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">Party Room: {partyCode}</p>

          <GuestLogin onLogin={onJoin} isHost={isHostAuthenticated} />

          {!isHostAuthenticated && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <form onSubmit={handleHostAuth} className="flex gap-2">
                <input 
                  type="password" 
                  placeholder="Commish Access" 
                  value={hostKeyInput} 
                  onChange={e => setHostKeyInput(e.target.value)}
                  className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none text-white focus:border-red-500"
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
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`}></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[10px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-green-400">
               {currentUser.credits} PTS
             </div>
             {isHostAuthenticated && <div className="bg-red-600 text-[7px] font-black px-1.5 py-0.5 rounded uppercase text-white shadow-lg">HOST</div>}
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
                setTimeout(() => sync(true), 50);
                if (Math.random() > 0.8) {
                   setTimeout(async () => {
                     const talk = await getAICommentary(stateRef.current.messages, gameStateRef.current, [...stateRef.current.users].sort((a,b) => b.credits - a.credits));
                     const ai: ChatMessage = { id: generateId(), userId: 'ai', username: 'Gerry Bot', text: talk, timestamp: Date.now(), isAI: true };
                     setMessages(p => [...p, ai]);
                     sync(true);
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
                setTimeout(() => sync(true), 100);
              }}
            />
          )}
          {activeTab === 'leaderboard' && (
            <div className="h-full flex flex-col overflow-hidden">
              <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
              
              <div className="p-4 border-t border-white/5 bg-slate-900/50 shrink-0">
                {!isHostAuthenticated ? (
                  <div className="space-y-2">
                    <p className="text-[8px] font-black uppercase text-slate-500 text-center tracking-widest">Commissioner Access</p>
                    <div className="flex gap-2">
                      <input 
                        type="password" 
                        placeholder="Key" 
                        value={hostKeyInput}
                        onChange={e => setHostKeyInput(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-bold outline-none text-white focus:border-red-500"
                      />
                      <button onClick={() => handleHostAuth()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase">Auth</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2">
                     <p className="text-[9px] font-black text-green-500 uppercase tracking-[0.2em] animate-pulse">COMMISSIONER HUB ACTIVE</p>
                     <button onClick={() => setActiveTab('command')} className="text-[8px] text-slate-400 underline uppercase mt-1 font-black">Open Controls</button>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'command' && isHostAuthenticated && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24 custom-scrollbar">
              <div className="glass-card p-6 rounded-[2rem] text-center border-blue-500/20 bg-blue-600/5 shadow-2xl">
                <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Guest Hub: {partyCode}</h2>
                <div className="bg-white p-4 rounded-2xl w-fit mx-auto shadow-2xl mb-4">
                   <img src={qrUrl} alt="QR" className="w-48 h-48" />
                </div>
                <button 
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
                    navigator.clipboard.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }} 
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all"
                >
                  {copied ? 'LINK COPIED' : 'COPY PARTY LINK'}
                </button>
                <div className="mt-4 p-2 bg-black/40 rounded-lg">
                   <p className="text-[7px] text-slate-500 uppercase font-black">Sync Endpoint: {SYNC_VERSION}_{partyCode.toLowerCase()}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Settle Props for Guests</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col gap-3 shadow-md">
                    <span className="text-[11px] font-bold text-slate-300 leading-tight">{bet.question}</span>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button 
                          key={opt}
                          onClick={() => resolveBet(bet.id, opt)}
                          className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-500 active:bg-slate-700'}`}
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

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe shrink-0 shadow-2xl">
        <div className="container mx-auto flex">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' },
            ...(isHostAuthenticated ? [{ id: 'command', icon: 'fa-cog', label: 'Commish' }] : [])
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 py-4 flex flex-col items-center gap-1.5 transition-all ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500 hover:text-slate-300'}`}
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
          <button type="button" key={a} onClick={() => setAv(a)} className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all shrink-0 ${av === a ? 'bg-red-600 border-2 border-white scale-110 shadow-lg' : 'bg-slate-800 opacity-40 hover:opacity-100'}`}>
            {a}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        <input type="text" placeholder="Pick a Handle" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <input type="text" placeholder="Real Name (John D.)" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all hover:bg-slate-100">
          {isHost ? 'ENTER COMMISSIONER SUITE' : 'JOIN SUPER BOWL PARTY'}
        </button>
      </div>
    </div>
  );
};

export default App;
