import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  query, 
  orderBy,
  limit,
  isFirebaseConfigured 
} from './services/firebaseService.ts';
import { User, PropBet, UserBet, ChatMessage, GameState } from './types.ts';
import { NFL_TEAMS } from './constants.ts';
import BettingPanel from './components/BettingPanel.tsx';
import ChatRoom from './components/ChatRoom.tsx';
import Leaderboard from './components/Leaderboard.tsx';
import TeamHelmet from './components/TeamHelmet.tsx';
import { generateLiveProps, resolveProps, getGameUpdate } from './services/geminiService.ts';

const generateId = () => Math.random().toString(36).substring(2, 11);

export default function App() {
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '');
  const [view, setView] = useState<'landing' | 'onboarding' | 'main' | 'host'>(() => {
    if (new URLSearchParams(window.location.search).get('room')) return 'onboarding';
    return 'landing';
  });

  const [localUser, setLocalUser] = useState<User | null>(() => {
    const uId = localStorage.getItem('sblix_uid');
    const uName = localStorage.getItem('sblix_uname');
    const uTeam = localStorage.getItem('sblix_uteam');
    if (uId && uName) return { id: uId, name: uName, handle: uName, team: uTeam || 'KC', deviceType: 'mobile', score: 0, lastPulse: Date.now(), isVerified: true, pingCount: 0 };
    return null;
  });

  const [activeTab, setActiveTab] = useState<'bets' | 'chat' | 'scores'>('bets');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>([]);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- CONFIGURATION HELPER ---
  if (!isFirebaseConfigured) {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-8 glass-card p-10 border-emerald-500/30">
          <div className="w-20 h-20 bg-emerald-600 rounded-3xl mx-auto flex items-center justify-center status-pulse">
            <i className="fas fa-key text-white text-3xl"></i>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-orbitron font-black text-white italic">SETUP REQUIRED</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Your site is almost ready! To sync with your 20 guests, you need to add your <span className="text-emerald-500 font-bold">API Key</span> to the code.
            </p>
          </div>
          <div className="bg-slate-900 rounded-2xl p-6 text-left space-y-4 border border-white/5">
            <div className="flex gap-4">
              <span className="bg-emerald-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0">1</span>
              <p className="text-[12px] text-slate-300">Click the <b>Gear icon</b> (Settings) in your Firebase console.</p>
            </div>
            <div className="flex gap-4">
              <span className="bg-emerald-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0">2</span>
              <p className="text-[12px] text-slate-300">Register a <b>Web App</b> and copy the <b>apiKey</b> and <b>appId</b>.</p>
            </div>
            <div className="flex gap-4">
              <span className="bg-emerald-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0">3</span>
              <p className="text-[12px] text-slate-300">Paste them into <code>services/firebaseService.ts</code>.</p>
            </div>
          </div>
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Waiting for Cloud Credentials...</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!roomCode || !db) return;

    const unsubUsers = onSnapshot(collection(db, "rooms", roomCode, "users"), (s) => setAllUsers(s.docs.map(d => d.data() as User)));
    const unsubProps = onSnapshot(query(collection(db, "rooms", roomCode, "props"), orderBy("id", "desc")), (s) => setPropBets(s.docs.map(d => d.data() as PropBet)));
    const unsubBets = onSnapshot(collection(db, "rooms", roomCode, "bets"), (s) => setUserBets(s.docs.map(d => d.data() as UserBet)));
    const unsubChat = onSnapshot(query(collection(db, "rooms", roomCode, "messages"), orderBy("timestamp", "desc"), limit(50)), (s) => setMessages(s.docs.map(d => d.data() as ChatMessage).reverse()));
    const unsubGame = onSnapshot(doc(db, "rooms", roomCode, "state", "live"), (d) => d.exists() && setGameState(d.data() as GameState));

    return () => { unsubUsers(); unsubProps(); unsubBets(); unsubChat(); unsubGame(); };
  }, [roomCode]);

  const handleJoin = async (name: string, team: string) => {
    const id = generateId();
    const user: User = { id, name, handle: name, team, deviceType: 'mobile', score: 0, lastPulse: Date.now(), isVerified: true, pingCount: 0 };
    localStorage.setItem('sblix_uid', id);
    localStorage.setItem('sblix_uname', name);
    localStorage.setItem('sblix_uteam', team);
    setLocalUser(user);
    if (db) await setDoc(doc(db, "rooms", roomCode, "users", id), user);
    setView('main');
  };

  const handleAiOperations = async () => {
    if (!roomCode || !db) return;
    setIsAiLoading(true);
    try {
      const freshGame = await getGameUpdate();
      if (freshGame) await setDoc(doc(db, "rooms", roomCode, "state", "live"), freshGame);

      const results = await resolveProps(propBets);
      for (const res of results) {
        await updateDoc(doc(db, "rooms", roomCode, "props", res.id), { resolved: true, winner: res.winner });
      }

      if (freshGame) {
        const newProps = await generateLiveProps(freshGame);
        for (const p of newProps) {
          const id = `p-ai-${generateId()}`;
          await setDoc(doc(db, "rooms", roomCode, "props", id), { ...p, id, resolved: false });
        }
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  if (view === 'landing') {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8">
        <div className="max-w-xs w-full space-y-12 text-center">
          <div className="w-24 h-24 bg-emerald-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.3)] status-pulse">
            <i className="fas fa-football text-white text-4xl"></i>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-orbitron font-black text-white italic tracking-tighter uppercase">SBLIX</h1>
            <p className="text-[10px] font-black text-slate-500 tracking-[0.4em] uppercase">Super Bowl LIX Mesh</p>
          </div>
          <div className="space-y-3">
             <input placeholder="ROOM CODE" className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 font-bold text-center text-white outline-none focus:border-emerald-500" onChange={(e) => setRoomCode(e.target.value.toUpperCase())} />
             <button onClick={() => roomCode && setView('host')} className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-3xl shadow-2xl active:scale-95 transition-all">Launch Hub</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'host') {
    return (
      <div className="min-h-screen bg-[#020410] text-white p-6 lg:p-12 font-inter">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-4 space-y-8">
            <h1 className="text-5xl font-orbitron font-black italic leading-none">HUB<br/><span className="text-emerald-500">MASTER</span></h1>
            <div className="glass-card p-8 bg-slate-900/50 space-y-6">
               <div className="bg-white p-4 rounded-3xl mx-auto max-w-[200px]">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '?room=' + roomCode)}`} className="w-full" />
               </div>
               <div className="text-center font-orbitron text-3xl font-black">{roomCode}</div>
               <button onClick={handleAiOperations} disabled={isAiLoading} className="w-full py-5 bg-emerald-600 text-black rounded-2xl font-black uppercase flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                 {isAiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                 Sync Game & Resolves
               </button>
            </div>
            {gameState && (
              <div className="p-6 bg-slate-900 border border-white/5 rounded-3xl text-center">
                <div className="text-[10px] font-black text-slate-500 uppercase">Live Update</div>
                <div className="text-2xl font-orbitron font-black text-emerald-500 uppercase">{gameState.quarter} - {gameState.time}</div>
                <div className="text-3xl font-black mt-2">{gameState.scoreHome} - {gameState.scoreAway}</div>
              </div>
            )}
          </div>
          <div className="lg:col-span-8">
            <Leaderboard users={allUsers} currentUser={allUsers[0] || localUser} propBets={propBets} userBets={userBets} />
          </div>
        </div>
      </div>
    );
  }

  if (view === 'main' && localUser) {
    return (
      <div className="h-screen flex flex-col bg-[#020617] overflow-hidden">
        <header className="px-6 pt-12 pb-6 flex justify-between items-center bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
             <TeamHelmet teamId={localUser.team} size="md" />
             <div>
                <h1 className="font-orbitron font-black text-xl italic leading-none text-white">SBLIX</h1>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{roomCode}</span>
             </div>
          </div>
          {gameState && (
             <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                <div className="text-[7px] font-black text-emerald-500 uppercase">Live</div>
                <div className="text-[10px] font-orbitron font-black text-white">{gameState.scoreHome}-{gameState.scoreAway}</div>
             </div>
          )}
        </header>

        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'bets' && <BettingPanel propBets={propBets} user={localUser} onPlaceBet={async (bid, sel) => {
            const bet: UserBet = { id: generateId(), userId: localUser.id, betId: bid, selection: sel, timestamp: Date.now() };
            if (db) await setDoc(doc(db, "rooms", roomCode, "bets", bet.id), bet);
          }} allBets={userBets} />}
          {activeTab === 'chat' && <ChatRoom user={localUser} messages={messages} onSendMessage={async (txt) => {
             const msg: ChatMessage = { id: generateId(), userId: localUser.id, userName: localUser.name, text: txt, timestamp: Date.now() };
             if (db) await setDoc(doc(db, "rooms", roomCode, "messages", msg.id), msg);
          }} users={allUsers} />}
          {activeTab === 'scores' && <Leaderboard users={allUsers} currentUser={localUser} propBets={propBets} userBets={userBets} />}
        </main>

        <nav className="shrink-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/5 flex justify-around pb-safe">
           {[{id:'bets',i:'ticket-alt',l:'Props'},{id:'chat',i:'comment-alt',l:'Chat'},{id:'scores',i:'trophy',l:'Rank'}].map(t => (
             <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex flex-col items-center py-4 px-8 gap-1 transition-all ${activeTab === t.id ? 'text-emerald-500' : 'text-slate-500'}`}>
               <i className={`fas fa-${t.i} text-lg`}></i>
               <span className="text-[8px] font-black uppercase">{t.l}</span>
             </button>
           ))}
        </nav>
      </div>
    );
  }

  if (view === 'onboarding') {
    return (
      <div className="h-screen bg-[#020617] p-8 flex flex-col justify-center max-w-md mx-auto">
        <h2 className="text-3xl font-orbitron font-black italic mb-8 uppercase text-white">Huddle <span className="text-emerald-500">Up</span></h2>
        <div className="space-y-6">
           <input id="joinName" placeholder="ENTER NAME" className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 font-bold text-white outline-none focus:border-emerald-500" />
           <div className="grid grid-cols-3 gap-3">
             {NFL_TEAMS.map(t => (
               <button key={t.id} onClick={() => (window as any).selectedTeam = t.id} className="p-4 bg-slate-900 rounded-2xl border border-white/5 hover:border-emerald-500 flex flex-col items-center gap-2 focus:bg-emerald-500/10 focus:border-emerald-500 transition-all">
                 <TeamHelmet teamId={t.id} size="md" />
                 <span className="text-[8px] font-black uppercase text-slate-400">{t.name}</span>
               </button>
             ))}
           </div>
           <button onClick={() => {
             const n = (document.getElementById('joinName') as HTMLInputElement).value;
             if (n) handleJoin(n, (window as any).selectedTeam || 'KC');
           }} className="w-full py-6 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-3xl shadow-xl active:scale-95 transition-all">Join Game</button>
        </div>
      </div>
    );
  }

  return null;
}