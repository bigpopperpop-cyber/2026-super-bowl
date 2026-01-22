import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';

type AppMode = 'LANDING' | 'HOST' | 'PLAYER';
type TabType = 'bets' | 'chat' | 'leaderboard';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('bets');
  const [partyCode, setPartyCode] = useState<string>('');
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

    setUsers(prev => {
      const userMap = new Map<string, User>(prev.map(u => [u.id, u]));
      (cloudData.users || []).forEach((u: User) => {
        const existing = userMap.get(u.id);
        if (!existing || u.credits !== existing.credits) userMap.set(u.id, u);
      });
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

      if (isPush || (!remoteData && mode === 'HOST')) {
        const payload = {
          resetEpoch: Math.max(resetEpochRef.current, remoteData?.resetEpoch || 0),
          users: Array.from(new Map([...(remoteData?.users || []), ...stateRef.current.users].map(u => [u.id, u])).values()),
          messages: Array.from(new Map([...(remoteData?.messages || []), ...stateRef.current.messages].map(m => [m.id, m])).values())
            .sort((a: any, b: any) => a.timestamp - b.timestamp).slice(-60),
          userBets: Array.from(new Map([...(remoteData?.userBets || []), ...stateRef.current.userBets].map(b => [b.id, b])).values()),
          gameState: stateRef.current.gameState,
          updatedAt: Date.now()
        };
        await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      console.warn("Sync error", e);
    } finally {
      setIsSyncing(false);
    }
  }, [mergeState, mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    const roleFromUrl = params.get('role');

    if (roleFromUrl === 'host' && isHostAuthenticated) {
      setMode('HOST');
      const savedCode = localStorage.getItem('sb_party_code');
      if (savedCode) setPartyCode(savedCode);
    } else if (roomFromUrl) {
      setPartyCode(roomFromUrl.toUpperCase());
      setMode('PLAYER');
    }

    const interval = setInterval(() => syncWithCloud(false), 3000);
    return () => clearInterval(interval);
  }, [syncWithCloud, isHostAuthenticated]);

  const handleHostLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (hostKeyInput === 'SB2026') { // Simple secret key
      setIsHostAuthenticated(true);
      localStorage.setItem('sb_is_host', 'true');
      setMode('HOST');
      setPartyCode('LIX_ROOM');
    } else {
      alert("Invalid Master Host Key");
    }
  };

  const handlePlayerLogin = (e: React.FormEvent, handle: string, realName: string, avatar: string) => {
    e.preventDefault();
    const newUser: User = { id: generateId(), username: handle, realName, avatar, credits: 0 };
    setCurrentUser(newUser);
    setUsers([newUser]);
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
      gameState: { quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home' },
      updatedAt: Date.now()
    };
    await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    resetEpochRef.current = newEpoch;
    localStorage.setItem('sb_reset_epoch_v7', newEpoch.toString());
    setMessages([]);
    setUserBets([]);
    setUsers([]);
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

  // --- RENDERING ---

  if (mode === 'LANDING') {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6">
        <div className="max-w-md w-full glass-card p-10 rounded-[3rem] text-center">
          <div className="w-24 h-24 bg-white rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-6 border-4 border-red-600">
            <i className="fas fa-football-ball text-red-600 text-5xl"></i>
          </div>
          <h1 className="text-4xl font-black font-orbitron mb-2 tracking-tighter">SBLIX HUB</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mb-10">2026 Season Control</p>
          
          <div className="space-y-4">
            <form onSubmit={handleHostLogin} className="space-y-3">
              <input 
                type="password" 
                placeholder="Master Host Key" 
                value={hostKeyInput} 
                onChange={e => setHostKeyInput(e.target.value)}
                className="w-full bg-black/40 border border-slate-700 rounded-2xl px-5 py-4 text-center font-bold outline-none focus:border-red-500 transition-colors"
              />
              <button type="submit" className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-red-600/30">
                ENTER COMMAND CENTER
              </button>
            </form>
            <div className="py-4 flex items-center gap-4">
              <div className="flex-1 h-px bg-slate-800"></div>
              <span className="text-[10px] font-black text-slate-600">GUESTS MUST USE ROOM LINK</span>
              <div className="flex-1 h-px bg-slate-800"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'HOST') {
    const playerLink = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(playerLink)}`;

    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden font-orbitron">
        <header className="p-6 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white"><i className="fas fa-crown"></i></div>
            <div>
              <h1 className="text-lg font-black text-white">HOST CONTROL</h1>
              <p className="text-[9px] text-red-500 font-black tracking-widest uppercase">Room: {partyCode}</p>
            </div>
          </div>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-slate-500 text-[10px] font-black uppercase">Logout</button>
        </header>

        <main className="flex-1 p-6 overflow-y-auto space-y-8 max-w-2xl mx-auto w-full">
          <div className="glass-card p-8 rounded-[2rem] border-white/5">
            <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-6">Scoreboard Control</h2>
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center space-y-4">
                <div className="text-6xl font-black text-white">{gameState.score.home}</div>
                <div className="flex gap-2">
                  <button onClick={() => updateScore('home', -1)} className="flex-1 bg-slate-800 py-4 rounded-xl font-black">-</button>
                  <button onClick={() => updateScore('home', 1)} className="flex-1 bg-red-600 py-4 rounded-xl font-black">+</button>
                </div>
                <div className="text-[10px] font-black text-slate-600 uppercase">Home Team</div>
              </div>
              <div className="text-center space-y-4">
                <div className="text-6xl font-black text-white">{gameState.score.away}</div>
                <div className="flex gap-2">
                  <button onClick={() => updateScore('away', -1)} className="flex-1 bg-slate-800 py-4 rounded-xl font-black">-</button>
                  <button onClick={() => updateScore('away', 1)} className="flex-1 bg-red-600 py-4 rounded-xl font-black">+</button>
                </div>
                <div className="text-[10px] font-black text-slate-600 uppercase">Away Team</div>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 rounded-[2rem] border-blue-900/20 bg-blue-950/5 text-center">
            <h2 className="text-[11px] font-black text-blue-500 uppercase tracking-widest mb-6">Guest Invitation</h2>
            
            <div className="flex flex-col items-center gap-6">
              <div className="bg-white p-4 rounded-3xl shadow-2xl border-4 border-blue-500/20">
                <img 
                  src={qrCodeUrl} 
                  alt="Player Invite QR Code" 
                  className="w-[200px] h-[200px]"
                />
              </div>
              
              <div className="w-full space-y-4">
                <div className="p-4 bg-black rounded-xl border border-slate-800 text-[11px] text-slate-400 font-bold truncate">
                  {playerLink}
                </div>
                <button onClick={handleCopyLink} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-600/20 active:scale-95 transition-all">
                  {copied ? 'COPIED!' : 'COPY PLAYER LINK'}
                </button>
                <p className="text-[9px] text-slate-500 uppercase font-black">Scan to join the Hub instantly</p>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 rounded-[2rem] border-red-900/40 bg-red-950/10">
            <h2 className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-4">Emergency Controls</h2>
            <button onClick={nukeRoom} className="w-full py-6 bg-red-600 border-2 border-red-400 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl shadow-red-600/30 active:scale-95 transition-all">
              NUKE ROOM & CLEAR GUESTS
            </button>
          </div>
          
          <div className="p-8">
            <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-6">Settlement View</h2>
            <div className="space-y-3">
              {propBets.map(bet => (
                <div key={bet.id} className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-300">{bet.question}</span>
                  <div className="flex gap-2">
                    {bet.options.map(opt => (
                      <button 
                        key={opt} 
                        onClick={() => {
                          setPropBets(p => p.map(pb => pb.id === bet.id ? { ...pb, resolved: true, outcome: opt } : pb));
                          // Update all users' credits based on this resolution
                          setUsers(uList => uList.map(u => {
                            const b = userBets.find(ub => ub.betId === bet.id && ub.userId === u.id);
                            if (b) return { ...u, credits: (u.credits || 0) + (b.selection === opt ? 10 : -3) };
                            return u;
                          }));
                          setTimeout(() => syncWithCloud(true), 100);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- PLAYER VIEW ---
  if (mode === 'PLAYER' && !currentUser) {
    return <PlayerLogin onLogin={handlePlayerLogin} roomCode={partyCode} />;
  }

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
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-lg">
              {currentUser?.avatar}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <div className="h-full container mx-auto">
           {activeTab === 'bets' && <BettingPanel propBets={propBets} user={currentUser!} onPlaceBet={(bid, amt, sel) => {
              const nb: UserBet = { id: generateId(), userId: currentUser!.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
              setUserBets(p => [...p, nb]);
              setTimeout(() => syncWithCloud(true), 100);
           }} allBets={userBets} />}
           {activeTab === 'chat' && <ChatRoom user={currentUser!} messages={messages} onSendMessage={(text) => {
              const newMsg: ChatMessage = { id: generateId(), userId: currentUser!.id, username: currentUser!.username, text, timestamp: Date.now() };
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
           }} users={users} />}
           {activeTab === 'leaderboard' && <Leaderboard users={users} currentUser={currentUser!} propBets={propBets} userBets={userBets} />}
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

const PlayerLogin: React.FC<{ onLogin: (e: React.FormEvent, h: string, r: string, a: string) => void, roomCode: string }> = ({ onLogin, roomCode }) => {
  const [handle, setHandle] = useState('');
  const [realName, setRealName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 nfl-gradient">
      <div className="max-w-md w-full glass-card p-10 rounded-[3rem] shadow-2xl animate-in zoom-in duration-500">
        <h2 className="text-3xl font-black font-orbitron text-center mb-8 uppercase tracking-tighter">JOIN HUB</h2>
        <div className="flex justify-center mb-8">
          <div className="bg-slate-900/80 p-4 rounded-2xl border border-red-500/30 text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Room Code</p>
            <p className="text-xl font-black font-orbitron text-red-500 tracking-widest">{roomCode}</p>
          </div>
        </div>
        <form onSubmit={e => onLogin(e, handle, realName, avatar)} className="space-y-5">
           <div className="flex justify-center gap-2 overflow-x-auto py-2 no-scrollbar">
             {AVATARS.slice(0, 8).map(a => (
               <button type="button" key={a} onClick={() => setAvatar(a)} className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl ${avatar === a ? 'bg-red-600 scale-110 shadow-lg' : 'bg-slate-800'}`}>{a}</button>
             ))}
           </div>
           <input type="text" placeholder="Handle (e.g. Blitz)" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none" />
           <input type="text" placeholder="Real Name (John D.)" required value={realName} onChange={e => setRealName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none" />
           <button type="submit" className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">START PLAYING</button>
        </form>
      </div>
    </div>
  );
};

export default App;