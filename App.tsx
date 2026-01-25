import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  isFirebaseConfigured 
} from './services/firebaseService';
import { User, PropBet, UserBet, ChatMessage } from './types';
import { NFL_TEAMS, INITIAL_PROPS } from './constants';
import TeamHelmet from './components/TeamHelmet';
import BettingPanel from './components/BettingPanel';
import Leaderboard from './components/Leaderboard';
import ChatRoom from './components/ChatRoom';

const generateId = () => Math.random().toString(36).substring(2, 11);

export default function App() {
  const [view, setView] = useState<'landing' | 'onboarding' | 'game'>('landing');
  const [activeTab, setActiveTab] = useState<'props' | 'chat' | 'leaderboard'>('props');
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '');
  const [localUser, setLocalUser] = useState<User | null>(null);
  
  const [roomUsers, setRoomUsers] = useState<User[]>([]);
  const [roomProps, setRoomProps] = useState<PropBet[]>([]);
  const [roomBets, setRoomBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Auth Persistence
  useEffect(() => {
    const saved = localStorage.getItem('sblix_user');
    if (saved) {
      setLocalUser(JSON.parse(saved));
      if (roomCode) setView('game');
    }
  }, [roomCode]);

  // Sync Data
  useEffect(() => {
    if (view === 'game' && roomCode && db) {
      const unsubUsers = onSnapshot(collection(db, "rooms", roomCode, "users"), (s) => 
        setRoomUsers(s.docs.map(d => d.data() as User))
      );
      const unsubProps = onSnapshot(collection(db, "rooms", roomCode, "props"), (s) => {
        const p = s.docs.map(d => ({ ...d.data(), id: d.id } as PropBet));
        setRoomProps(p.length ? p : INITIAL_PROPS);
      });
      const unsubBets = onSnapshot(collection(db, "rooms", roomCode, "bets"), (s) =>
        setRoomBets(s.docs.map(d => d.data() as UserBet))
      );
      const q = query(collection(db, "rooms", roomCode, "messages"), orderBy("timestamp", "asc"), limit(50));
      const unsubChat = onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ChatMessage)));
      });

      return () => { 
        unsubUsers(); 
        unsubProps(); 
        unsubBets(); 
        unsubChat();
      };
    }
  }, [view, roomCode]);

  const handleJoin = () => {
    if (!roomCode) return;
    localUser ? setView('game') : setView('onboarding');
  };

  const finalizeUser = async (name: string, team: string) => {
    const u: User = { id: generateId(), name, team, score: 0 };
    setLocalUser(u);
    localStorage.setItem('sblix_user', JSON.stringify(u));
    
    if (db) {
      await setDoc(doc(db, "rooms", roomCode, "users", u.id), u);
      // Seed props for new room
      const propsRef = collection(db, "rooms", roomCode, "props");
      INITIAL_PROPS.forEach(p => setDoc(doc(propsRef, p.id), p));
    }
    setView('game');
  };

  const handlePick = async (betId: string, selection: string) => {
    if (!localUser || !db) return;
    const bet: UserBet = { id: generateId(), userId: localUser.id, betId, selection };
    await setDoc(doc(db, "rooms", roomCode, "bets", `${localUser.id}_${betId}`), bet);
  };

  const handleSendMessage = async (text: string) => {
    if (!localUser || !db) return;
    try {
      await addDoc(collection(db, "rooms", roomCode, "messages"), {
        userId: localUser.id,
        userName: localUser.name,
        userTeam: localUser.team,
        text,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Chat Error:", err);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center">
        <div className="glass-card p-8 rounded-3xl border-red-500/20">
          <h1 className="text-red-400 font-orbitron font-black text-xl mb-4">FIREBASE CONFIG MISSING</h1>
          <p className="text-slate-500 text-sm">Please provide your API key in firebaseService.ts</p>
        </div>
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-8 bg-slate-950">
        <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center mb-8 status-pulse shadow-[0_0_30px_rgba(16,185,129,0.2)]">
          <i className="fas fa-football text-white text-3xl"></i>
        </div>
        <h1 className="text-5xl font-orbitron font-black italic mb-2 tracking-tighter">SBLIX</h1>
        <p className="text-[10px] text-emerald-500 font-black tracking-[0.5em] mb-12 uppercase opacity-50">Prop Pool Protocol</p>
        
        <div className="w-full max-w-xs space-y-4">
          <input 
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
            placeholder="PARTY CODE"
            className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-5 font-black text-center text-xl outline-none focus:border-emerald-500 transition-all uppercase"
          />
          <button 
            onClick={handleJoin}
            disabled={!roomCode}
            className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all disabled:opacity-20"
          >
            Enter Stadium
          </button>
        </div>
      </div>
    );
  }

  if (view === 'onboarding') {
    return <OnboardingView onComplete={finalizeUser} />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <header className="px-6 pt-12 pb-6 flex justify-between items-center border-b border-white/5 bg-slate-900/40 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <TeamHelmet teamId={localUser?.team} size="md" />
          <div>
            <h2 className="font-orbitron font-black text-white italic uppercase">
              {activeTab === 'props' ? 'The Pool' : activeTab === 'chat' ? 'Comms' : 'Leaderboard'}
            </h2>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Room: {roomCode}</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-emerald-500">{roomUsers.length} ONLINE</span>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'props' && (
          <BettingPanel 
            propBets={roomProps} 
            user={localUser!} 
            onPlaceBet={handlePick} 
            allBets={roomBets} 
          />
        )}
        {activeTab === 'chat' && (
          <ChatRoom 
            messages={messages}
            currentUser={localUser!}
            onSendMessage={handleSendMessage}
          />
        )}
        {activeTab === 'leaderboard' && (
          <Leaderboard 
            users={roomUsers} 
            currentUser={localUser!} 
            propBets={roomProps} 
            userBets={roomBets} 
          />
        )}
      </main>

      <nav className="bg-slate-900/90 border-t border-white/5 p-4 pb-safe flex justify-around items-center shrink-0">
        <button 
          onClick={() => setActiveTab('props')}
          className={`flex flex-col items-center gap-1 flex-1 py-2 ${activeTab === 'props' ? 'text-emerald-500' : 'text-slate-600'}`}
        >
          <i className="fas fa-ticket-alt text-xl"></i>
          <span className="text-[9px] font-black uppercase tracking-widest">Props</span>
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 flex-1 py-2 ${activeTab === 'chat' ? 'text-emerald-500' : 'text-slate-600'}`}
        >
          <i className="fas fa-comment-dots text-xl"></i>
          <span className="text-[9px] font-black uppercase tracking-widest">Chat</span>
        </button>
        <button 
          onClick={() => setActiveTab('leaderboard')}
          className={`flex flex-col items-center gap-1 flex-1 py-2 ${activeTab === 'leaderboard' ? 'text-emerald-500' : 'text-slate-600'}`}
        >
          <i className="fas fa-trophy text-xl"></i>
          <span className="text-[9px] font-black uppercase tracking-widest">Rank</span>
        </button>
      </nav>
    </div>
  );
}

function OnboardingView({ onComplete }: { onComplete: (name: string, team: string) => void }) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState('KC');

  return (
    <div className="h-screen flex flex-col justify-center p-8 max-w-md mx-auto bg-slate-950">
      <h2 className="text-3xl font-orbitron font-black mb-8 italic uppercase tracking-tighter">Registration</h2>
      
      <div className="space-y-8">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Screen Name</label>
          <input 
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="PLAYER_1"
            className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 font-bold outline-none focus:border-emerald-500 transition-colors uppercase text-white"
          />
        </div>
        
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center block">Favored Squad</label>
          <div className="grid grid-cols-2 gap-3">
            {NFL_TEAMS.map(t => (
              <button 
                key={t.id}
                onClick={() => setTeam(t.id)}
                className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${team === t.id ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-slate-900 border-white/5 opacity-50'}`}
              >
                <TeamHelmet teamId={t.id} size="sm" />
                <span className="text-xs font-black uppercase">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button 
        onClick={() => name && onComplete(name, team)}
        className="w-full py-6 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-2xl active:scale-95 mt-12 shadow-lg"
      >
        Kick Off
      </button>
    </div>
  );
}