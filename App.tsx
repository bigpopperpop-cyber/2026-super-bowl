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

  // Ref to track state without closure issues
  const stateRef = useRef({ users, userBets, messages, propBets, gameState });

  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, gameState };
    
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
    const url = `https://api.keyvalue.xyz/sbp_${partyCode.toLowerCase()}/state`;
    
    try {
      setIsSyncing(true);
      
      // If pushing, we actually want to FETCH first to merge and prevent overwriting others
      let cloudData: any = null;
      if (push) {
        const preFetch = await fetch(url);
        if (preFetch.ok) cloudData = await preFetch.json();
      } else {
        const response = await fetch(url);
        if (response.ok) cloudData = await response.json();
      }

      if (cloudData) {
        // ALWAYS merge messages by ID, regardless of overall timestamp
        // This is the key to multi-user chat working
        setMessages(prev => {
          const msgMap = new Map(prev.map(m => [m.id, m]));
          (cloudData.messages || []).forEach((m: ChatMessage) => msgMap.set(m.id, m));
          return Array.from(msgMap.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-100);
        });

        // Merge users and credits
        setUsers(prev => {
          const userMap = new Map(prev.map(u => [u.id, u]));
          (cloudData.users || []).forEach((u: User) => {
            const existing = userMap.get(u.id);
            if (!existing || (u.credits !== existing.credits)) userMap.set(u.id, u);
          });
          return Array.from(userMap.values());
        });

        // Other state updates (Game state, Props) only if cloud is actually newer
        if (cloudData.updatedAt > lastSyncedAt || push) {
          if (cloudData.userBets) {
            setUserBets(prev => {
              const betMap = new Map(prev.map(b => [b.id, b]));
              cloudData.userBets.forEach((b: UserBet) => betMap.set(b.id, b));
              return Array.from(betMap.values());
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
        }
        setLastSyncedAt(cloudData.updatedAt || Date.now());
      }

      if (push) {
        // Wait a micro-task for states to settle before pushing the merged result
        setTimeout(async () => {
          const payload = {
            users: stateRef.current.users,
            userBets: stateRef.current.userBets,
            messages: stateRef.current.messages.slice(-50),
            propBets: stateRef.current.propBets,
            gameState: stateRef.current.gameState,
            updatedAt: Date.now()
          };
          await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        }, 50);
      }

    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [partyCode, lastSyncedAt]);

  useEffect(() => {
    const savedCode = localStorage.getItem('sb_party_code');
    const savedUser = localStorage.getItem('sb_current_user');
    if (savedCode) setPartyCode(savedCode);
    if (savedUser) setCurrentUser(JSON.parse(savedUser));

    const interval = setInterval(() => syncWithCloud(false), 3000);
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginRealName.trim()) return;
    const code = loginPartyCode.trim().toUpperCase() || 'LOCAL';
    setPartyCode(code);
    const existingUser = users.find(u => u.username.toLowerCase() === loginUsername.toLowerCase());
    if (existingUser) {
      setCurrentUser(existingUser);
    } else {
      const newUser: User = { id: crypto.randomUUID(), username: loginUsername.trim(), realName: loginRealName.trim(), avatar: selectedAvatar, credits: 0 };
      setUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
    }
    setTimeout(() => syncWithCloud(true), 200);
  };

  const sendMessage = (text: string) => {
    if (!currentUser) return;
    const newMsg: ChatMessage = { id: crypto.randomUUID(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
    setMessages(prev => [...prev, newMsg]);
    // Immediate push trigger
    syncWithCloud(true);
    if (Math.random() > 0.4) setTimeout(() => triggerAICommentary(), 2000);
  };

  const triggerAICommentary = async () => {
    const sortedUsers = [...users].sort((a, b) => (b.credits || 0) - (a.credits || 0));
    const commentary = await getAICommentary(messages, gameState, sortedUsers);
    const aiMsg: ChatMessage = { id: crypto.randomUUID(), userId: 'ai-bot', username: 'Gerry the Gambler', text: commentary, timestamp: Date.now(), isAI: true };
    setMessages(prev => [...prev, aiMsg]);
    syncWithCloud(true);
  };

  const clearSession = () => { if (confirm("Clear session?")) { localStorage.clear(); window.location.reload(); } };
  const handleCopyLink = () => {
    const shareUrl = partyCode ? `${window.location.origin}${window.location.pathname}?room=${partyCode}` : window.location.href;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!currentUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 nfl-gradient overflow-y-auto">
        <div className="max-w-md w-full glass-card p-6 rounded-[2rem] shadow-2xl border-white/20 my-auto">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-xl rotate-3">
              <i className="fas fa-football-ball text-red-600 text-3xl"></i>
            </div>
            <h1 className="text-2xl font-black font-orbitron tracking-tighter uppercase">SB LIX <span className="text-red-500">Party</span></h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">Real-time Multi-user Sync Enabled</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-3 rounded-2xl bg-black/40 border border-white/5">
              {AVATARS.map(a => (
                <button key={a} type="button" onClick={() => setSelectedAvatar(a)} className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl transition-all ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800'}`}>{a}</button>
              ))}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Handle" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 font-bold text-center" />
                <input type="text" placeholder="Party Code" maxLength={10} value={loginPartyCode} onChange={(e) => setLoginPartyCode(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500 font-bold text-center" />
              </div>
              <input type="text" placeholder="Real Name (e.g. Mike J.)" value={loginRealName} onChange={(e) => setLoginRealName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500 font-bold text-center" />
              <button type="submit" disabled={!loginUsername.trim() || !loginRealName.trim()} className="w-full py-4 bg-white text-slate-950 rounded-xl font-black hover:bg-slate-200 transition-all shadow-xl uppercase tracking-widest text-sm disabled:opacity-50">JOIN GAME</button>
            </div>
          </form>
          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col gap-3 text-center">
             <button onClick={handleCopyLink} className="text-[10px] text-slate-400 uppercase font-black hover:text-white flex items-center justify-center gap-2">
                <i className="fas fa-link"></i> {copied ? 'Copied Link!' : 'Invite Friends'}
             </button>
             <button onClick={clearSession} className="text-[9px] text-slate-600 uppercase font-black">Reset Data</button>
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
              <span className="font-orbitron font-bold text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-500 font-bold">{gameState.score.home}-{gameState.score.away}</span>
            </div>
            {partyCode && partyCode !== 'LOCAL' && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[8px] font-black uppercase transition-all ${isSyncing ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-green-600/10 border-green-500/20 text-green-500'}`}>
                <div className={`w-1 h-1 rounded-full ${isSyncing ? 'bg-blue-400 animate-ping' : 'bg-green-500'}`}></div>
                {partyCode}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[11px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 ${currentUser.credits >= 0 ? 'text-green-400' : 'text-red-400'}`}>{currentUser.credits} PTS</div>
            <div className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700 text-lg">{currentUser.avatar}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="h-full container mx-auto">
           {activeTab === 'bets' && <BettingPanel propBets={propBets} user={currentUser} onPlaceBet={(bid, amt, sel) => {
              const nb: UserBet = { id: crypto.randomUUID(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
              setUserBets(p => [...p, nb]);
              syncWithCloud(true);
           }} allBets={userBets} onResolveBet={(bid, win) => {
              setPropBets(p => p.map(pb => pb.id === bid ? { ...pb, resolved: true, outcome: win } : pb));
              setUsers(uList => uList.map(u => {
                const b = userBets.find(ub => ub.betId === bid && ub.userId === u.id);
                if (b) return { ...u, credits: u.credits + (b.selection === win ? 10 : -3) };
                return u;
              }));
              setUserBets(ubList => ubList.map(ub => ub.betId === bid ? { ...ub, status: ub.selection === win ? BetStatus.WON : BetStatus.LOST } : ub));
              syncWithCloud(true);
           }} />}
           {activeTab === 'chat' && <ChatRoom user={currentUser} messages={messages} onSendMessage={sendMessage} />}
           {activeTab === 'leaderboard' && <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe">
        <div className="container mx-auto flex">
          {[
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' }
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-3 text-[9px] font-black uppercase transition-all flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}>
              <i className={`fas ${tab.icon} text-lg mb-0.5`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default App;