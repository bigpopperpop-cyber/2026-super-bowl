
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

// HIGH-SPEED RELAY CONFIG
const SYNC_TOKEN = "sblix_lix_final_sync";
const SYNC_BASE_URL = "https://api.keyvalue.xyz";

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_user_v7');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [syncStatus, setSyncStatus] = useState<'connected' | 'syncing' | 'error'>('connected');
  
  const [partyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || params.get('code');
    return (room || 'SBLIX').toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const [isHostAuthenticated, setIsHostAuthenticated] = useState(localStorage.getItem('sblix_host_v7') === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });

  // STORAGE REFS - Keep the latest data available for the sync loop
  const stateRef = useRef({ users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated, gameState });
  
  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated, gameState };
    if (currentUser) {
      localStorage.setItem('sblix_user_v7', JSON.stringify(currentUser));
      if (mode === 'LANDING') setMode('GAME');
    }
    localStorage.setItem('sblix_host_v7', isHostAuthenticated.toString());
  }, [users, userBets, messages, propBets, partyCode, currentUser, isHostAuthenticated, mode, gameState]);

  // SHARDED SYNC ENGINE: Each user gets their own shard to prevent collisions
  const sync = useCallback(async (isUrgent: boolean = false) => {
    if (!stateRef.current.currentUser) return;
    
    const roomPrefix = `${SYNC_TOKEN}_${stateRef.current.partyCode.toLowerCase()}`;
    const myShardKey = `${roomPrefix}_user_${stateRef.current.currentUser.id}`;
    const commishShardKey = `${roomPrefix}_commish`;
    const chatShardKey = `${roomPrefix}_chat`;

    setSyncStatus('syncing');

    try {
      // 1. PUSH MY STATE (User's personal shard - NO COLLISIONS POSSIBLE)
      const myPayload = {
        user: stateRef.current.currentUser,
        bets: stateRef.current.userBets,
        heartbeat: Date.now()
      };
      
      await fetch(`${SYNC_BASE_URL}/a6b7c8d9/${myShardKey}`, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(myPayload),
        headers: { 'Content-Type': 'text/plain' }
      });

      // 2. IF COMMISH: PUSH MASTER STATE
      if (stateRef.current.isHostAuthenticated) {
        const masterPayload = {
          gameState: stateRef.current.gameState,
          propBets: stateRef.current.propBets,
          userList: stateRef.current.users.map(u => u.id), // Directory of active users
          updatedAt: Date.now()
        };
        await fetch(`${SYNC_BASE_URL}/a6b7c8d9/${commishShardKey}`, {
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify(masterPayload),
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      // 3. PULL MASTER & CHAT
      const [commishResp, chatResp] = await Promise.all([
        fetch(`${SYNC_BASE_URL}/a6b7c8d9/${commishShardKey}`, { cache: 'no-store' }),
        fetch(`${SYNC_BASE_URL}/a6b7c8d9/${chatShardKey}`, { cache: 'no-store' })
      ]);

      if (commishResp.ok) {
        const commishData = await commishResp.json();
        if (commishData && !stateRef.current.isHostAuthenticated) {
          setGameState(commishData.gameState);
          setPropBets(commishData.propBets);
          
          // Fetch specific updates for other users discovered in the directory
          if (commishData.userList) {
             const others = commishData.userList.filter((id: string) => id !== stateRef.current.currentUser?.id);
             // We'll limit to 15 users for performance per poll
             const sample = others.sort(() => 0.5 - Math.random()).slice(0, 15);
             const userUpdates = await Promise.all(sample.map((id: string) => 
               fetch(`${SYNC_BASE_URL}/a6b7c8d9/${roomPrefix}_user_${id}`).then(r => r.ok ? r.json() : null)
             ));
             
             setUsers(prev => {
               const uMap = new Map(prev.map(u => [u.id, u]));
               userUpdates.forEach(data => {
                 if (data?.user) uMap.set(data.user.id, data.user);
               });
               return Array.from(uMap.values());
             });
          }
        }
      }

      if (chatResp.ok) {
        const chatData = await chatResp.json();
        if (chatData?.messages) {
          setMessages(prev => {
            const mIds = new Set(prev.map(m => m.id));
            const newMsgs = chatData.messages.filter((m: ChatMessage) => !mIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            return [...prev, ...newMsgs].sort((a,b) => a.timestamp - b.timestamp).slice(-60);
          });
        }
      }

      setSyncStatus('connected');
    } catch (e) {
      console.error("Sync Lane Blocked:", e);
      setSyncStatus('error');
    }
  }, []);

  // Continuous background sync (Every 4 seconds + jitter)
  useEffect(() => {
    if (mode === 'GAME') {
      sync(true);
      const itv = setInterval(() => sync(false), 3500 + Math.random() * 1000);
      return () => clearInterval(itv);
    }
  }, [mode, sync]);

  const onSendMessage = async (text: string) => {
    if (!currentUser) return;
    const msg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
    
    // Optimistic Update
    setMessages(prev => [...prev, msg]);

    // Push to Chat Shard
    try {
      const roomPrefix = `${SYNC_TOKEN}_${stateRef.current.partyCode.toLowerCase()}`;
      const chatShardKey = `${roomPrefix}_chat`;
      const resp = await fetch(`${SYNC_BASE_URL}/a6b7c8d9/${chatShardKey}`);
      let existing = { messages: [] };
      if (resp.ok) existing = await resp.json();
      
      const updated = { 
        messages: [...(existing.messages || []), msg].slice(-40),
        updatedAt: Date.now() 
      };

      await fetch(`${SYNC_BASE_URL}/a6b7c8d9/${chatShardKey}`, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(updated),
        headers: { 'Content-Type': 'text/plain' }
      });
    } catch (e) {
      console.warn("Chat broadcast failed, will retry on next loop.");
    }
  };

  const handleHostAuth = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hostKeyInput === 'SB2026') {
      setIsHostAuthenticated(true);
      setHostKeyInput('');
      setActiveTab('command');
    } else {
      alert("Invalid Commissioner Passcode");
    }
  };

  const resolveBet = (betId: string, outcome: string) => {
    setPropBets(p => p.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome } : pb));
    
    // Trigger points locally
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

    setTimeout(() => sync(true), 100);
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
          <h1 className="text-3xl font-black font-orbitron mb-2 tracking-tighter uppercase">SBLIX LIX</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">PARTY CHANNEL: {partyCode}</p>

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
                <button type="submit" className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase">Verify</button>
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
                setTimeout(() => sync(true), 50);
              }}
            />
          )}
          {activeTab === 'leaderboard' && (
            <div className="h-full flex flex-col overflow-hidden">
              <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
              <div className="p-4 border-t border-white/5 bg-slate-900/50 shrink-0 text-center">
                 <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Slot-Sync Mesh Active</p>
                 <p className="text-[10px] text-green-400 font-black tracking-widest">{users.length} DEVICES DISCOVERED</p>
              </div>
            </div>
          )}
          {activeTab === 'command' && isHostAuthenticated && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24 custom-scrollbar">
              <div className="glass-card p-6 rounded-[2rem] text-center border-blue-500/20 bg-blue-600/5 shadow-2xl">
                <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Commissioner Control Hub</h2>
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
                          className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${bet.outcome === opt ? 'bg-green-600 text-white shadow-lg scale-105' : 'bg-slate-800 text-slate-500 active:bg-slate-700'}`}
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
        <input type="text" placeholder="Choose a Handle" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <input type="text" placeholder="Real Name (John D.)" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all hover:bg-slate-100">
          {isHost ? 'ENTER COMMISSIONER SUITE' : 'JOIN SUPER BOWL PARTY'}
        </button>
      </div>
    </div>
  );
};

export default App;
