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
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    if (urlRoom) return 'onboarding';
    return 'landing';
  });

  const [localUser, setLocalUser] = useState<User | null>(() => {
    const uId = localStorage.getItem('sblix_uid');
    const uName = localStorage.getItem('sblix_uname');
    const uTeam = localStorage.getItem('sblix_uteam');
    if (uId && uName) {
      return { 
        id: uId, name: uName, handle: uName, team: uTeam || 'KC', 
        deviceType: 'mobile', score: 0, lastPulse: Date.now(), 
        isVerified: true, pingCount: 0 
      };
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState<'bets' | 'chat' | 'scores'>('bets');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>([]);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

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
          await setDoc(doc(db, "rooms", roomCode, "props", id), { ...p, id, resolved: false } as PropBet);
        }
      }
    } catch (e) {
      console.error("AI Update Failed", e);
    } finally {
      setIsAiLoading(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center p-8 text-center">
        <div className="glass-card p-10 border-emerald-500/30 max-w-md">
          <h1 className="text-2xl font-orbitron font-black text-white mb-4 italic">SETUP REQUIRED</h1>
          <p className="text-slate-400 text-sm">Update the Firebase credentials in <code>services/firebaseService.ts</code> to initialize the party mesh protocol.</p>
        </div>
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <div className="h-screen bg-[#020617] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-emerald-600 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.3)] status-pulse mb-8">
          <i className="fas fa-football text-white text-4xl"></i>
        </div>
        <h1 className="text-6xl font-orbitron font-black text-white italic tracking-tighter uppercase mb-2">SBLIX</h1>
        <p className="text-[11px] font-black text-slate-500 tracking-[0.5em] uppercase mb-12">Registry Mesh Protocol</p>
        
        <div className="w-full max-w-xs space-y-4">
          <input 
            placeholder="ROOM ID" 
            className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-5 font-bold text-center text-white outline-none focus:border-emerald-500 uppercase tracking-widest transition-all text-xl" 
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())} 
          />
          <button 
            onClick={() => roomCode && setView('host')} 
            className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-3xl shadow-2xl active:scale-95 transition-all hover:bg-emerald-400"
          >
            Launch Hub
          </button>
          <button 
            onClick={() => roomCode && setView('onboarding')} 
            className="text-slate-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors"
          >
            Join Existing Room
          </button>
        </div>
      </div>
    );
  }

  if (view === 'host') {
    return (
      <div className="min-h-screen bg-[#020410] text-white p-4 sm:p-10 font-inter">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12">
          <div className="lg:col-span-5 space-y-8">
            <header className="flex items-center gap-4">
               <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                 <i className="fas fa-satellite text-black text-xl"></i>
               </div>
               <h1 className="text-4xl font-orbitron font-black italic">SBLIX <span className="text-emerald-500">HUB</span></h1>
            </header>

            <div className="glass-card p-10 bg-slate-900/50 space-y-8 text-center border-emerald-500/10 shadow-2xl">
               <div className="bg-white p-5 rounded-[2.5rem] mx-auto w-fit shadow-[0_0_60px_rgba(255,255,255,0.1)]">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin + '?room=' + roomCode)}`} className="w-64 h-64 rounded-2xl" alt="Join QR" />
               </div>
               <div>
                 <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Protocol Address</div>
                 <div className="font-orbitron text-6xl font-black text-emerald-400 tracking-tighter uppercase italic">{roomCode}</div>
               </div>
               <button 
                 onClick={handleAiOperations} 
                 disabled={isAiLoading} 
                 className="w-full py-6 bg-emerald-600 text-black rounded-3xl font-black uppercase flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 transition-all shadow-[0_20px_50px_rgba(16,185,129,0.3)] text-lg"
               >
                 {isAiLoading ? <i className="fas fa-sync fa-spin"></i> : <i className="fas fa-bolt"></i>}
                 {isAiLoading ? 'Syncing Game...' : 'Sync Live Game Data'}
               </button>
            </div>

            {gameState && (
              <div className="p-8 bg-slate-900/80 border border-white/5 rounded-[3rem] text-center shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-pulse"></div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  Live Feed Synchronized
                </div>
                <div className="text-4xl font-orbitron font-black text-white uppercase italic leading-none mb-4">{gameState.quarter} <span className="text-emerald-500">•</span> {gameState.time}</div>
                <div className="flex justify-center items-center gap-10">
                   <div className="text-center">
                      <div className="text-6xl font-black tracking-tighter">{gameState.scoreHome}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">HOME</div>
                   </div>
                   <div className="text-3xl text-slate-700 font-black italic">VS</div>
                   <div className="text-center">
                      <div className="text-6xl font-black tracking-tighter">{gameState.scoreAway}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">AWAY</div>
                   </div>
                </div>
              </div>
            )}
          </div>
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="flex justify-between items-end px-4">
               <h2 className="text-2xl font-orbitron font-black uppercase italic tracking-tight">Party <span className="text-slate-600">Leaderboard</span></h2>
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">{allUsers.length} Devices Online</span>
               </div>
            </div>
            <div className="bg-slate-900/30 rounded-[3rem] border border-white/5 overflow-hidden h-[600px]">
               <Leaderboard users={allUsers} currentUser={localUser || allUsers[0]} propBets={propBets} userBets={userBets} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'main' && localUser) {
    return (
      <div className="h-screen flex flex-col bg-[#020617] overflow-hidden">
        <header className="px-6 pt-12 pb-6 flex justify-between items-center bg-slate-900/40 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
             <TeamHelmet teamId={localUser.team} size="md" />
             <div>
                <h1 className="font-orbitron font-black text-xl italic text-white leading-none">SBLIX</h1>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">RM: {roomCode}</span>
             </div>
          </div>
          {gameState && (
             <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                <div className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Scoreboard</div>
                <div className="text-sm font-orbitron font-black text-white">{gameState.scoreHome}-{gameState.scoreAway}</div>
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

        <nav className="shrink-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/5 flex justify-around pb-safe">
           {[
             {id:'bets',i:'ticket-alt',l:'Prop Pool'},
             {id:'chat',i:'comment-dots',l:'Huddle'},
             {id:'scores',i:'trophy',l:'Standings'}
           ].map(t => (
             <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex flex-col items-center py-5 px-8 gap-1.5 transition-all relative ${activeTab === t.id ? 'text-emerald-400' : 'text-slate-500'}`}>
               {activeTab === t.id && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-400 rounded-full"></span>}
               <i className={`fas fa-${t.i} text-xl`}></i>
               <span className="text-[9px] font-black uppercase tracking-tighter">{t.l}</span>
             </button>
           ))}
        </nav>
      </div>
    );
  }

  if (view === 'onboarding') {
    return (
      <div className="h-screen bg-[#020617] p-8 flex flex-col justify-center max-w-md mx-auto">
        <h2 className="text-4xl font-orbitron font-black italic mb-2 uppercase text-white leading-none">JOIN THE<br/><span className="text-emerald-500">HUDDLE</span></h2>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-10">Syncing with Room: {roomCode}</p>
        
        <div className="space-y-8">
           <div className="space-y-2">
             <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Display Name</label>
             <input id="joinName" placeholder="PLAYER_ONE" className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-5 font-bold text-white outline-none focus:border-emerald-500 transition-all uppercase" />
           </div>
           
           <div className="space-y-3">
             <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Loyalty</label>
             <div className="grid grid-cols-3 gap-3">
               {NFL_TEAMS.slice(0, 6).map(t => (
                 <button 
                  key={t.id} 
                  onClick={() => (window as any).selectedTeam = t.id} 
                  className="p-4 bg-slate-900/50 rounded-2xl border border-white/5 hover:border-emerald-500 focus:border-emerald-500 focus:bg-emerald-500/5 transition-all flex flex-col items-center gap-2 group"
                 >
                   <TeamHelmet teamId={t.id} size="md" className="group-hover:scale-110 transition-transform" />
                   <span className="text-[10px] font-black uppercase text-slate-600 group-focus:text-emerald-400">{t.id}</span>
                 </button>
               ))}
             </div>
           </div>

           <button 
            onClick={() => {
             const n = (document.getElementById('joinName') as HTMLInputElement).value;
             if (n) handleJoin(n, (window as any).selectedTeam || 'KC');
            }} 
            className="w-full py-6 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-3xl shadow-[0_10px_40px_rgba(16,185,129,0.2)] active:scale-95 transition-all mt-4"
           >
            Connect to Mesh
           </button>
        </div>
      </div>
    );
  }

  return null;
}