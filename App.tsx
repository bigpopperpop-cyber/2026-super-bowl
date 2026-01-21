import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';

type TabType = 'bets' | 'chat' | 'leaderboard';

const generateId = () => {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch (e) {}
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('bets');
  const [copied, setCopied] = useState(false);
  const [partyCode, setPartyCode] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncedAtRef = useRef<number>(0);
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1,
    timeRemaining: "15:00",
    score: { home: 0, away: 0 },
    possession: 'home'
  });
  
  const [loginUsername, setLoginUsername] = useState('');
  const [loginRealName, setLoginRealName] = useState('');
  const [loginPartyCode, setLoginPartyCode] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);

  const stateRef = useRef({ users, userBets, messages, propBets, gameState });

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, gameState };
  }, [users, userBets, messages, propBets, gameState]);

  // Persist to LocalStorage
  useEffect(() => {
    if (users.length > 0) localStorage.setItem('sb_users', JSON.stringify(users));
    if (userBets.length > 0) localStorage.setItem('sb_bets', JSON.stringify(userBets));
    if (messages.length > 0) localStorage.setItem('sb_messages', JSON.stringify(messages));
    if (partyCode) localStorage.setItem('sb_party_code', partyCode);
    if (currentUser) localStorage.setItem('sb_current_user', JSON.stringify(currentUser));
  }, [users, userBets, messages, partyCode, currentUser]);

  const syncWithCloud = useCallback(async (push: boolean = false) => {
    // We only sync if a party code is set and it's not the default local mode
    if (!partyCode || partyCode === 'LOCAL') return;
    
    // KeyValue.xyz requires a specific key format
    const syncKey = `sblix_party_v1_${partyCode.toLowerCase().trim()}`;
    const url = `https://api.keyvalue.xyz/${syncKey}`;
    
    try {
      setIsSyncing(true);
      
      const response = await fetch(url);
      let cloudData: any = null;
      
      if (response.ok) {
        const text = await response.text();
        try {
          cloudData = JSON.parse(text);
        } catch (e) {
          // Key doesn't exist yet or is empty
        }
      }

      if (cloudData) {
        // Merge messages: Keep unique IDs, sort by time
        setMessages(prev => {
          const msgMap = new Map(prev.map(m => [m.id, m]));
          (cloudData.messages || []).forEach((m: ChatMessage) => msgMap.set(m.id, m));
          const merged = Array.from(msgMap.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-100);
          return merged;
        });

        // Merge users
        setUsers(prev => {
          const userMap = new Map(prev.map(u => [u.id, u]));
          (cloudData.users || []).forEach((u: User) => {
            const existing = userMap.get(u.id);
            // Update user if credits changed or they are new
            if (!existing || u.credits !== existing.credits) {
              userMap.set(u.id, u);
            }
          });
          return Array.from(userMap.values());
        });

        // Update Game State if cloud is newer
        if (cloudData.updatedAt > lastSyncedAtRef.current) {
          if (cloudData.userBets) {
            setUserBets(prev => {
              const betMap = new Map(prev.map(b => [b.id, b]));
              cloudData.userBets.forEach((b: UserBet) => betMap.set(b.id, b));
              return Array.from(betMap.values());
            });
          }
          if (cloudData.gameState) setGameState(cloudData.gameState);
          lastSyncedAtRef.current = cloudData.updatedAt;
        }
      }

      // If we are pushing (after sending a message or placing a bet)
      if (push) {
        const payload = {
          users: stateRef.current.users,
          userBets: stateRef.current.userBets,
          messages: stateRef.current.messages.slice(-60), // Keep cloud payload light
          gameState: stateRef.current.gameState,
          updatedAt: Date.now()
        };
        await fetch(url, { 
          method: 'POST', 
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      console.warn("Cloud Sync interrupted:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [partyCode]);

  useEffect(() => {
    // Initialize session from LocalStorage
    const savedCode = localStorage.getItem('sb_party_code');
    const savedUser = localStorage.getItem('sb_current_user');
    
    // Check URL params for a room code (sharing feature)
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');

    if (roomFromUrl) {
      setPartyCode(roomFromUrl.toUpperCase());
      setLoginPartyCode(roomFromUrl.toUpperCase());
    } else if (savedCode) {
      setPartyCode(savedCode);
    }

    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser && parsedUser.id && parsedUser.username) {
          setCurrentUser(parsedUser);
        }
      } catch (e) {}
    }

    // Load initial messages/users to avoid flickering
    const savedUsers = localStorage.getItem('sb_users');
    const savedMessages = localStorage.getItem('sb_messages');
    try {
      if (savedUsers) setUsers(JSON.parse(savedUsers));
      if (savedMessages) setMessages(JSON.parse(savedMessages));
    } catch (e) {}

    // Initial Sync
    setTimeout(() => syncWithCloud(false), 500);

    // Continuous Sync Loop
    const interval = setInterval(() => syncWithCloud(false), 4000);
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginRealName.trim()) return;
    
    const code = loginPartyCode.trim().toUpperCase() || 'LOCAL';
    setPartyCode(code);
    
    // Check if user already exists in local list
    const existingUser = users.find(u => u.username.toLowerCase() === loginUsername.toLowerCase());
    
    if (existingUser) {
      setCurrentUser(existingUser);
    } else {
      const newUser: User = { 
        id: generateId(), 
        username: loginUsername.trim(), 
        realName: loginRealName.trim(), 
        avatar: selectedAvatar, 
        credits: 0 
      };
      setUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
    }
    
    // Force a push to cloud immediately after login
    setTimeout(() => syncWithCloud(true), 500);
  };

  const logout = () => {
    if (confirm("Logout? Your data is saved on this device.")) {
      setCurrentUser(null);
      localStorage.removeItem('sb_current_user');
    }
  };

  const sendMessage = (text: string) => {
    if (!currentUser) return;
    const newMsg: ChatMessage = { 
      id: generateId(), 
      userId: currentUser.id, 
      username: currentUser.username, 
      text, 
      timestamp: Date.now() 
    };
    setMessages(prev => [...prev, newMsg]);
    
    // Push to cloud immediately
    syncWithCloud(true);
    
    // Random AI interaction
    if (Math.random() > 0.6) {
      setTimeout(() => triggerAICommentary(), 1500);
    }
  };

  const triggerAICommentary = async () => {
    const sortedUsers = [...stateRef.current.users].sort((a, b) => (b.credits || 0) - (a.credits || 0));
    const commentary = await getAICommentary(stateRef.current.messages, stateRef.current.gameState, sortedUsers);
    
    const aiMsg: ChatMessage = { 
      id: generateId(), 
      userId: 'ai-bot', 
      username: 'Gerry the Gambler', 
      text: commentary, 
      timestamp: Date.now(), 
      isAI: true 
    };
    
    setMessages(prev => [...prev, aiMsg]);
    syncWithCloud(true);
  };

  const handleCopyLink = () => {
    const shareUrl = partyCode ? `${window.location.origin}${window.location.pathname}?room=${partyCode}` : window.location.href;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!currentUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 nfl-gradient overflow-y-auto">
        <div className="max-w-md w-full glass-card p-8 rounded-[2.5rem] shadow-2xl border-white/20 my-auto animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-4 shadow-2xl rotate-3 border-4 border-red-600">
              <i className="fas fa-football-ball text-red-600 text-4xl"></i>
            </div>
            <h1 className="text-3xl font-black font-orbitron tracking-tighter uppercase leading-none">
              SB LIX <span className="text-red-500 block text-xl tracking-widest mt-1">PARTY HUB</span>
            </h1>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-4 opacity-60">
              PREGAME • LIVE STATS • PROP BETS
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block ml-1">Choose Mascot</label>
              <div className="flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-4 rounded-2xl bg-black/40 border border-white/5 custom-scrollbar shadow-inner">
                {AVATARS.map(a => (
                  <button 
                    key={a} 
                    type="button" 
                    onClick={() => setSelectedAvatar(a)} 
                    className={`w-11 h-11 text-2xl flex items-center justify-center rounded-xl transition-all active:scale-90 ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800 hover:bg-slate-700'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 ml-1 block">Handle</label>
                  <input type="text" placeholder="e.g. Champ" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-sm outline-none focus:border-blue-500 font-bold text-center placeholder:text-slate-700 shadow-inner" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 ml-1 block">Party Code</label>
                  <input type="text" placeholder="Optional" maxLength={10} value={loginPartyCode} onChange={(e) => setLoginPartyCode(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-sm outline-none focus:border-red-500 font-bold text-center placeholder:text-slate-700 shadow-inner" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 ml-1 block">Real Name</label>
                <input type="text" placeholder="John D." value={loginRealName} onChange={(e) => setLoginRealName(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-sm outline-none focus:border-red-500 font-bold text-center placeholder:text-slate-700 shadow-inner" />
              </div>
              <button type="submit" disabled={!loginUsername.trim() || !loginRealName.trim()} className="w-full py-5 bg-white text-slate-950 rounded-[1.5rem] font-black font-orbitron hover:bg-slate-200 transition-all shadow-2xl uppercase tracking-widest text-sm disabled:opacity-30 active:scale-95 mt-2">
                ENTER HUB
              </button>
            </div>
          </form>

          <div className="mt-10 pt-6 border-t border-white/5 flex flex-col gap-4 text-center">
             <button onClick={handleCopyLink} className="text-[11px] text-slate-300 uppercase font-black hover:text-white flex items-center justify-center gap-2 transition-colors">
                <i className="fas fa-link text-blue-400"></i> {copied ? 'Link Copied!' : 'Invite Guests'}
             </button>
             <p className="text-[9px] text-slate-600 uppercase font-black tracking-widest leading-relaxed">
               Syncing 20+ Guests Live<br/>
               <span className="text-green-500/50">Cloud Database Connected</span>
             </p>
          </div>
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
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px]">
              <span className="font-orbitron font-bold text-slate-200 uppercase tracking-tighter">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
            </div>
            {partyCode && partyCode !== 'LOCAL' && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[8px] font-black uppercase transition-all ${isSyncing ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-green-600/10 border-green-500/20 text-green-500'}`}>
                <div className={`w-1 h-1 rounded-full ${isSyncing ? 'bg-blue-400 animate-pulse' : 'bg-green-500'}`}></div>
                {partyCode}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[11px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 ${(currentUser?.credits || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(currentUser?.credits || 0)} PTS
            </div>
            <button onClick={logout} className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700 text-lg hover:bg-slate-700 transition-colors">
              {currentUser?.avatar}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="h-full container mx-auto">
           {activeTab === 'bets' && <BettingPanel propBets={propBets} user={currentUser} onPlaceBet={(bid, amt, sel) => {
              const nb: UserBet = { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
              setUserBets(p => [...p, nb]);
              setTimeout(() => syncWithCloud(true), 200);
           }} allBets={userBets} onResolveBet={(bid, win) => {
              setPropBets(p => p.map(pb => pb.id === bid ? { ...pb, resolved: true, outcome: win } : pb));
              setUsers(uList => uList.map(u => {
                const b = stateRef.current.userBets.find(ub => ub.betId === bid && ub.userId === u.id);
                if (b) return { ...u, credits: (u.credits || 0) + (b.selection === win ? 10 : -3) };
                return u;
              }));
              setUserBets(ubList => ubList.map(ub => ub.betId === bid ? { ...ub, status: ub.selection === win ? BetStatus.WON : BetStatus.LOST } : ub));
              setTimeout(() => syncWithCloud(true), 200);
           }} />}
           {activeTab === 'chat' && <ChatRoom user={currentUser} messages={messages} onSendMessage={sendMessage} users={users} />}
           {activeTab === 'leaderboard' && <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="container mx-auto flex">
          {[
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rankings' }
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-4 text-[9px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1.5 ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}>
              <i className={`fas ${tab.icon} text-lg`}></i>
              {tab.label}
              {activeTab === tab.id && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default App;