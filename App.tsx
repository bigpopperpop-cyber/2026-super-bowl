import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';

type AppMode = 'LANDING' | 'GAME';
type TabType = 'bets' | 'halftime' | 'chat' | 'leaderboard' | 'command';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [partyCode, setPartyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.toUpperCase() || 'SBLIX_HUB';
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [globalResetActive, setGlobalResetActive] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auth/Role states
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [isHostAuthenticated, setIsHostAuthenticated] = useState(localStorage.getItem('sb_is_host') === 'true');

  const lastSyncedAtRef = useRef<number>(0);
  const resetEpochRef = useRef<number>(parseInt(localStorage.getItem('sb_reset_epoch_v7') || '0'));
  const ignorePushesUntilRef = useRef<number>(0);

  const [gameState, setGameState] = useState<GameState>({
    quarter: 1,
    timeRemaining: "15:00",
    score: { home: 0, away: 0 },
    possession: 'home'
  });

  const stateRef = useRef({ users, userBets, messages, propBets, gameState, partyCode, currentUser });
  useEffect(() => {
    stateRef.current = { users, userBets, messages, propBets, gameState, partyCode, currentUser };
  }, [users, userBets, messages, propBets, gameState, partyCode, currentUser]);

  const mergeState = useCallback((cloudData: any) => {
    if (!cloudData) return;

    const cloudResetEpoch = cloudData.resetEpoch || 0;
    if (cloudResetEpoch > resetEpochRef.current) {
      setGlobalResetActive(true);
      setMessages([]);
      setUserBets([]);
      setPropBets(INITIAL_PROP_BETS.map(pb => ({ ...pb, resolved: false, outcome: undefined })));
      if (currentUser) {
        setCurrentUser(prev => prev ? { ...prev, credits: 0 } : null);
        setUsers(prev => prev.length > 0 ? [{ ...prev[0], credits: 0 }] : []);
      }
      resetEpochRef.current = cloudResetEpoch;
      localStorage.setItem('sb_reset_epoch_v7', cloudResetEpoch.toString());
      lastSyncedAtRef.current = cloudData.updatedAt || Date.now();
      setTimeout(() => setGlobalResetActive(false), 3000);
      return;
    }

    // Always merge users to keep the roster unified
    setUsers(prev => {
      const userMap = new Map<string, User>(prev.map(u => [u.id, u]));
      (cloudData.users || []).forEach((u: User) => {
        const existing = userMap.get(u.id);
        if (!existing || u.credits !== existing.credits) {
          userMap.set(u.id, u);
        }
      });
      // If we are logged in, ensure we are in the list
      if (stateRef.current.currentUser) {
        userMap.set(stateRef.current.currentUser.id, stateRef.current.currentUser);
      }
      return Array.from(userMap.values());
    });

    setMessages(prev => {
      const msgMap = new Map<string, ChatMessage>(prev.map(m => [m.id, m]));
      (cloudData.messages || []).forEach((m: ChatMessage) => msgMap.set(m.id, m));
      return Array.from(msgMap.values()).sort((a, b) => a.timestamp - b.timestamp).slice(-80);
    });

    if (cloudData.updatedAt > lastSyncedAtRef.current) {
      if (cloudData.userBets) {
        setUserBets(prev => {
          const betMap = new Map<string, UserBet>(prev.map(b => [b.id, b]));
          cloudData.userBets.forEach((b: UserBet) => betMap.set(b.id, b));
          return Array.from(betMap.values());
        });
      }
      if (cloudData.gameState) setGameState(cloudData.gameState);
      
      // Sync Prop Bet Resolutions (Host is source of truth)
      if (cloudData.propBets) {
        setPropBets(cloudData.propBets);
      }

      lastSyncedAtRef.current = cloudData.updatedAt;
    }
  }, [currentUser]);

  const syncWithCloud = useCallback(async (isPush: boolean = false) => {
    const code = stateRef.current.partyCode;
    if (!code) return;
    if (isPush && Date.now() < ignorePushesUntilRef.current) return;

    const syncKey = `sblix_v7_${code.toLowerCase().trim()}`;
    const url = `https://api.keyvalue.xyz/${syncKey}`;
    
    try {
      setIsSyncing(true);
      const response = await fetch(url);
      let remoteData: any = null;
      if (response.ok) {
        const text = await response.text();
        if (text && text.trim()) {
          remoteData = JSON.parse(text);
          mergeState(remoteData);
        }
      }

      // We push if explicitly asked, OR if we are the host, OR if we are a new user joining the roster
      const shouldPush = isPush || isHostAuthenticated || (currentUser && !remoteData?.users?.find((u: any) => u.id === currentUser.id));

      if (shouldPush) {
        const payload = {
          resetEpoch: Math.max(resetEpochRef.current, remoteData?.resetEpoch || 0),
          users: Array.from(new Map([...(remoteData?.users || []), ...stateRef.current.users].map(u => [u.id, u])).values()),
          messages: Array.from(new Map([...(remoteData?.messages || []), ...stateRef.current.messages].map(m => [m.id, m])).values())
            .sort((a: any, b: any) => a.timestamp - b.timestamp).slice(-60),
          userBets: Array.from(new Map([...(remoteData?.userBets || []), ...stateRef.current.userBets].map(b => [b.id, b])).values()),
          gameState: stateRef.current.gameState,
          propBets: stateRef.current.propBets, // Sync resolutions
          updatedAt: Date.now()
        };
        await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      console.warn("Sync error", e);
    } finally {
      setIsSyncing(false);
    }
  }, [mergeState, isHostAuthenticated, currentUser]);

  useEffect(() => {
    const interval = setInterval(() => syncWithCloud(false), 3000);
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  const handleHostLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (hostKeyInput === 'SB2026') { 
      setIsHostAuthenticated(true);
      localStorage.setItem('sb_is_host', 'true');
      // Keep existing partyCode so host joins the guest's room if arriving via link
    } else {
      alert("Invalid Master Host Key");
    }
  };

  const handleIdentityLogin = (e: React.FormEvent, handle: string, realName: string, avatar: string) => {
    e.preventDefault();
    const newUser: User = { 
      id: isHostAuthenticated ? `host-${partyCode}` : generateId(), 
      username: handle, 
      realName, 
      avatar, 
      credits: 0 
    };
    setCurrentUser(newUser);
    setUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    setMode('GAME');
    // Ensure immediate sync to join the cloud roster
    setTimeout(() => syncWithCloud(true), 300);
  };

  const nukeRoom = async () => {
    if (!confirm("☢️ NUKE ROOM? This clears all players, chat, and scores for all 20+ guests.")) return;
    ignorePushesUntilRef.current = Date.now() + 10000;
    const newEpoch = Date.now();
    const syncKey = `sblix_v7_${partyCode.toLowerCase().trim()}`;
    const url = `https://api.keyvalue.xyz/${syncKey}`;
    const payload = {
      resetEpoch: newEpoch,
      users: [],
      messages: [],
      userBets: [],
      propBets: INITIAL_PROP_BETS,
      gameState: { quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home' },
      updatedAt: Date.now()
    };
    await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    resetEpochRef.current = newEpoch;
    localStorage.setItem('sb_reset_epoch_v7', newEpoch.toString());
    setMessages([]);
    setUserBets([]);
    setUsers([]);
    setPropBets(INITIAL_PROP_BETS);
    alert("Hub Reset Successfully.");
  };

  const updateScore = (team: 'home' | 'away', change: number) => {
    setGameState(prev => ({ ...prev, score: { ...prev.score, [team]: Math.max(0, prev.score[team] + change) } }));
    setTimeout(() => syncWithCloud(true), 100);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resolveBet = (betId: string, outcome: string) => {
    setPropBets(p => p.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome } : pb));
    setUsers(uList => uList.map(u => {
      const b = userBets.find(ub => ub.betId === betId && ub.userId === u.id);
      if (b) {
        const isWin = b.selection === outcome;
        return { ...u, credits: (u.credits || 0) + (isWin ? 10 : -3) };
      }
      return u;
    }));
    setUserBets(prev => prev.map(b => b.betId === betId ? { ...b, status: b.selection === outcome ? BetStatus.WON : BetStatus.LOST } : b));
    setTimeout(() => syncWithCloud(true), 100);
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
              {isHostAuthenticated ? 'Commissioner Mode' : 'Guest Portal'}
            </p>
            <div className="bg-slate-900/50 py-1 px-3 rounded-full border border-white/10 w-fit mx-auto text-[8px] font-black uppercase text-slate-500 tracking-widest">
              Room: {partyCode}
            </div>
          </div>

          <PlayerLogin 
            onLogin={handleIdentityLogin} 
            roomCode={partyCode} 
            isHost={isHostAuthenticated} 
          />

          {!isHostAuthenticated && (
            <div className="mt-8 pt-8 border-t border-white/5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Host Access Only</p>
              <form onSubmit={handleHostLogin} className="flex gap-2">
                <input 
                  type="password" 
                  placeholder="Key" 
                  value={hostKeyInput} 
                  onChange={e => setHostKeyInput(e.target.value)}
                  className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-red-500"
                />
                <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase">Verify</button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  const playerLink = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(playerLink)}`;

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      {globalResetActive && (
        <div className="fixed inset-0 z-[100] bg-red-600 flex items-center justify-center animate-pulse">
           <div className="text-center p-12 bg-black/60 backdrop-blur-3xl rounded-3xl border-4 border-white">
             <i className="fas fa-radiation text-6xl text-white mb-6"></i>
             <h2 className="text-3xl font-black font-orbitron text-white">HUB RESETTING</h2>
             <p className="text-white/80 font-bold uppercase tracking-widest mt-4">Host has cleared the game</p>
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
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[11px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 ${(currentUser?.credits || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(currentUser?.credits || 0)} PTS
            </div>
            {isHostAuthenticated && (
              <div className="bg-red-600 text-white text-[8px] font-black px-1.5 py-1 rounded-md uppercase tracking-tighter flex items-center gap-1">
                <i className="fas fa-crown"></i> HOST
              </div>
            )}
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-lg">
              {currentUser?.avatar}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <div className="h-full container mx-auto flex flex-col">
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
               <div className="p-4 bg-slate-900/50 border-b border-white/5 flex flex-col gap-1">
                 <h2 className="text-sm font-black font-orbitron text-white uppercase tracking-widest flex items-center gap-2">
                   <i className="fas fa-stopwatch text-red-500"></i>
                   1st Half Player Stats
                 </h2>
                 <p className="text-[9px] text-slate-500 font-bold uppercase">Props relevant only up to Halftime settlement</p>
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
                   }, 1500);
                 }
               }} 
               users={users} 
             />
           )}
           {activeTab === 'leaderboard' && <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />}
           
           {activeTab === 'command' && isHostAuthenticated && (
             <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-950 font-orbitron">
                <div className="glass-card p-6 rounded-[2rem] border-white/5">
                  <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">Real-time Score</h2>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center space-y-2">
                      <div className="text-5xl font-black text-white">{gameState.score.home}</div>
                      <div className="flex gap-2">
                        <button onClick={() => updateScore('home', -1)} className="flex-1 bg-slate-800 py-3 rounded-xl font-black">-</button>
                        <button onClick={() => updateScore('home', 1)} className="flex-1 bg-red-600 py-3 rounded-xl font-black">+</button>
                      </div>
                      <div className="text-[9px] font-black text-slate-600 uppercase">Home</div>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="text-5xl font-black text-white">{gameState.score.away}</div>
                      <div className="flex gap-2">
                        <button onClick={() => updateScore('away', -1)} className="flex-1 bg-slate-800 py-3 rounded-xl font-black">-</button>
                        <button onClick={() => updateScore('away', 1)} className="flex-1 bg-red-600 py-3 rounded-xl font-black">+</button>
                      </div>
                      <div className="text-[9px] font-black text-slate-600 uppercase">Away</div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6 rounded-[2rem] border-blue-900/20 bg-blue-950/5 text-center">
                  <h2 className="text-[11px] font-black text-blue-500 uppercase tracking-widest mb-4">Invite Guests</h2>
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white p-2 rounded-2xl shadow-xl">
                      <img src={qrCodeUrl} alt="Invite QR" className="w-32 h-32" />
                    </div>
                    <button onClick={handleCopyLink} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">
                      {copied ? 'COPIED!' : 'COPY PLAYER LINK'}
                    </button>
                  </div>
                </div>

                <div className="glass-card p-6 rounded-[2rem] border-red-900/40 bg-red-950/10">
                  <h2 className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-4">Prop Resolutions</h2>
                  <div className="space-y-6">
                    {/* Halftime Props First */}
                    <div>
                      <h3 className="text-[9px] font-black text-slate-400 uppercase mb-3 border-b border-white/5 pb-2">Halftime Settlements</h3>
                      <div className="space-y-3">
                        {propBets.filter(b => b.category === 'Halftime').map(bet => (
                          <div key={bet.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-300 leading-tight">{bet.question}</span>
                            <div className="flex gap-2">
                              {bet.options.map(opt => (
                                <button 
                                  key={opt} 
                                  onClick={() => resolveBet(bet.id, opt)}
                                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* General Props */}
                    <div>
                      <h3 className="text-[9px] font-black text-slate-400 uppercase mb-3 border-b border-white/5 pb-2">General Game Props</h3>
                      <div className="space-y-3">
                        {propBets.filter(b => b.category !== 'Halftime').map(bet => (
                          <div key={bet.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-300 leading-tight">{bet.question}</span>
                            <div className="flex gap-2">
                              {bet.options.map(opt => (
                                <button 
                                  key={opt} 
                                  onClick={() => resolveBet(bet.id, opt)}
                                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <button onClick={nukeRoom} className="w-full py-5 bg-red-600/20 border border-red-500/30 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">
                    NUKE ROOM & CLEAR GUESTS
                  </button>
                </div>
             </div>
           )}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="container mx-auto flex">
          {[
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'halftime', icon: 'fa-stopwatch', label: 'Halftime' },
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rankings' },
            ...(isHostAuthenticated ? [{ id: 'command', icon: 'fa-crown', label: 'COMMAND' }] : [])
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-4 text-[9px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1.5 ${activeTab === tab.id ? (tab.id === 'command' ? 'text-yellow-400 bg-yellow-400/5' : 'text-red-500 bg-red-500/5') : 'text-slate-500'}`}>
              <i className={`fas ${tab.icon} text-lg`}></i>
              {tab.label}
              {activeTab === tab.id && <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${tab.id === 'command' ? 'bg-yellow-400' : 'bg-red-500'}`}></div>}
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
          <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Pick an Icon</label>
          <div className="flex justify-center gap-2 overflow-x-auto py-2 no-scrollbar">
            {AVATARS.map(a => (
              <button type="button" key={a} onClick={() => setAvatar(a)} className={`w-10 h-10 text-xl flex-shrink-0 flex items-center justify-center rounded-xl transition-all ${avatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800 border border-slate-700'}`}>{a}</button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <input type="text" placeholder="Handle (e.g. Blitz)" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 transition-colors" />
          <input type="text" placeholder="Real Name (John D.)" required value={realName} onChange={e => setRealName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 transition-colors" />
          <button type="submit" className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
            {isHost ? 'ENTER AS COMMISSIONER' : 'JOIN THE PARTY'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default App;