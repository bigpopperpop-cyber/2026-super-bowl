
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

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sb_user_v11');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [partyCode, setPartyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.toUpperCase() || 'SUPERBOWL_LIX_HUB';
  });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [globalResetActive, setGlobalResetActive] = useState(false);
  const [copied, setCopied] = useState(false);

  const [hostKeyInput, setHostKeyInput] = useState('');
  const [isHostAuthenticated, setIsHostAuthenticated] = useState(localStorage.getItem('sb_is_host') === 'true');

  const lastSyncedAtRef = useRef<number>(0);
  const resetEpochRef = useRef<number>(parseInt(localStorage.getItem('sb_reset_epoch_v11') || '0'));
  const ignorePushesUntilRef = useRef<number>(0);

  const [gameState, setGameState] = useState<GameState>({
    quarter: 1,
    timeRemaining: "15:00",
    score: { home: 0, away: 0 },
    possession: 'home'
  });

  // Track the most current state for the sync interval without triggering re-renders
  const stateRef = useRef({ users, userBets, messages, propBets, gameState, partyCode, currentUser });
  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, gameState, partyCode, currentUser };
    if (currentUser) {
      localStorage.setItem('sb_user_v11', JSON.stringify(currentUser));
      if (mode === 'LANDING') setMode('GAME');
    }
  }, [users, userBets, messages, propBets, gameState, partyCode, currentUser, mode]);

  const mergeState = useCallback((cloudData: any) => {
    if (!cloudData) return;

    // Handle Global Nukes/Resets
    const cloudResetEpoch = cloudData.resetEpoch || 0;
    if (cloudResetEpoch > resetEpochRef.current) {
      setGlobalResetActive(true);
      setMessages([]);
      setUserBets([]);
      setPropBets(INITIAL_PROP_BETS.map(pb => ({ ...pb, resolved: false, outcome: undefined })));
      resetEpochRef.current = cloudResetEpoch;
      localStorage.setItem('sb_reset_epoch_v11', cloudResetEpoch.toString());
      lastSyncedAtRef.current = cloudData.updatedAt || Date.now();
      setTimeout(() => setGlobalResetActive(false), 3000);
      return;
    }

    // Advanced User Merge: Combine cloud list with current local state
    setUsers(prev => {
      const userMap = new Map<string, User>();
      // 1. Start with cloud users
      (cloudData.users || []).forEach((u: User) => userMap.set(u.id, u));
      // 2. Overlay local users (keeps rosters consistent during lag)
      prev.forEach(u => userMap.set(u.id, u));
      // 3. Ensure "Me" is always present and updated
      if (stateRef.current.currentUser) {
        userMap.set(stateRef.current.currentUser.id, stateRef.current.currentUser);
      }
      return Array.from(userMap.values());
    });

    // Message Merge
    setMessages(prev => {
      const msgMap = new Map<string, ChatMessage>(prev.map(m => [m.id, m]));
      (cloudData.messages || []).forEach((m: ChatMessage) => msgMap.set(m.id, m));
      return Array.from(msgMap.values()).sort((a, b) => a.timestamp - b.timestamp).slice(-100);
    });

    // Sync Game-Wide Events (Scores, Resolutions)
    if (cloudData.updatedAt > lastSyncedAtRef.current) {
      if (cloudData.userBets) {
        setUserBets(prev => {
          const betMap = new Map<string, UserBet>(prev.map(b => [b.id, b]));
          cloudData.userBets.forEach((b: UserBet) => betMap.set(b.id, b));
          return Array.from(betMap.values());
        });
      }
      if (cloudData.gameState) setGameState(cloudData.gameState);
      if (cloudData.propBets) setPropBets(cloudData.propBets);
      lastSyncedAtRef.current = cloudData.updatedAt;
    }
  }, [currentUser]);

  const syncWithCloud = useCallback(async (forcePush: boolean = false) => {
    const code = stateRef.current.partyCode;
    if (!code) return;
    
    // Don't pull immediately after we nuke
    if (!forcePush && Date.now() < ignorePushesUntilRef.current) return;

    // Use a unique flat key for this specific room
    const cloudKey = `sblix_v11_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const url = `https://api.keyvalue.xyz/${cloudKey}`;
    
    try {
      setSyncStatus('syncing');
      
      // 1. PULL latest from cloud (with cache busting)
      const getRes = await fetch(`${url}?cb=${Date.now()}`);
      let remoteData: any = null;
      if (getRes.ok) {
        const text = await getRes.text();
        if (text && text !== "null" && text.trim()) {
          remoteData = JSON.parse(text);
          mergeState(remoteData);
        }
      }

      // 2. DECIDE if we need to push
      // We push if we just did an action (forcePush) 
      // OR if we are the Host (maintaining scores)
      // OR if we aren't in the cloud roster yet
      const isMeInCloud = remoteData?.users?.some((u: User) => u.id === stateRef.current.currentUser?.id);
      const shouldPush = forcePush || isHostAuthenticated || (stateRef.current.currentUser && !isMeInCloud);

      if (shouldPush) {
        const payload = {
          resetEpoch: Math.max(resetEpochRef.current, remoteData?.resetEpoch || 0),
          users: Array.from(new Map([...(remoteData?.users || []), ...stateRef.current.users].map(u => [u.id, u])).values()),
          messages: Array.from(new Map([...(remoteData?.messages || []), ...stateRef.current.messages].map(m => [m.id, m])).values())
            .sort((a: any, b: any) => a.timestamp - b.timestamp).slice(-60),
          userBets: Array.from(new Map([...(remoteData?.userBets || []), ...stateRef.current.userBets].map(b => [b.id, b])).values()),
          gameState: stateRef.current.gameState,
          propBets: stateRef.current.propBets,
          updatedAt: Date.now()
        };
        
        await fetch(url, { 
          method: 'POST', 
          body: JSON.stringify(payload), 
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      setSyncStatus('idle');
    } catch (e) {
      console.warn("Sync error:", e);
      setSyncStatus('error');
    }
  }, [mergeState, isHostAuthenticated]);

  useEffect(() => {
    // Initial sync
    syncWithCloud(false);
    // Recurring sync every 3.5 seconds
    const interval = setInterval(() => syncWithCloud(false), 3500);
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  const handleHostLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (hostKeyInput === 'SB2026') { 
      setIsHostAuthenticated(true);
      localStorage.setItem('sb_is_host', 'true');
      alert("Commissioner Mode ON");
    } else {
      alert("Invalid Code");
    }
  };

  const handleIdentityLogin = (e: React.FormEvent, handle: string, realName: string, avatar: string) => {
    e.preventDefault();
    const newUser: User = { 
      id: currentUser?.id || generateId(), 
      username: handle, 
      realName, 
      avatar, 
      credits: currentUser?.credits || 0 
    };
    setCurrentUser(newUser);
    setUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    setMode('GAME');
    // Immediate push to ensure they show up in the roster for everyone else
    setTimeout(() => syncWithCloud(true), 500);
  };

  const nukeRoom = async () => {
    if (!confirm("☢️ CLEAR ALL GUESTS? This resets the hub for everyone.")) return;
    ignorePushesUntilRef.current = Date.now() + 8000;
    const newEpoch = Date.now();
    const cloudKey = `sblix_v11_${partyCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const url = `https://api.keyvalue.xyz/${cloudKey}`;
    const payload = {
      resetEpoch: newEpoch,
      users: [],
      messages: [],
      userBets: [],
      propBets: INITIAL_PROP_BETS,
      gameState: { quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home' },
      updatedAt: Date.now()
    };
    await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain' } });
    resetEpochRef.current = newEpoch;
    localStorage.setItem('sb_reset_epoch_v11', newEpoch.toString());
    setMessages([]);
    setUserBets([]);
    setUsers([]);
    setPropBets(INITIAL_PROP_BETS);
    alert("Hub Cleared.");
  };

  const resolveBet = (betId: string, outcome: string) => {
    const updatedProps = propBets.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome } : pb);
    setPropBets(updatedProps);
    
    // Update credits for the host locally, will sync out to everyone
    setUsers(uList => uList.map(u => {
      const b = userBets.find(ub => ub.betId === betId && ub.userId === u.id);
      if (b) {
        const isWin = b.selection === outcome;
        const newCredits = (u.credits || 0) + (isWin ? 10 : -3);
        if (u.id === currentUser?.id) {
          setCurrentUser(prev => prev ? { ...prev, credits: newCredits } : null);
        }
        return { ...u, credits: newCredits };
      }
      return u;
    }));
    
    setUserBets(prev => prev.map(b => b.betId === betId ? { ...b, status: b.selection === outcome ? BetStatus.WON : BetStatus.LOST } : b));
    setTimeout(() => syncWithCloud(true), 100);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-md w-full glass-card p-8 sm:p-10 rounded-[3rem] text-center my-auto shadow-2xl animate-in zoom-in duration-500">
          <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-6 border-4 border-red-600">
            <i className="fas fa-football-ball text-red-600 text-4xl"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 tracking-tighter">SBLIX HUB</h1>
          <div className="mb-8 flex flex-col gap-1">
            <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.3em]">
              {isHostAuthenticated ? 'Commissioner Entry' : 'Guest Check-in'}
            </p>
            <div className="bg-slate-900/50 py-1 px-3 rounded-full border border-white/10 w-fit mx-auto text-[8px] font-black uppercase text-slate-500 tracking-widest">
              ROOM: {partyCode}
            </div>
          </div>

          <PlayerLogin onLogin={handleIdentityLogin} roomCode={partyCode} isHost={isHostAuthenticated} />

          {!isHostAuthenticated && (
            <div className="mt-8 pt-8 border-t border-white/5">
              <form onSubmit={handleHostLogin} className="flex gap-2">
                <input 
                  type="password" 
                  placeholder="Host Code" 
                  value={hostKeyInput} 
                  onChange={e => setHostKeyInput(e.target.value)}
                  className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-red-500"
                />
                <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase">Verify</button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  const playerLink = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(playerLink)}`;

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      {globalResetActive && (
        <div className="fixed inset-0 z-[100] bg-red-600 flex items-center justify-center">
           <div className="text-center p-12 bg-black/80 backdrop-blur-3xl rounded-3xl border-4 border-white">
             <i className="fas fa-sync text-6xl text-white mb-6 animate-spin"></i>
             <h2 className="text-3xl font-black font-orbitron text-white uppercase">Syncing Everyone...</h2>
           </div>
        </div>
      )}

      <header className="bg-slate-900 border-b border-slate-800 p-3 shrink-0 z-40 shadow-xl">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black font-orbitron text-red-600">SBLIX</h1>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px]">
              <span className="font-orbitron font-black text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-green-500'}`}></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-[10px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 ${(currentUser?.credits || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(currentUser?.credits || 0)} PTS
            </div>
            {isHostAuthenticated && <div className="bg-red-600 text-[7px] font-black px-1 py-0.5 rounded uppercase">Host</div>}
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-lg">
              {currentUser?.avatar}
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
               onSendMessage={(text) => {
                 const newMsg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
                 setMessages(prev => [...prev, newMsg]);
                 syncWithCloud(true);
                 if (Math.random() > 0.8) {
                    setTimeout(async () => {
                      const commentary = await getAICommentary(stateRef.current.messages, stateRef.current.gameState, [...stateRef.current.users].sort((a,b) => b.credits - a.credits));
                      const aiMsg: ChatMessage = { id: generateId(), userId: 'ai', username: 'Gerry Bot', text: commentary, timestamp: Date.now(), isAI: true };
                      setMessages(p => [...p, aiMsg]);
                      syncWithCloud(true);
                    }, 2000);
                 }
               }} 
               users={users} 
             />
           )}
           {activeTab === 'bets' && (
             <BettingPanel 
               propBets={propBets.filter(b => b.category !== 'Halftime')} 
               user={currentUser} 
               onPlaceBet={(bid, amt, sel) => {
                 const nb: UserBet = { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
                 setUserBets(p => [...p, nb]);
                 setTimeout(() => syncWithCloud(true), 100);
               }} 
               allBets={userBets} 
             />
           )}
           {activeTab === 'halftime' && (
             <div className="flex-1 overflow-y-auto">
               <div className="p-4 bg-slate-900/50 border-b border-white/5">
                 <h2 className="text-xs font-black font-orbitron text-white uppercase tracking-widest flex items-center gap-2">
                   <i className="fas fa-stopwatch text-red-500"></i> Halftime Props
                 </h2>
               </div>
               <BettingPanel 
                 propBets={propBets.filter(b => b.category === 'Halftime')} 
                 user={currentUser} 
                 onPlaceBet={(bid, amt, sel) => {
                   const nb: UserBet = { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
                   setUserBets(p => [...p, nb]);
                   setTimeout(() => syncWithCloud(true), 100);
                 }} 
                 allBets={userBets} 
                 hideFilters={true}
               />
             </div>
           )}
           {activeTab === 'leaderboard' && <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />}
           
           {activeTab === 'command' && isHostAuthenticated && (
             <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-950">
                <div className="glass-card p-6 rounded-[2rem] border-blue-900/20 bg-blue-950/5 text-center">
                  <h2 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4">Connect Guests (Room: {partyCode})</h2>
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white p-3 rounded-2xl shadow-xl">
                      <img src={qrCodeUrl} alt="QR" className="w-40 h-40" />
                    </div>
                    <button onClick={handleCopyLink} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-[11px]">
                      {copied ? 'LINK COPIED' : 'COPY PARTY LINK'}
                    </button>
                    <p className="text-[9px] text-slate-600 uppercase font-black">Scanning this links them to your session.</p>
                  </div>
                </div>

                <div className="glass-card p-6 rounded-[2rem] border-white/5">
                   <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 text-center">Settlement Control</h2>
                   <div className="space-y-4">
                     {propBets.map(bet => (
                       <div key={bet.id} className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex flex-col gap-3">
                         <span className="text-[11px] font-bold text-slate-300 leading-tight">{bet.question}</span>
                         <div className="flex gap-2">
                           {bet.options.map(opt => (
                             <button 
                               key={opt} 
                               onClick={() => resolveBet(bet.id, opt)}
                               className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
                             >
                               {opt}
                             </button>
                           ))}
                         </div>
                       </div>
                     ))}
                   </div>
                </div>

                <div className="pt-4">
                  <button onClick={nukeRoom} className="w-full py-5 bg-red-600/10 border border-red-500/20 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px]">
                    RESET HUB & DISCONNECT GUESTS
                  </button>
                </div>
             </div>
           )}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe">
        <div className="container mx-auto flex">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'halftime', icon: 'fa-stopwatch', label: 'Half' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' },
            ...(isHostAuthenticated ? [{ id: 'command', icon: 'fa-cog', label: 'Host' }] : [])
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-4 text-[8px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1.5 ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}>
              <i className={`fas ${tab.icon} text-lg`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

const PlayerLogin: React.FC<{ onLogin: (e: React.FormEvent, h: string, r: string, a: string) => void, roomCode: string, isHost: boolean }> = ({ onLogin, roomCode, isHost }) => {
  const [handle, setHandle] = useState('');
  const [realName, setRealName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);

  return (
    <div className="w-full space-y-6">
      <form onSubmit={e => onLogin(e, handle, realName, avatar)} className="space-y-5">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Select Icon</label>
          <div className="flex justify-center gap-2 overflow-x-auto py-2 no-scrollbar">
            {AVATARS.map(a => (
              <button type="button" key={a} onClick={() => setAvatar(a)} className={`w-10 h-10 text-xl flex-shrink-0 flex items-center justify-center rounded-xl transition-all ${avatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800 border border-slate-700'}`}>{a}</button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <input type="text" placeholder="Handle (e.g. Blitz)" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500" />
          <input type="text" placeholder="Real Name (John D.)" required value={realName} onChange={e => setRealName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500" />
          <button type="submit" className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
            {isHost ? 'ENTER AS COMMISSIONER' : 'JOIN PARTY'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default App;
