
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

// HUB-AND-SPOKE CONFIG
const SYNC_VERSION = "v10_hub";
const BASE_URL = "https://api.keyvalue.xyz/a6b7c8d9";

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_user_v10');
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

  const [isHost, setIsHost] = useState(localStorage.getItem('sblix_host_v10') === 'true');
  const [hostKeyInput, setHostKeyInput] = useState('');
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1, timeRemaining: "15:00", score: { home: 0, away: 0 }, possession: 'home'
  });

  // REFERENCES FOR THE SYNC LOOP
  const outbox = useRef<ChatMessage[]>([]);
  const isSyncing = useRef(false);
  const stateRef = useRef({ users, messages, gameState, propBets, isHost, currentUser });

  useEffect(() => {
    stateRef.current = { users, messages, gameState, propBets, isHost, currentUser };
    if (currentUser) localStorage.setItem('sblix_user_v10', JSON.stringify(currentUser));
    localStorage.setItem('sblix_host_v10', isHost.toString());
  }, [users, messages, gameState, propBets, isHost, currentUser]);

  // HUB-SYNC ENGINE
  const runSync = useCallback(async () => {
    if (isSyncing.current || !currentUser) return;
    isSyncing.current = true;
    setSyncStatus('syncing');

    const roomKey = `${SYNC_VERSION}_${partyCode.toLowerCase()}`;
    const masterKey = `${roomKey}_master`;
    const mySlotKey = `${roomKey}_slot_${currentUser.id.substring(0, 8)}`;

    try {
      // 1. ALL USERS: Push Heartbeat + Outbox to their private Slot
      const myData = {
        user: currentUser,
        outbox: outbox.current,
        timestamp: Date.now()
      };
      await fetch(`${BASE_URL}/${mySlotKey}`, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(myData),
        headers: { 'Content-Type': 'text/plain' }
      });
      // Clear outbox after successful push
      outbox.current = [];

      // 2. HUB (HOST) ONLY: Harvest all slots and update Master
      if (isHost) {
        // Poll for other active slots (Registry)
        const registryKey = `${roomKey}_registry`;
        const regResp = await fetch(`${BASE_URL}/${registryKey}`);
        let registry: string[] = [];
        if (regResp.ok) {
          const text = await regResp.text();
          if (text && text !== "null") registry = JSON.parse(text);
        }

        // Add myself to registry if not there
        const myShortId = currentUser.id.substring(0, 8);
        if (!registry.includes(myShortId)) {
          registry.push(myShortId);
          await fetch(`${BASE_URL}/${registryKey}`, { method: 'POST', body: JSON.stringify(registry), headers: { 'Content-Type': 'text/plain' } });
        }

        // Harvest all registered slots
        const harvestedUsers: User[] = [currentUser];
        const harvestedMsgs: ChatMessage[] = [...stateRef.current.messages];

        for (const slotId of registry) {
          if (slotId === myShortId) continue;
          const slotResp = await fetch(`${BASE_URL}/${roomKey}_slot_${slotId}`);
          if (slotResp.ok) {
            const slotData = await slotResp.json();
            if (slotData && Date.now() - slotData.timestamp < 30000) { // Only if active in last 30s
              harvestedUsers.push(slotData.user);
              if (slotData.outbox && slotData.outbox.length > 0) {
                slotData.outbox.forEach((m: ChatMessage) => {
                  if (!harvestedMsgs.find(ex => ex.id === m.id)) harvestedMsgs.push(m);
                });
              }
            }
          }
        }

        // Broadcast Master State
        const masterPayload = {
          users: harvestedUsers,
          messages: harvestedMsgs.sort((a,b) => a.timestamp - b.timestamp).slice(-60),
          gameState: stateRef.current.gameState,
          propBets: stateRef.current.propBets,
          updatedAt: Date.now()
        };
        await fetch(`${BASE_URL}/${masterKey}`, {
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify(masterPayload),
          headers: { 'Content-Type': 'text/plain' }
        });
        
        setUsers(harvestedUsers);
        setMessages(masterPayload.messages);
      } else {
        // 3. GUESTS ONLY: Pull Master State
        const masterResp = await fetch(`${BASE_URL}/${masterKey}`, { cache: 'no-store' });
        if (masterResp.ok) {
          const master = await masterResp.json();
          if (master) {
            setUsers(master.users || []);
            setMessages(master.messages || []);
            setGameState(master.gameState);
            setPropBets(master.propBets);
          }
        }
      }
      setSyncStatus('connected');
    } catch (e) {
      setSyncStatus('error');
    } finally {
      isSyncing.current = false;
    }
  }, [currentUser, isHost, partyCode]);

  useEffect(() => {
    if (mode === 'GAME' && currentUser) {
      runSync();
      const interval = setInterval(runSync, isHost ? 4000 : 3500); // Host polls slightly slower to reduce load
      return () => clearInterval(interval);
    }
  }, [mode, currentUser, isHost, runSync]);

  const onSendMessage = (text: string) => {
    if (!currentUser) return;
    const msg: ChatMessage = { id: generateId(), userId: currentUser.id, username: currentUser.username, text, timestamp: Date.now() };
    
    // Optimistic Update
    setMessages(prev => [...prev, msg]);
    // Add to Outbox for the Hub to harvest
    outbox.current.push(msg);

    // AI Chance
    if (Math.random() > 0.9 && isHost) {
      setTimeout(async () => {
        const talk = await getAICommentary(stateRef.current.messages, stateRef.current.gameState, stateRef.current.users);
        const aiMsg: ChatMessage = { id: generateId(), userId: 'ai', username: 'Gerry Bot', text: talk, timestamp: Date.now(), isAI: true };
        setMessages(p => [...p, aiMsg]);
        runSync();
      }, 3000);
    }
  };

  const handleHostAuth = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hostKeyInput === 'SB2026') {
      setIsHost(true);
      setHostKeyInput('');
      setActiveTab('command');
      runSync();
    } else {
      alert("Commish Pass Incorrect");
    }
  };

  const onJoin = (e: React.FormEvent, handle: string, real: string, av: string) => {
    e.preventDefault();
    const id = currentUser?.id || generateId();
    const newUser: User = { id, username: handle, realName: real, avatar: av, credits: currentUser?.credits || 0 };
    setCurrentUser(newUser);
    setMode('GAME');
  };

  if (mode === 'LANDING' || !currentUser) {
    return (
      <div className="fixed inset-0 nfl-gradient flex items-center justify-center p-6">
        <div className="max-w-md w-full glass-card p-8 rounded-[3rem] text-center shadow-2xl">
          <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-2xl rotate-3 border-4 border-red-600">
            <i className="fas fa-football-ball text-red-600 text-3xl"></i>
          </div>
          <h1 className="text-3xl font-black font-orbitron mb-2 uppercase tracking-tighter">SBLIX HUB</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-8">Mesh Network Active: {partyCode}</p>
          <GuestLogin onLogin={onJoin} isHost={isHost} />
          {!isHost && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <form onSubmit={handleHostAuth} className="flex gap-2">
                <input type="password" placeholder="Commish Key" value={hostKeyInput} onChange={e => setHostKeyInput(e.target.value)} className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none text-white focus:border-red-500" />
                <button type="submit" className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase">Auth</button>
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
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'}`}></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <div className="text-[10px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-green-400">
               {currentUser.credits} PTS
             </div>
             <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-lg">
               {currentUser.avatar}
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatRoom user={currentUser} messages={messages} users={users} onSendMessage={onSendMessage} />}
        {activeTab === 'bets' && (
          <BettingPanel 
            propBets={propBets} user={currentUser} allBets={userBets}
            onPlaceBet={(bid, amt, sel) => {
              const bet: UserBet = { id: generateId(), userId: currentUser.id, betId: bid, amount: 0, selection: sel, status: BetStatus.PENDING, placedAt: Date.now() };
              setUserBets(p => [...p, bet]);
              runSync();
            }}
          />
        )}
        {activeTab === 'leaderboard' && (
          <div className="h-full flex flex-col overflow-hidden">
            <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
            <div className="p-4 border-t border-white/5 bg-slate-900/50 text-center">
               <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Hub Mesh Mode</p>
               <p className="text-[10px] text-green-400 font-black">{users.length} DEVICES DISCOVERED</p>
            </div>
          </div>
        )}
        {activeTab === 'command' && isHost && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
             <div className="glass-card p-6 rounded-[2rem] text-center border-blue-500/20 bg-blue-600/5">
                <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Commish Control Hub</h2>
                <div className="bg-white p-4 rounded-2xl w-fit mx-auto shadow-2xl mb-4">
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?room=' + partyCode)}`} alt="QR" />
                </div>
                <button 
                  onClick={() => { navigator.clipboard.writeText(window.location.origin + window.location.pathname + '?room=' + partyCode); alert("Copied!"); }} 
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs"
                >COPY PARTY LINK</button>
             </div>
             <div className="space-y-4">
                <h3 className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">Live Prop Settlement</h3>
                {propBets.map(bet => (
                  <div key={bet.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                    <p className="text-xs font-bold text-slate-300 mb-3">{bet.question}</p>
                    <div className="flex gap-2">
                      {bet.options.map(opt => (
                        <button 
                          key={opt}
                          onClick={() => {
                            const upd = propBets.map(pb => pb.id === bet.id ? { ...pb, resolved: true, outcome: opt } : pb);
                            setPropBets(upd);
                            setTimeout(runSync, 100);
                          }}
                          className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase ${bet.outcome === opt ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-500'}`}
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
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 pb-safe flex shrink-0">
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' },
            ...(isHost ? [{ id: 'command', icon: 'fa-cog', label: 'Commish' }] : [])
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex-1 py-4 flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-red-500' : 'text-slate-500'}`}>
              <i className={`fas ${tab.icon} text-lg`}></i>
              <span className="text-[8px] font-black uppercase">{tab.label}</span>
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
          <button type="button" key={a} onClick={() => setAv(a)} className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center ${av === a ? 'bg-red-600 border-2 border-white scale-110' : 'bg-slate-800 opacity-40'}`}>
            {a}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        <input type="text" placeholder="Handle" required value={handle} onChange={e => setHandle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <input type="text" placeholder="Real Name" required value={real} onChange={e => setReal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 text-sm" />
        <button type="submit" onClick={e => onLogin(e, handle, real, av)} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase text-sm shadow-xl hover:bg-slate-100">
          {isHost ? 'ACCESS COMMISSIONER SUITE' : 'JOIN THE PARTY'}
        </button>
      </div>
    </div>
  );
};

export default App;
