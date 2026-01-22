
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
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [globalResetActive, setGlobalResetActive] = useState(false);
  
  const lastSyncedAtRef = useRef<number>(0);
  const resetEpochRef = useRef<number>(parseInt(localStorage.getItem('sb_reset_epoch') || '0'));
  const ignorePushesUntilRef = useRef<number>(0);

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

  const stateRef = useRef({ users, userBets, messages, propBets, gameState, partyCode, currentUser });

  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, gameState, partyCode, currentUser };
  }, [users, userBets, messages, propBets, gameState, partyCode, currentUser]);

  useEffect(() => {
    if (currentUser) localStorage.setItem('sb_current_user', JSON.stringify(currentUser));
    if (partyCode) localStorage.setItem('sb_party_code', partyCode);
    localStorage.setItem('sb_reset_epoch', resetEpochRef.current.toString());
  }, [currentUser, partyCode]);

  const mergeState = useCallback((cloudData: any) => {
    if (!cloudData) return;

    // 1. HARD RESET CHECK: Use an Epoch (Timestamp) instead of SessionID for better reliability
    const cloudResetEpoch = cloudData.resetEpoch || 0;
    if (cloudResetEpoch > resetEpochRef.current) {
      console.log("!!! SYSTEM REFRESH DETECTED !!!");
      setGlobalResetActive(true);
      
      setMessages([]);
      setUserBets([]);
      setPropBets(INITIAL_PROP_BETS.map(pb => ({ ...pb, resolved: false, outcome: undefined })));
      
      if (currentUser) {
        setCurrentUser(prev => prev ? { ...prev, credits: 0 } : null);
        setUsers(prev => prev.length > 0 ? [{ ...prev[0], credits: 0 }] : []);
      }

      resetEpochRef.current = cloudResetEpoch;
      localStorage.setItem('sb_reset_epoch', cloudResetEpoch.toString());
      lastSyncedAtRef.current = cloudData.updatedAt || Date.now();
      
      setTimeout(() => setGlobalResetActive(false), 3000);
      return;
    }

    // 2. USER SYNC: Deduplicate and update credits
    setUsers(prev => {
      // Fix: Explicitly type the userMap to avoid 'unknown' property access errors.
      const userMap = new Map<string, User>(prev.map(u => [u.id, u]));
      (cloudData.users || []).forEach((u: User) => {
        const existing = userMap.get(u.id);
        if (!existing || u.credits !== existing.credits) {
          userMap.set(u.id, u);
        }
      });
      return Array.from(userMap.values());
    });

    // 3. CHAT SYNC: Deduplicate by ID
    setMessages(prev => {
      // Fix: Explicitly type the msgMap and sort parameters to avoid 'unknown' property access errors.
      const msgMap = new Map<string, ChatMessage>(prev.map(m => [m.id, m]));
      (cloudData.messages || []).forEach((m: ChatMessage) => msgMap.set(m.id, m));
      return Array.from(msgMap.values())
        .sort((a: ChatMessage, b: ChatMessage) => a.timestamp - b.timestamp)
        .slice(-80);
    });

    // 4. GAME & BET SYNC: Only if cloud data is newer
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
  }, [currentUser]);

  const syncWithCloud = useCallback(async (isPush: boolean = false) => {
    const code = stateRef.current.partyCode;
    if (!code || code === 'LOCAL') return;
    
    // Silence during/after nuke to let it propagate
    if (isPush && Date.now() < ignorePushesUntilRef.current) return;

    // Unique Room Key - V4 for clean start
    const syncKey = `sblix_party_v4_${code.toLowerCase().trim()}`;
    const url = `https://api.keyvalue.xyz/${syncKey}`;
    
    try {
      setIsSyncing(true);
      const response = await fetch(url);
      let remoteData: any = null;
      
      if (response.ok) {
        const text = await response.text();
        if (text && text.trim() !== "") {
          try {
            remoteData = JSON.parse(text);
            mergeState(remoteData);
          } catch (e) {}
        }
      }

      if (isPush || !remoteData) {
        // If we are pushing OR the room is brand new
        const payload = {
          resetEpoch: Math.max(resetEpochRef.current, remoteData?.resetEpoch || 0),
          users: Array.from(new Map([...(remoteData?.users || []), ...stateRef.current.users].map(u => [u.id, u])).values()),
          messages: Array.from(new Map([...(remoteData?.messages || []), ...stateRef.current.messages].map(m => [m.id, m])).values())
            .sort((a: any, b: any) => a.timestamp - b.timestamp)
            .slice(-60),
          userBets: Array.from(new Map([...(remoteData?.userBets || []), ...stateRef.current.userBets].map(b => [b.id, b])).values()),
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
      console.warn("Sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [mergeState]);

  const nukeRoom = async () => {
    if (!partyCode || partyCode === 'LOCAL') return;
    if (!confirm(`☢️ NUKE ROOM "${partyCode}"?\n\nThis wipes all 20+ guests, scores, and chat immediately.`)) return;

    try {
      setIsSyncing(true);
      const syncKey = `sblix_party_v4_${partyCode.toLowerCase().trim()}`;
      const url = `https://api.keyvalue.xyz/${syncKey}`;
      
      const newEpoch = Date.now();
      
      const payload = {
        resetEpoch: newEpoch,
        users: currentUser ? [{ ...currentUser, credits: 0 }] : [],
        messages: [],
        userBets: [],
        gameState: { quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home' },
        updatedAt: Date.now()
      };

      // Atomic wipe attempt
      const res = await fetch(url, { 
        method: 'POST', 
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error("Could not reach cloud server.");
      
      ignorePushesUntilRef.current = Date.now() + 3000;
      resetEpochRef.current = newEpoch;
      localStorage.setItem('sb_reset_epoch', newEpoch.toString());
      
      setMessages([]);
      setUserBets([]);
      if (currentUser) {
        const resetUser = { ...currentUser, credits: 0 };
        setCurrentUser(resetUser);
        setUsers([resetUser]);
      }
      setPropBets(INITIAL_PROP_BETS.map(pb => ({ ...pb, resolved: false, outcome: undefined })));
      setShowHostPanel(false);
      
      alert("✅ Hub reset. It's now a clean field!");
    } catch (e) {
      alert("❌ Reset failed. Please check your connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  const updateGameScore = (team: 'home' | 'away', change: number) => {
    setGameState(prev => ({ ...prev, score: { ...prev.score, [team]: Math.max(0, prev.score[team] + change) } }));
    setTimeout(() => syncWithCloud(true), 100);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    const savedCode = localStorage.getItem('sb_party_code');
    const savedUser = localStorage.getItem('sb_current_user');

    if (roomFromUrl) {
      setPartyCode(roomFromUrl.toUpperCase());
      setLoginPartyCode(roomFromUrl.toUpperCase());
    } else if (savedCode) {
      setPartyCode(savedCode);
      setLoginPartyCode(savedCode);
    }

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed?.id) setCurrentUser(parsed);
      } catch (e) {}
    }

    // Jittered polling to prevent synchronized "herd" requests from 20 devices
    const jitter = Math.random() * 800;
    const interval = setInterval(() => syncWithCloud(false), 2000 + jitter);
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginRealName.trim() || !loginPartyCode.trim()) {
      alert("Please enter a username, real name, and Room Code!");
      return;
    }
    
    const code = loginPartyCode.trim().toUpperCase();
    setPartyCode(code);
    
    const newUser: User = { 
      id: generateId(), 
      username: loginUsername.trim(), 
      realName: loginRealName.trim(), 
      avatar: selectedAvatar, 
      credits: 0 
    };
    
    setUsers([newUser]);
    setCurrentUser(newUser);
    
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + code;
    window.history.pushState({ path: newUrl }, '', newUrl);
    
    // Immediate push to claim/join room
    setTimeout(() => syncWithCloud(true), 300);
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
    
    if (Math.random() > 0.75) setTimeout(() => triggerAICommentary(), 1500);
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
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
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
              <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block ml-1">Choose Mascot</label>
              <div className="flex flex-wrap gap-2 justify-center p-3 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
                {AVATARS.map(a => (
                  <button key={a} type="button" onClick={() => setSelectedAvatar(a)} className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl transition-all ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800'}`}>{a}</button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Your Handle (e.g. TurboTom)" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-base outline-none font-bold" />
              <input type="text" placeholder="Real Name (e.g. John D.)" value={loginRealName} onChange={(e) => setLoginRealName(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-4 text-white text-base outline-none font-bold" />
              <div className="pt-2">
                <label className="text-[10px] font-black uppercase text-red-500 mb-1 block ml-1">Room Code (Required to join friends)</label>
                <input type="text" placeholder="E.G. SUPERBOWL2025" maxLength={15} value={loginPartyCode} onChange={(e) => setLoginPartyCode(e.target.value)} className="w-full bg-slate-950 border-2 border-red-900/50 rounded-2xl px-4 py-4 text-white text-xl outline-none text-center font-black font-orbitron tracking-widest uppercase" />
              </div>
              <button type="submit" disabled={!loginUsername.trim() || !loginRealName.trim() || !loginPartyCode.trim()} className="w-full py-5 bg-white text-slate-950 rounded-[1.5rem] font-black font-orbitron shadow-2xl uppercase tracking-widest text-sm disabled:opacity-30 active:scale-95 transition-all">ENTER PARTY</button>
            </div>
          </form>
          <div className="mt-8 text-center">
            <p className="text-slate-500 text-[11px] font-bold">ALL 20 GUESTS MUST USE THE SAME ROOM CODE</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      {/* GLOBAL RESET OVERLAY */}
      {globalResetActive && (
        <div className="fixed inset-0 z-[100] bg-red-600 flex items-center justify-center">
          <div className="text-center p-12 bg-black/60 backdrop-blur-2xl rounded-3xl border-4 border-white shadow-2xl animate-pulse">
            <i className="fas fa-sync-alt text-6xl text-white mb-6 animate-spin"></i>
            <h2 className="text-3xl font-black font-orbitron text-white">SYSTEM REFRESH</h2>
            <p className="text-white/80 font-bold uppercase tracking-widest mt-4">Host has cleared the game...</p>
          </div>
        </div>
      )}

      <header className="bg-slate-900 border-b border-slate-800 p-3 shrink-0 z-40 shadow-xl">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black font-orbitron text-red-600">SBLIX</h1>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px]">
              <span className="font-orbitron font-bold text-slate-200 uppercase">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-950/50 px-2 py-1 rounded-md">
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-blue-400 animate-pulse' : 'bg-green-500'}`}></div>
              <span className="text-[9px] font-black text-slate-600 uppercase">{users.length} ON</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[11px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 ${(currentUser?.credits || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(currentUser?.credits || 0)} PTS
            </div>
            <button onClick={() => setShowHostPanel(true)} className="flex items-center gap-1.5 bg-red-600 text-white border border-red-500 rounded-lg px-3 py-1.5 shadow-lg active:scale-95 transition-all">
              <i className="fas fa-crown text-[10px]"></i>
              <span className="text-[10px] font-black uppercase tracking-tighter">HOST</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
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

        {showHostPanel && (
          <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-3xl animate-in fade-in slide-in-from-right duration-300">
            <div className="h-full flex flex-col p-6 max-w-lg mx-auto overflow-y-auto">
              <div className="flex justify-between items-center mb-8 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white text-xl shadow-xl shadow-red-600/20">
                    <i className="fas fa-crown"></i>
                  </div>
                  <div>
                    <h2 className="text-2xl font-black font-orbitron text-white">HUB CONTROL</h2>
                    <p className="text-[11px] text-red-500 font-black uppercase tracking-widest">Active Room: {partyCode}</p>
                  </div>
                </div>
                <button onClick={() => setShowHostPanel(false)} className="text-slate-500 hover:text-white p-2">
                  <i className="fas fa-times text-3xl"></i>
                </button>
              </div>

              <div className="space-y-8">
                {/* Score Controls */}
                <div className="glass-card p-6 rounded-[2rem] border-white/10">
                  <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest mb-4">Update Room Score</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3 text-center">
                      <div className="font-orbitron text-5xl font-black text-white">{gameState.score.home}</div>
                      <div className="flex gap-2">
                        <button onClick={() => updateGameScore('home', -1)} className="flex-1 bg-slate-800 p-4 rounded-xl text-slate-400 font-black text-xl">-</button>
                        <button onClick={() => updateGameScore('home', 1)} className="flex-1 bg-red-600 p-4 rounded-xl text-white font-black text-xl shadow-lg shadow-red-600/20">+</button>
                      </div>
                      <div className="text-[10px] font-black text-slate-500 uppercase">Home Team</div>
                    </div>
                    <div className="space-y-3 text-center">
                      <div className="font-orbitron text-5xl font-black text-white">{gameState.score.away}</div>
                      <div className="flex gap-2">
                        <button onClick={() => updateGameScore('away', -1)} className="flex-1 bg-slate-800 p-4 rounded-xl text-slate-400 font-black text-xl">-</button>
                        <button onClick={() => updateGameScore('away', 1)} className="flex-1 bg-red-600 p-4 rounded-xl text-white font-black text-xl shadow-lg shadow-red-600/20">+</button>
                      </div>
                      <div className="text-[10px] font-black text-slate-500 uppercase">Away Team</div>
                    </div>
                  </div>
                </div>

                {/* Session Reset */}
                <div className="glass-card p-6 rounded-[2rem] border-red-900/40 bg-red-950/20">
                  <h3 className="text-[11px] font-black uppercase text-red-500 tracking-widest mb-4 flex items-center gap-2">
                    <i className="fas fa-bomb"></i>
                    Global Reset Tools
                  </h3>
                  <div className="space-y-5">
                    <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/5">
                      <div className="text-[10px] font-bold text-slate-500 mb-1 uppercase">Direct Join Link</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 truncate flex-1">{window.location.origin}/?room={partyCode}</span>
                        <button onClick={handleCopyLink} className="bg-blue-600 px-4 py-2 rounded-xl text-white text-[10px] font-black uppercase transition-all active:scale-90">{copied ? 'COPIED' : 'COPY'}</button>
                      </div>
                    </div>
                    
                    <button 
                      onClick={nukeRoom} 
                      className="w-full py-6 bg-red-600 border-2 border-red-400 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_30px_rgba(220,38,38,0.5)] flex flex-col items-center justify-center"
                    >
                      <span className="text-lg">CLEAR EVERYTHING</span>
                      <span className="text-[9px] text-red-100 font-bold">Wipes chat and players for all 20 devices</span>
                    </button>
                    <p className="text-[10px] text-slate-500 text-center font-bold px-4 leading-relaxed">
                      Use this if the room gets messy. All connected devices will instantly see a clean chat and leaderboard.
                    </p>
                  </div>
                </div>

                <div className="pt-8 border-t border-white/5 flex flex-col gap-4">
                  <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-5 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs border border-slate-700 active:scale-95 transition-all">
                    LOG OUT / CHANGE AVATAR
                  </button>
                </div>
              </div>
              <div className="h-20"></div>
            </div>
          </div>
        )}
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
