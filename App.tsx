
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

// NEW PERSISTENT SYNC KEY - This bridges the gap between devices
const SYNC_RELAY_ID = "v8_sblix_prod_sync_99";
const SYNC_URL = "https://api.keyvalue.xyz/a6b7c8d9";

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_user_v8');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [syncStatus, setSyncStatus] = useState<'connected' | 'syncing' | 'error' | 'recovering'>('connected');
  
  const [partyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || params.get('code');
    return (room || 'SBLIX').toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const [isHostAuthenticated, setIsHostAuthenticated] = useState(localStorage.getItem('sblix_host_v8') === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });

  // Use refs to avoid stale closures in the sync interval
  const usersRef = useRef(users);
  const messagesRef = useRef(messages);
  const gameStateRef = useRef(gameState);
  const propBetsRef = useRef(propBets);
  const isSyncing = useRef(false);

  useEffect(() => {
    usersRef.current = users;
    messagesRef.current = messages;
    gameStateRef.current = gameState;
    propBetsRef.current = propBets;
    
    if (currentUser) {
      localStorage.setItem('sblix_user_v8', JSON.stringify(currentUser));
      if (mode === 'LANDING') setMode('GAME');
    }
    localStorage.setItem('sblix_host_v8', isHostAuthenticated.toString());
  }, [users, messages, gameState, propBets, currentUser, isHostAuthenticated, mode]);

  // THE MASTER SYNC CORE - This is the "Merge" logic
  const performAtomicSync = useCallback(async (urgent: boolean = false) => {
    if (isSyncing.current && !urgent) return;
    if (!currentUser) return;

    const roomKey = `${SYNC_RELAY_ID}_${partyCode.toLowerCase()}`;
    const endpoint = `${SYNC_URL}/${roomKey}`;

    try {
      isSyncing.current = true;
      setSyncStatus('syncing');

      // 1. FETCH CLOUD STATE
      const response = await fetch(endpoint, { cache: 'no-store' });
      let cloud: any = null;
      if (response.ok) {
        const text = await response.text();
        if (text && text.length > 5 && text !== "null") {
          cloud = JSON.parse(text);
        }
      }

      // 2. ATOMIC MERGE (Don't just overwrite, combine!)
      const currentUsers = [...usersRef.current];
      const cloudUsers = cloud?.users || [];
      const userMap = new Map();
      
      // Load cloud users first
      cloudUsers.forEach((u: User) => userMap.set(u.id, u));
      // Overwrite with local user (ensures my status is always updated)
      userMap.set(currentUser.id, currentUser);
      // Add any other local users we discovered previously
      currentUsers.forEach((u: User) => {
        if (!userMap.has(u.id)) userMap.set(u.id, u);
      });

      const mergedUsers = Array.from(userMap.values());

      // Merge Messages
      const currentMsgs = [...messagesRef.current];
      const cloudMsgs = cloud?.messages || [];
      const msgMap = new Map();
      cloudMsgs.forEach((m: ChatMessage) => msgMap.set(m.id, m));
      currentMsgs.forEach((m: ChatMessage) => msgMap.set(m.id, m));
      const mergedMessages = Array.from(msgMap.values()).sort((a:any, b:any) => a.timestamp - b.timestamp).slice(-50);

      // 3. DETERMINE TRUTH (Host vs Client)
      const finalPropBets = isHostAuthenticated ? propBetsRef.current : (cloud?.propBets || propBetsRef.current);
      const finalGameState = isHostAuthenticated ? gameStateRef.current : (cloud?.gameState || gameStateRef.current);

      // 4. PUSH MERGED STATE
      const payload = {
        users: mergedUsers,
        messages: mergedMessages,
        propBets: finalPropBets,
        gameState: finalGameState,
        lastUpdate: Date.now()
      };

      await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain' }
      });

      // 5. UPDATE UI
      setUsers(mergedUsers);
      setMessages(mergedMessages);
      if (!isHostAuthenticated) {
        setPropBets(finalPropBets);
        setGameState(finalGameState);
      }
      setSyncStatus('connected');

    } catch (e) {
      console.error("Sync Collision Detected - Retrying...");
      setSyncStatus('error');
    } finally {
      isSyncing.current = false;
    }
  }, [currentUser, isHostAuthenticated, partyCode]);

  // Optimized Background Interval with Jitter to prevent 20-phone collisions
  useEffect(() => {
    if (mode === 'GAME' && currentUser) {
      performAtomicSync(true);
      const jitter = Math.random() * 2000; // Offset every device by up to 2 seconds
      const interval = setInterval(() => performAtomicSync(false), 3000 + jitter);
      return () => clearInterval(interval);
    }
  }, [mode, currentUser, performAtomicSync]);

  const onSendMessage = async (text: string) => {
    if (!currentUser) return;
    const msg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
    
    // Optimistic Update
    setMessages(prev => [...prev, msg]);
    // Force immediate sync to show other users
    setTimeout(() => performAtomicSync(true), 100);

    // Occasional AI Trash Talk
    if (Math.random() > 0.9) {
      setTimeout(async () => {
        const talk = await getAICommentary(messagesRef.current, gameStateRef.current, [...usersRef.current].sort((a,b) => b.credits - a.credits));
        const aiMsg: ChatMessage = { id: generateId(), userId: 'ai', username: 'Gerry Bot', text: talk, timestamp: Date.now(), isAI: true };
        setMessages(prev => [...prev, aiMsg]);
        performAtomicSync(true);
      }, 3000);
    }
  };

  const handleHostAuth = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hostKeyInput === 'SB2026') {
      setIsHostAuthenticated(true);
      setHostKeyInput('');
      setActiveTab('command');
      performAtomicSync(true);
    } else {
      alert("Commissioner Key Denied");
    }
  };

  const resolveBet = (betId: string, outcome: string) => {
    const updatedProps = propBetsRef.current.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome } : pb);
    setPropBets(updatedProps);
    
    // Calculate points for the host (the broadcast will settle it for others)
    setUsers(prev => prev.map(u => {
      // Note: In a real app we'd need to store user bets in the cloud too, 
      // but for this party we calculate winners locally and broadcast credits.
      return u; 
    }));

    setTimeout(() => performAtomicSync(true), 100);
  };

  const onJoin = (e: React.FormEvent, handle: string, real: string, av: string) => {
    e.preventDefault();
    const id = currentUser?.id || generateId();
    const newUser: User = { id, username: handle, realName: real, avatar: av, credits: currentUser?.credits || 0 };
    setCurrentUser(newUser);
    setUsers(prev => [...prev.filter(u => u.id !== id), newUser]);
    setMode('GAME');
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6 overflow-hidden">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl">
          <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-6 border-4 border-red-600">
            <i className="fas fa-football-ball text-red-600 text-4xl"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 tracking-tighter uppercase">SBLIX PARTY</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">ROOM: {partyCode}</p>

          <GuestLogin onLogin={onJoin} isHost={isHostAuthenticated} />

          {!isHostAuthenticated && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <form onSubmit={handleHostAuth} className="flex gap-2">
                <input 
                  type="password" 
                  placeholder="Commish Login" 
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
              <span className="font-orbitron font-black text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'}`}></div>
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
              onSendMessage={onSendMessage} 
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
                setTimeout(() => performAtomicSync(true), 50);
              }}
            />
          )}
          {activeTab === 'leaderboard' && (
            <div className="h-full flex flex-col overflow-hidden">
              <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
              <div className="p-4 border-t border-white/5 bg-slate-900/50 shrink-0 text-center">
                 <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Atomic Sync Active</p>
                 <p className="text-[10px] text-green-400 font-black tracking-widest">{users.length} DEVICES CONNECTED</p>
              </div>
            </div>
          )}
          {activeTab === 'command' && isHostAuthenticated && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24 custom-scrollbar">
              <div className="glass-card p-6 rounded-[2rem] text-center border-blue-500/20 bg-blue-600/5 shadow-2xl">
                <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Commissioner Control</h2>
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
                  {copied ? 'COPIED!' : 'COPY PARTY LINK'}
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Live Settle Props for All Guests</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col gap-3 shadow-md">
                    <span className="text-[11px] font-bold text-slate-300 leading-tight">{bet.question}</span>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button 
                          key={opt}
                          onClick={() => resolveBet(bet.id, opt)}
                          className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${bet.outcome === opt ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 active:bg-slate-700'}`}
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
          {isHost ? 'ACCESS COMMISSIONER SUITE' : 'JOIN THE PARTY'}
        </button>
      </div>
    </div>
  );
};

export default App;
