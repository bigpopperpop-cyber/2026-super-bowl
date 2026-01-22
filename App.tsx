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

  // Use refs to avoid stale closures in sync intervals
  const stateRef = useRef({ users, userBets, messages, propBets, gameState, partyCode });

  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, gameState, partyCode };
  }, [users, userBets, messages, propBets, gameState, partyCode]);

  // Persist local identity
  useEffect(() => {
    if (currentUser) localStorage.setItem('sb_current_user', JSON.stringify(currentUser));
    if (partyCode) localStorage.setItem('sb_party_code', partyCode);
  }, [currentUser, partyCode]);

  // Helper to merge remote state into local state
  const mergeState = useCallback((cloudData: any) => {
    if (!cloudData) return;

    // Detect a hard reset from cloud (empty arrays but newer timestamp)
    const isHardReset = cloudData.updatedAt > lastSyncedAtRef.current && 
                        (!cloudData.messages || cloudData.messages.length === 0) &&
                        (!cloudData.users || cloudData.users.length <= 1);

    setMessages(prev => {
      if (isHardReset) return [];
      const msgMap = new Map(prev.map(m => [m.id, m]));
      (cloudData.messages || []).forEach((m: ChatMessage) => msgMap.set(m.id, m));
      return Array.from(msgMap.values())
        .sort((a: ChatMessage, b: ChatMessage) => a.timestamp - b.timestamp)
        .slice(-100);
    });

    setUsers(prev => {
      if (isHardReset) {
        // Keep current user but clear others
        return currentUser ? [currentUser] : [];
      }
      const userMap = new Map(prev.map(u => [u.id, u]));
      (cloudData.users || []).forEach((u: User) => {
        const existing = userMap.get(u.id);
        if (!existing || u.credits !== existing.credits) {
          userMap.set(u.id, u);
        }
      });
      return Array.from(userMap.values());
    });

    if (cloudData.updatedAt > lastSyncedAtRef.current) {
      if (cloudData.userBets) {
        setUserBets(prev => {
          if (isHardReset) return [];
          const betMap = new Map(prev.map(b => [b.id, b]));
          cloudData.userBets.forEach((b: UserBet) => betMap.set(b.id, b));
          return Array.from(betMap.values());
        });
      }
      if (cloudData.gameState) setGameState(cloudData.gameState);
      lastSyncedAtRef.current = cloudData.updatedAt;
    }
  }, [currentUser]);

  const syncWithCloud = useCallback(async (isPush: boolean = false) => {
    const code = stateRef.current.partyCode;
    if (!code || code === 'LOCAL') return;
    
    const syncKey = `sblix_party_v2_${code.toLowerCase().trim()}`;
    const url = `https://api.keyvalue.xyz/${syncKey}`;
    
    try {
      setIsSyncing(true);
      
      const response = await fetch(url);
      let remoteData: any = null;
      
      if (response.ok) {
        const text = await response.text();
        try {
          remoteData = JSON.parse(text);
          mergeState(remoteData);
        } catch (e) {}
      }

      if (isPush) {
        const payload = {
          users: Array.from(new Map([...(remoteData?.users || []).map((u: any) => [u.id, u]), ...stateRef.current.users.map(u => [u.id, u])]).values()),
          messages: Array.from(new Map([...(remoteData?.messages || []).map((m: any) => [m.id, m]), ...stateRef.current.messages.map(m => [m.id, m])]).values())
            .sort((a: any, b: any) => a.timestamp - b.timestamp)
            .slice(-60),
          userBets: Array.from(new Map([...(remoteData?.userBets || []).map((b: any) => [b.id, b]), ...stateRef.current.userBets.map(b => [b.id, b])]).values()),
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
      console.warn("Sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [mergeState]);

  const resetRoom = async () => {
    if (!partyCode || partyCode === 'LOCAL') return;
    if (!confirm("⚠️ RESET HUB? This will clear all messages, bets, and players for EVERYONE in this room. This cannot be undone.")) return;

    try {
      setIsSyncing(true);
      const syncKey = `sblix_party_v2_${partyCode.toLowerCase().trim()}`;
      const url = `https://api.keyvalue.xyz/${syncKey}`;
      
      // Local Clear
      setMessages([]);
      setUserBets([]);
      if (currentUser) {
        const resetUser = { ...currentUser, credits: 0 };
        setCurrentUser(resetUser);
        setUsers([resetUser]);
      }

      // Cloud Wipe Payload
      const payload = {
        users: currentUser ? [{ ...currentUser, credits: 0 }] : [],
        messages: [],
        userBets: [],
        gameState: { quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home' },
        updatedAt: Date.now()
      };

      await fetch(url, { 
        method: 'POST', 
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });
      
      alert("Room has been reset. Fresh start!");
    } catch (e) {
      alert("Failed to reset room. Check connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    const savedCode = localStorage.getItem('sb_party_code');
    const savedUser = localStorage.getItem('sb_current_user');

    if (roomFromUrl) {
      setPartyCode(roomFromUrl.toUpperCase());
    } else if (savedCode) {
      setPartyCode(savedCode);
    }

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed?.id) setCurrentUser(parsed);
      } catch (e) {}
    }

    const interval = setInterval(() => syncWithCloud(false), 2000);
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginRealName.trim()) return;
    
    const code = loginPartyCode.trim().toUpperCase() || 'LOCAL';
    setPartyCode(code);
    
    const newUser: User = { 
      id: generateId(), 
      username: loginUsername.trim(), 
      realName: loginRealName.trim(), 
      avatar: selectedAvatar, 
      credits: 0 
    };
    
    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    
    if (code !== 'LOCAL') {
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + code;
      window.history.pushState({ path: newUrl }, '', newUrl);
    }
    
    setTimeout(() => syncWithCloud(true), 100);
  };

  const logout = () => {
    if (confirm("Logout? Your progress is saved on this device.")) {
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
    syncWithCloud(true);
    
    if (Math.random() > 0.7) setTimeout(() => triggerAICommentary(), 2000);
  };

  const triggerAICommentary = async () => {
    const sortedUsers = [...stateRef.current.users].sort((a: User, b: User) => (b.credits || 0) - (a.credits || 0));
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
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block ml-1">Mascot</label>
              <div className="flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-4 rounded-2xl bg-black/40 border border-white/5 custom-scrollbar shadow-inner">
                {AVATARS.map(a => (
                  <button key={a} type="button" onClick={() => setSelectedAvatar(a)} className={`w-11 h-11 text-2xl flex items-center justify-center rounded-xl transition-all ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800'}`}>{a}</button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Handle" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-sm outline-none text-center font-bold" />
                <input type="text" placeholder="Room Code" maxLength={10} value={loginPartyCode} onChange={(e) => setLoginPartyCode(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-sm outline-none text-center font-bold" />
              </div>
              <input type="text" placeholder="Real Name (e.g. John D.)" value={loginRealName} onChange={(e) => setLoginRealName(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-sm outline-none text-center font-bold" />
              <button type="submit" disabled={!loginUsername.trim() || !loginRealName.trim()} className="w-full py-5 bg-white text-slate-950 rounded-[1.5rem] font-black font-orbitron shadow-2xl uppercase tracking-widest text-sm disabled:opacity-30">ENTER HUB</button>
            </div>
          </form>
          <div className="mt-8 text-center">
            <button onClick={handleCopyLink} className="text-[11px] text-slate-300 uppercase font-black hover:text-white transition-colors">{copied ? 'Link Copied!' : 'Invite Guests'}</button>
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
              <span className="font-orbitron font-bold text-slate-200 uppercase">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
            </div>
            {partyCode && partyCode !== 'LOCAL' && (
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-md overflow-hidden">
                <div className={`flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase transition-all ${isSyncing ? 'text-blue-400' : 'text-green-500'}`}>
                  <div className={`w-1 h-1 rounded-full ${isSyncing ? 'bg-blue-400 animate-pulse' : 'bg-green-500'}`}></div>
                  {partyCode}
                </div>
                <button onClick={resetRoom} className="px-2 py-0.5 border-l border-slate-800 text-[8px] text-slate-600 hover:text-red-500 transition-colors bg-slate-900" title="Reset Room for Everyone">
                  <i className="fas fa-trash-alt"></i>
                </button>
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
              setTimeout(() => syncWithCloud(true), 100);
           }} allBets={userBets} onResolveBet={(bid, win) => {
              setPropBets(p => p.map(pb => pb.id === bid ? { ...pb, resolved: true, outcome: win } : pb));
              setUsers(uList => uList.map(u => {
                const b = stateRef.current.userBets.find(ub => ub.betId === bid && ub.userId === u.id);
                if (b) return { ...u, credits: (u.credits || 0) + (b.selection === win ? 10 : -3) };
                return u;
              }));
              setUserBets(ubList => ubList.map(ub => ub.betId === bid ? { ...ub, status: ub.selection === win ? BetStatus.WON : BetStatus.LOST } : ub));
              setTimeout(() => syncWithCloud(true), 100);
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