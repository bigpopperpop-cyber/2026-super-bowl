
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';

type AppMode = 'LANDING' | 'GAME';
type TabType = 'chat' | 'bets' | 'halftime' | 'leaderboard' | 'command';

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4, 8);

// TITAN-SYNC CONFIG
const TITAN_NS = "titan_sblix_v14"; // New namespace for a clean slate
const API_BASE = "https://api.keyvalue.xyz/a6b7c8d9";
const LOBBY_SHARDS = 8; // Number of "Join" slots to prevent collisions

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_u_v14');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'connected'>('idle');
  const [diag, setDiag] = useState<string>("Initializing...");
  
  const [partyCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const room = (params.get('room') || 'SBLIX').toUpperCase();
    return room;
  });

  const [isHost, setIsHost] = useState(localStorage.getItem('sblix_h_v14') === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });

  // PERSISTENT REFERENCES
  const outbox = useRef<ChatMessage[]>([]);
  const lastSync = useRef(0);
  const isSyncing = useRef(false);
  const stateRef = useRef({ users, messages, gameState, propBets, isHost, currentUser, partyCode });

  useEffect(() => {
    stateRef.current = { users, messages, gameState, propBets, isHost, currentUser, partyCode };
    if (currentUser) localStorage.setItem('sblix_u_v14', JSON.stringify(currentUser));
    localStorage.setItem('sblix_h_v14', isHost.toString());
  }, [users, messages, gameState, propBets, isHost, currentUser, partyCode]);

  // TITAN SYNC ENGINE
  const runTitanSync = useCallback(async () => {
    if (isSyncing.current || !currentUser) return;
    isSyncing.current = true;
    setSyncStatus('syncing');

    const room = stateRef.current.partyCode.toLowerCase();
    const masterKey = `${TITAN_NS}_${room}_master`;
    const cb = `?cb=${Date.now()}`; // CACHE BUSTER FOR IOS

    try {
      // 1. ALL USERS: Send Handshake to random Lobby Slot
      const myShard = (parseInt(currentUser.id.substring(0, 2), 36) % LOBBY_SHARDS) + 1;
      const shardKey = `${TITAN_NS}_${room}_lobby_${myShard}`;
      
      setDiag(`Broadcasting to Shard ${myShard}...`);
      
      // Post to personal inbox (Zero collision)
      const myInboxKey = `${TITAN_NS}_${room}_user_${currentUser.id.substring(0, 6)}`;
      await fetch(`${API_BASE}/${myInboxKey}`, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify({
          u: currentUser,
          msgs: outbox.current,
          ts: Date.now()
        }),
        headers: { 'Content-Type': 'text/plain' }
      });

      // 2. HUB (HOST): HARVEST & BROADCAST
      if (isHost) {
        setDiag("Host: Harvesting Inboxes...");
        // In a real env, we'd list keys, but here we scan the roster we have + lobby shards
        const harvestedMsgs = [...stateRef.current.messages];
        const harvestedUsers = new Map<string, User>();
        harvestedUsers.set(currentUser.id, currentUser);

        // Scan all potential user boxes (based on current roster)
        const boxesToScan = stateRef.current.users.map(u => u.id.substring(0, 6));
        const scanPromises = boxesToScan.map(boxId => 
          fetch(`${API_BASE}/${TITAN_NS}_${room}_user_${boxId}${cb}`).then(r => r.ok ? r.json() : null).catch(() => null)
        );

        const inboxData = await Promise.all(scanPromises);
        inboxData.forEach(data => {
          if (data && Date.now() - data.ts < 60000) {
            harvestedUsers.set(data.u.id, data.u);
            if (data.msgs) {
              data.msgs.forEach((m: ChatMessage) => {
                if (!harvestedMsgs.find(ex => ex.id === m.id)) harvestedMsgs.push(m);
              });
            }
          }
        });

        const finalUsers = Array.from(harvestedUsers.values());
        const finalMsgs = harvestedMsgs.sort((a,b) => a.timestamp - b.timestamp).slice(-80);

        const masterPayload = {
          users: finalUsers,
          messages: finalMsgs,
          gameState: stateRef.current.gameState,
          propBets: stateRef.current.propBets,
          ts: Date.now()
        };

        await fetch(`${API_BASE}/${masterKey}`, {
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify(masterPayload),
          headers: { 'Content-Type': 'text/plain' }
        });

        setUsers(finalUsers);
        setMessages(finalMsgs);
        setDiag(`Host Active: ${finalUsers.length} Users`);
      } else {
        // 3. GUESTS: LISTEN TO MASTER PULSE
        setDiag("Guest: Listening for Pulse...");
        const resp = await fetch(`${API_BASE}/${masterKey}${cb}`);
        if (resp.ok) {
          const master = await resp.json();
          if (master && Date.now() - master.ts < 45000) {
            setUsers(master.users || []);
            setMessages(master.messages || []);
            setGameState(master.gameState);
            setPropBets(master.propBets);
            setDiag(`Sync OK: ${master.users?.length} Online`);
            
            // Clear outbox if host has picked them up
            const hostMsgIds = new Set(master.messages.map((m: any) => m.id));
            outbox.current = outbox.current.filter(m => !hostMsgIds.has(m.id));
          } else {
            setDiag("Searching for Host...");
          }
        }
      }
      setSyncStatus('connected');
    } catch (e) {
      setSyncStatus('error');
      setDiag("Network Congestion...");
    } finally {
      isSyncing.current = false;
      lastSync.current = Date.now();
    }
  }, [currentUser, isHost]);

  useEffect(() => {
    if (mode === 'GAME' && currentUser) {
      runTitanSync();
      const interval = setInterval(runTitanSync, isHost ? 4000 : 3000);
      return () => clearInterval(interval);
    }
  }, [mode, currentUser, isHost, runTitanSync]);

  const onSendMessage = (text: string) => {
    if (!currentUser) return;
    const msg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    outbox.current.push(msg);
  };

  const onJoin = (e: React.FormEvent, handle: string, real: string, av: string) => {
    e.preventDefault();
    const id = currentUser?.id || generateId();
    setCurrentUser({ id, username: handle, realName: real, avatar: av, credits: 0 });
    setMode('GAME');
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl border-white/20">
          <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-3 border-4 border-red-600">
            <i className="fas fa-microchip text-red-600 text-3xl"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 uppercase tracking-tighter">SBLIX TITAN</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">TITAN SYNC ACTIVE: {partyCode}</p>
          <GuestLogin onLogin={onJoin} isHost={isHost} />
          {!isHost && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <form onSubmit={e => {
                e.preventDefault();
                if (hostKeyInput === 'SB2026') { setIsHost(true); setHostKeyInput(''); setActiveTab('command'); } else alert("PIN Incorrect");
              }} className="flex gap-2">
                <input type="password" placeholder="COMMISH PIN" value={hostKeyInput} onChange={e => setHostKeyInput(e.target.value)} className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none text-white focus:border-red-500" />
                <button type="submit" className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase">AUTH</button>
              </form>
            </div>
          )}
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
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px]">
              <span className="font-orbitron font-black text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-400 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500 animate-bounce' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,1)]'}`}></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[7px] font-black text-slate-500 uppercase tracking-tighter text-right">
                {diag}<br/><span className="text-slate-700">MOD: TITAN-14</span>
             </div>
             <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-lg">
               {currentUser.avatar}
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatRoom user={currentUser} messages={messages} users={users} onSendMessage={onSendMessage} />}
        {activeTab === 'bets' && <BettingPanel propBets={propBets} user={currentUser} allBets={userBets} onPlaceBet={(bid, amt, sel) => {
              const bet: UserBet = { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
              setUserBets(p => [...p, bet]);
            }} />}
        {activeTab === 'leaderboard' && (
          <div className="h-full flex flex-col overflow-hidden">
            <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
            <div className="p-4 border-t border-white/5 bg-slate-900/50 text-center shrink-0">
               <div className="flex justify-center gap-1.5 mb-2">
                  {Array.from({length: Math.min(users.length, 12)}).map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  ))}
               </div>
               <p className="text-[10px] text-green-400 font-black uppercase tracking-widest">
                 {users.length} TITAN DEVICES DISCOVERED
               </p>
            </div>
          </div>
        )}
        {activeTab === 'command' && isHost && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
             <div className="glass-card p-6 rounded-[2rem] text-center border-blue-500/20 bg-blue-600/5">
                <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Commissioner Command</h2>
                <div className="bg-white p-4 rounded-2xl w-fit mx-auto shadow-2xl mb-4">
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?room=' + partyCode)}`} alt="QR" />
                </div>
                <button onClick={() => { navigator.clipboard.writeText(window.location.origin + window.location.pathname + '?room=' + partyCode); alert("Copied!"); }} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs">COPY PARTY LINK</button>
             </div>
             <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">Prop Management</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                    <p className="text-xs font-bold text-slate-300 mb-3">{bet.question}</p>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button key={opt} onClick={() => {
                            const upd = propBets.map(pb => pb.id === bet.id ? { ...pb, resolved: true, outcome: opt } : pb);
                            setPropBets(upd);
                          }} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{opt}</button>
                      ))}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe flex shrink-0">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Picks' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' },
            ...(isHost ? [{ id: 'command', icon: 'fa-cog', label: 'Commish' }] : [])
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-4 flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}>
              <i className={`fas ${tab.icon} text-lg`}></i>
              <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
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
          <button type="button" key={a} onClick={() => setAv(a)} className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${av === a ? 'bg-red-600 border-2 border-white scale-110 shadow-lg' : 'bg-slate-800 opacity-40 hover:opacity-100'}`}>
            {a}
          </button>
        ))}
      </div>
      <div className="space-y-4 text-left">
        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Chat Handle</label>
        <input type="text" placeholder="e.g. TouchdownKing" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Real Name</label>
        <input type="text" placeholder="e.g. John Doe" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
          {isHost ? 'LAUNCH AS COMMISSIONER' : 'JOIN SUPER BOWL LIX'}
        </button>
      </div>
    </div>
  );
};

export default App;
