import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';

type TabType = 'bets' | 'chat' | 'leaderboard';

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
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);
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

  // Use a Ref to hold the absolute latest state to avoid stale closures in sync loops
  const stateRef = useRef({
    users,
    userBets,
    messages,
    propBets,
    gameState,
    updatedAt: Date.now()
  });

  // Keep Ref updated on every state change
  useEffect(() => {
    stateRef.current = {
      users,
      userBets,
      messages,
      propBets,
      gameState,
      updatedAt: Date.now()
    };
    
    // Persist to local storage
    localStorage.setItem('sb_users', JSON.stringify(users));
    localStorage.setItem('sb_bets', JSON.stringify(userBets));
    localStorage.setItem('sb_messages', JSON.stringify(messages));
    localStorage.setItem('sb_props', JSON.stringify(propBets));
    localStorage.setItem('sb_gamestate', JSON.stringify(gameState));
    localStorage.setItem('sb_party_code', partyCode);
    if (currentUser) localStorage.setItem('sb_current_user', JSON.stringify(currentUser));
  }, [users, userBets, messages, propBets, gameState, partyCode, currentUser]);

  const syncWithCloud = useCallback(async (push: boolean = false) => {
    if (!partyCode || partyCode === 'LOCAL') return;
    
    // We use a specific, reliable path for the party code
    const url = `https://api.keyvalue.xyz/sbp_${partyCode.toLowerCase()}/state`;
    
    try {
      setIsSyncing(true);
      if (push) {
        // Push the latest data from the Ref (ensures no stale data)
        const payload = {
          ...stateRef.current,
          // Cap messages to 50 for performance and to stay within free KV limits
          messages: stateRef.current.messages.slice(-50),
          updatedAt: Date.now()
        };
        await fetch(url, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setLastSyncedAt(Date.now());
      } else {
        const response = await fetch(url);
        if (response.ok) {
          const cloudData = await response.json();
          // Only merge if the cloud has a newer timestamp OR we haven't synced yet
          if (cloudData && (cloudData.updatedAt > lastSyncedAt || lastSyncedAt === 0)) {
            
            // Merging logic: Use IDs to prevent duplicates
            if (cloudData.users) {
              setUsers(prev => {
                const userMap = new Map(prev.map(u => [u.id, u]));
                cloudData.users.forEach((u: User) => {
                  const existing = userMap.get(u.id);
                  if (!existing || (u.credits !== existing.credits)) userMap.set(u.id, u);
                });
                return Array.from(userMap.values());
              });
            }
            
            if (cloudData.userBets) {
              setUserBets(prev => {
                const betMap = new Map(prev.map(b => [b.id, b]));
                cloudData.userBets.forEach((b: UserBet) => betMap.set(b.id, b));
                return Array.from(betMap.values());
              });
            }

            if (cloudData.messages) {
              setMessages(prev => {
                const msgMap = new Map(prev.map(m => [m.id, m]));
                cloudData.messages.forEach((m: ChatMessage) => msgMap.set(m.id, m));
                return Array.from(msgMap.values())
                  .sort((a, b) => a.timestamp - b.timestamp)
                  .slice(-100); // Keep local buffer healthy
              });
            }

            if (cloudData.propBets) {
              setPropBets(prev => {
                const propMap = new Map(prev.map(p => [p.id, p]));
                cloudData.propBets.forEach((p: PropBet) => {
                  if (p.resolved) propMap.set(p.id, p);
                });
                return Array.from(propMap.values());
              });
            }

            if (cloudData.gameState) setGameState(cloudData.gameState);
            setLastSyncedAt(cloudData.updatedAt || Date.now());
          }
        }
      }
    } catch (e) {
      console.warn("Cloud Sync issue:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [partyCode, lastSyncedAt]);

  // Initial Poll and Load
  useEffect(() => {
    const savedCode = localStorage.getItem('sb_party_code');
    const savedUser = localStorage.getItem('sb_current_user');
    
    if (savedCode) setPartyCode(savedCode);
    if (savedUser) setCurrentUser(JSON.parse(savedUser));

    const interval = setInterval(() => syncWithCloud(false), 3500); // Slightly faster polling
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  const handleCopyLink = () => {
    const shareUrl = partyCode 
      ? `${window.location.origin}${window.location.pathname}?room=${partyCode}` 
      : window.location.href;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginRealName.trim()) return;

    const code = loginPartyCode.trim().toUpperCase() || 'LOCAL';
    setPartyCode(code);

    const existingUser = users.find(u => u.username.toLowerCase() === loginUsername.toLowerCase());
    if (existingUser) {
      setCurrentUser(existingUser);
    } else {
      const newUser: User = {
        id: crypto.randomUUID(),
        username: loginUsername.trim(),
        realName: loginRealName.trim(),
        avatar: selectedAvatar,
        credits: 0 
      };
      setUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
    }
    
    // Instant sync trigger
    setTimeout(() => syncWithCloud(true), 200);
  };

  const clearSession = () => {
    if (confirm("Clear all game data for this device?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const exportData = () => {
    const data = JSON.stringify(stateRef.current, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sblix-backup-${partyCode || 'local'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const autoResolveAllPendingBets = () => {
    if (!confirm("The 3rd quarter has ended. Settle all pending props with simulated results?")) return;

    const newState: GameState = { ...gameState, quarter: 4, timeRemaining: "15:00" };
    setGameState(newState);

    const updatedProps = [...propBets];
    let updatedUserBets = [...userBets];
    let updatedUsers = [...users];

    updatedProps.forEach((bet) => {
      if (!bet.resolved) {
        const winningOption = bet.options[Math.floor(Math.random() * bet.options.length)];
        bet.resolved = true;
        bet.outcome = winningOption;

        updatedUserBets = updatedUserBets.map(ub => {
          if (ub.betId === bet.id && ub.status === BetStatus.PENDING) {
            const isWin = ub.selection === winningOption;
            const points = isWin ? 10 : -3;
            const uIdx = updatedUsers.findIndex(u => u.id === ub.userId);
            if (uIdx !== -1) {
              updatedUsers[uIdx] = { 
                ...updatedUsers[uIdx], 
                credits: (updatedUsers[uIdx].credits || 0) + points 
              };
            }
            return { ...ub, status: isWin ? BetStatus.WON : BetStatus.LOST };
          }
          return ub;
        });
      }
    });

    setPropBets(updatedProps);
    setUserBets(updatedUserBets);
    setUsers(updatedUsers);
    if (currentUser) {
      const freshUser = updatedUsers.find(u => u.id === currentUser.id);
      if (freshUser) setCurrentUser(freshUser);
    }
    triggerAICommentary(`The 3rd Quarter is OVER! All pending props have been simulated.`);
    setTimeout(() => syncWithCloud(true), 100);
  };

  const placeBet = (betId: string, amount: number, selection: string) => {
    if (!currentUser) return;
    const newBet: UserBet = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      betId,
      amount: 0,
      selection,
      status: BetStatus.PENDING,
      placedAt: Date.now()
    };
    setUserBets(prev => [...prev, newBet]);
    triggerAICommentary(`I just picked ${selection}! Let's go!`);
    setTimeout(() => syncWithCloud(true), 200);
  };

  const resolveBet = (betId: string, winningOption: string) => {
    setPropBets(prev => prev.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome: winningOption } : pb));
    const updatedUsers = [...users];
    const updatedUserBets = userBets.map(ub => {
      if (ub.betId === betId && ub.status === BetStatus.PENDING) {
        const isWin = ub.selection === winningOption;
        const points = isWin ? 10 : -3;
        const foundIdx = updatedUsers.findIndex(u => u.id === ub.userId);
        if (foundIdx !== -1) {
          updatedUsers[foundIdx] = { ...updatedUsers[foundIdx], credits: (updatedUsers[foundIdx].credits || 0) + points };
        }
        return { ...ub, status: isWin ? BetStatus.WON : BetStatus.LOST };
      }
      return ub;
    });
    setUsers(updatedUsers);
    setUserBets(updatedUserBets);
    if (currentUser) {
       const freshUser = updatedUsers.find(u => u.id === currentUser.id);
       if (freshUser) setCurrentUser(freshUser);
    }
    triggerAICommentary(`Bet result: ${winningOption}!`);
    setTimeout(() => syncWithCloud(true), 200);
  };

  const sendMessage = (text: string) => {
    if (!currentUser) return;
    const newMsg: ChatMessage = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      username: currentUser.username,
      text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newMsg]);
    // Immediate push
    setTimeout(() => syncWithCloud(true), 100);
    
    if (Math.random() > 0.4) {
      setTimeout(() => triggerAICommentary(text), 1500);
    }
  };

  const triggerAICommentary = async (context: string) => {
    const sortedUsers = [...users].sort((a, b) => (b.credits || 0) - (a.credits || 0));
    const commentary = await getAICommentary(messages, gameState, sortedUsers);
    const aiMsg: ChatMessage = {
      id: crypto.randomUUID(),
      userId: 'ai-bot',
      username: 'Gerry the Gambler',
      text: commentary,
      timestamp: Date.now(),
      isAI: true
    };
    setMessages(prev => [...prev, aiMsg]);
    setTimeout(() => syncWithCloud(true), 200);
  };

  if (!currentUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 nfl-gradient overflow-y-auto">
        <div className="max-w-md w-full glass-card p-6 rounded-[2rem] shadow-2xl border-white/20 my-auto">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-xl rotate-3">
              <i className="fas fa-football-ball text-red-600 text-3xl"></i>
            </div>
            <h1 className="text-2xl font-black font-orbitron tracking-tighter">SBLIX <span className="text-red-500">MASCOTS</span></h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">Pick Mascot & Join The Board</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-3 rounded-2xl bg-black/40 custom-scrollbar border border-white/5">
              {AVATARS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setSelectedAvatar(a)}
                  className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl transition-all active:scale-90 ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800'}`}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Chat Handle</label>
                  <input
                    type="text"
                    placeholder="e.g. King"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 font-bold text-center placeholder:text-slate-700 shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Party Code</label>
                  <input
                    type="text"
                    placeholder="6 Digits"
                    maxLength={10}
                    value={loginPartyCode}
                    onChange={(e) => setLoginPartyCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500 font-bold text-center placeholder:text-slate-700 shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Real Name (1st + Last Initial)</label>
                <input
                  type="text"
                  placeholder="e.g. John D."
                  value={loginRealName}
                  onChange={(e) => setLoginRealName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500 font-bold text-center placeholder:text-slate-700 shadow-inner"
                />
              </div>

              <button
                type="submit"
                disabled={!loginUsername.trim() || !loginRealName.trim()}
                className="w-full py-4 bg-white text-slate-950 rounded-xl font-black font-orbitron hover:bg-slate-200 transition-all shadow-xl active:scale-95 uppercase tracking-widest text-sm disabled:opacity-50"
              >
                JOIN THE PARTY
              </button>
              
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-2.5 bg-slate-800/50 text-slate-400 border border-slate-700 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {copied ? <><i className="fas fa-check text-green-400"></i> Copied!</> : <><i className="fas fa-link"></i> Copy Invite Link</>}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col gap-3 text-center">
            <button 
              onClick={exportData}
              className="text-[10px] text-blue-400 uppercase font-black hover:text-blue-300 flex items-center justify-center gap-2"
            >
              <i className="fas fa-download"></i> Export Party Data Backup
            </button>
            <button onClick={clearSession} className="text-[9px] text-slate-600 uppercase font-black hover:text-slate-400">
              Reset Session Data
            </button>
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
            <div className="flex bg-slate-950 rounded-lg px-2 py-1 items-center gap-1.5 border border-slate-800 text-[10px]">
              <span className="font-orbitron font-bold text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-500 font-bold">{gameState.score.home}-{gameState.score.away}</span>
            </div>
            {partyCode && partyCode !== 'LOCAL' && (
              <div 
                className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter border transition-all ${
                  isSyncing ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 animate-pulse' : 'bg-green-600/10 border-green-500/20 text-green-500'
                }`}
                title={`Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}`}
              >
                <i className={`fas ${isSyncing ? 'fa-sync-alt fa-spin' : 'fa-check'}`}></i>
                {partyCode}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className={`text-[11px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 ${(currentUser?.credits || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {currentUser?.credits || 0} PTS
            </div>
            <div className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700 text-lg">
              {currentUser?.avatar}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-0">
        <div className="h-full container mx-auto relative">
           {activeTab === 'bets' && (
             <BettingPanel 
                propBets={propBets} 
                user={currentUser} 
                onPlaceBet={placeBet}
                allBets={userBets}
                onResolveBet={resolveBet}
             />
           )}

           {activeTab === 'chat' && (
             <ChatRoom 
              user={currentUser} 
              messages={messages} 
              onSendMessage={sendMessage} 
             />
           )}

           {activeTab === 'leaderboard' && (
             <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
           )}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 shrink-0 pb-safe">
        <div className="container mx-auto flex">
          {[
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 py-3 text-[9px] font-black tracking-widest uppercase transition-all flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}
            >
              <i className={`fas ${tab.icon} text-lg mb-0.5 ${activeTab === tab.id ? 'text-red-500' : 'text-slate-600'}`}></i>
              {tab.label}
              {activeTab === tab.id && <div className="w-1 h-1 bg-red-500 rounded-full mt-0.5"></div>}
            </button>
          ))}
        </div>
      </nav>
      {/* Hidden button for host resolution testing or actual use */}
      {currentUser.username.toLowerCase() === 'host' && activeTab === 'bets' && (
        <button 
          onClick={autoResolveAllPendingBets}
          className="fixed bottom-24 right-4 w-12 h-12 bg-red-600 rounded-full shadow-2xl z-50 flex items-center justify-center text-white border-2 border-white/20"
        >
          <i className="fas fa-gavel"></i>
        </button>
      )}
    </div>
  );
};

export default App;