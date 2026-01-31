import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, setDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, getDoc } from './services/firebaseService';
import { getCoachResponse, getSidelineFact, getLiveScoreFromSearch, analyzeMomentum } from './services/geminiService';
import { ChatMessage, User, TriviaQuestion, ScoreEntry } from './types';

const MSG_COLLECTION = 'hub_v3_messages';
const GAME_STATE_DOC = 'hub_v3_state';
const HYPE_COLLECTION = 'hub_v3_hype';

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sblix_u3');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'trivia' | 'ranks'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameScore, setGameScore] = useState({ s1: 0, s2: 0, t1: "RAMS", t2: "SEAHAWKS", status: "LIVE", momentum: 50 });
  const [hypePulse, setHypePulse] = useState<{ team: string; id: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Automation Loop: Scores and Momentum
  useEffect(() => {
    if (!user || !db) return;

    const runAutomation = async () => {
      const stateRef = doc(db, GAME_STATE_DOC, 'global');
      const stateSnap = await getDoc(stateRef);
      const data = stateSnap.exists() ? stateSnap.data() : {};
      const now = Date.now();

      // Sync Score & Momentum every 90 seconds
      if (now - (data.lastUpdate || 0) > 90000) {
        setIsSyncing(true);
        await setDoc(stateRef, { lastUpdate: now }, { merge: true });
        
        const score = await getLiveScoreFromSearch();
        if (score) {
          const momentum = await analyzeMomentum({ rams: score.score1, seahawks: score.score2 });
          await setDoc(stateRef, {
            s1: score.score1, s2: score.score2,
            t1: score.team1, t2: score.team2,
            status: score.status,
            momentum,
            lastUpdate: now
          }, { merge: true });
        }
        setIsSyncing(false);
      }
    };

    runAutomation();
    const interval = setInterval(runAutomation, 45000);
    return () => clearInterval(interval);
  }, [user]);

  // Real-time Listeners
  useEffect(() => {
    if (!user || !db) return;

    // Listen to Game State
    const unsubState = onSnapshot(doc(db, GAME_STATE_DOC, 'global'), (snap) => {
      if (snap.exists()) setGameScore(snap.data() as any);
    });

    // Listen to Chat
    const qChat = query(collection(db, MSG_COLLECTION), orderBy('timestamp', 'asc'), limit(50));
    const unsubChat = onSnapshot(qChat, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    // Listen to Hype Pulses
    const qHype = query(collection(db, HYPE_COLLECTION), orderBy('timestamp', 'desc'), limit(1));
    const unsubHype = onSnapshot(qHype, (snap) => {
      if (!snap.empty) {
        const hype = snap.docs[0].data();
        setHypePulse({ team: hype.team, id: Date.now() });
      }
    });

    return () => { unsubState(); unsubChat(); unsubHype(); };
  }, [user]);

  const sendHype = async (team: 'T1' | 'T2') => {
    if (!db) return;
    await addDoc(collection(db, HYPE_COLLECTION), {
      team,
      userId: user?.id,
      timestamp: serverTimestamp()
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.currentTarget.elements[0] as HTMLInputElement).value.toUpperCase();
    if (!name) return;
    const newUser = { id: 'u' + Math.random().toString(36).substr(2, 4), name };
    setUser(newUser);
    localStorage.setItem('sblix_u3', JSON.stringify(newUser));
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 relative overflow-hidden">
        <div className="scanline"></div>
        <div className="w-full max-w-md p-8 glass rounded-[3rem] text-center border-emerald-500/20 shadow-2xl relative z-10">
          <h1 className="font-orbitron text-4xl font-black italic text-white mb-2 tracking-tighter">SBLIX LIX</h1>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-8">Ultimate Party Hub</p>
          <form onSubmit={handleJoin} className="space-y-6">
            <input placeholder="ENTER CALLSIGN" className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-5 text-white font-black text-center uppercase outline-none focus:border-emerald-500 transition-all text-xl" />
            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/40 uppercase tracking-widest text-lg">ENTER STADIUM</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-screen max-w-lg mx-auto bg-slate-950 shadow-2xl overflow-hidden relative transition-all duration-300 ${hypePulse?.team === 'T1' ? 'shadow-[inset_0_0_100px_rgba(59,130,246,0.3)]' : hypePulse?.team === 'T2' ? 'shadow-[inset_0_0_100px_rgba(16,185,129,0.3)]' : ''}`}>
      <div className="scanline"></div>
      
      {/* HUD HEADER */}
      <header className="p-6 glass border-b border-white/10 z-50">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">LIVE BROADCAST</span>
          </div>
          {isSyncing && <i className="fas fa-satellite text-blue-500 text-[10px] animate-bounce"></i>}
        </div>

        {/* JUMBOTRON SCOREBOARD */}
        <div className="flex justify-between items-center px-6 py-5 bg-black/60 rounded-[2rem] border border-white/5 relative overflow-hidden group">
          <div className="text-center w-24">
            <p className="text-[10px] font-black text-blue-500 uppercase mb-1 truncate">{gameScore.t1}</p>
            <p className="text-4xl font-orbitron font-black text-white italic drop-shadow-md">{gameScore.s1}</p>
          </div>
          <div className="flex flex-col items-center">
             <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full mb-3">
               <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">{gameScore.status}</p>
             </div>
             {/* MOMENTUM BAR */}
             <div className="w-20 h-1 bg-slate-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${100 - gameScore.momentum}%` }} className="h-full bg-blue-500 transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                <div style={{ width: `${gameScore.momentum}%` }} className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
             </div>
             <p className="text-[7px] font-black text-slate-500 uppercase mt-2 tracking-tighter">VIBE MOMENTUM</p>
          </div>
          <div className="text-center w-24">
            <p className="text-[10px] font-black text-emerald-500 uppercase mb-1 truncate">{gameScore.t2}</p>
            <p className="text-4xl font-orbitron font-black text-white italic drop-shadow-md">{gameScore.s2}</p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          {['chat', 'trivia', 'ranks'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}>{tab}</button>
          ))}
        </div>
      </header>

      {/* FEED CONTENT */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {activeTab === 'chat' && (
          <div className="space-y-4 pb-32">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'} msg-animate`}>
                <span className={`text-[8px] font-black uppercase mb-1 px-2 ${msg.senderId === 'sideline_bot_ai' ? 'text-emerald-400' : 'text-slate-500'}`}>
                   {msg.senderName} {msg.senderId === 'sideline_bot_ai' && '• ANALYST'}
                </span>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                  msg.senderId === user.id ? 'bg-emerald-600 text-white rounded-tr-none' : 
                  msg.senderId === 'sideline_bot_ai' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 italic rounded-tl-none font-medium' :
                  'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'trivia' && (
          <div className="pb-10 text-center py-20 opacity-50">
            <i className="fas fa-lock text-4xl mb-4 text-emerald-500"></i>
            <p className="font-orbitron font-black uppercase text-white">Next Trivia Round</p>
            <p className="text-xs text-slate-500 mt-2">ROUND 2 STARTING IN 5:00</p>
          </div>
        )}

        {activeTab === 'ranks' && (
          <div className="space-y-3 pb-10">
            <p className="text-[10px] font-black text-center text-slate-600 uppercase mb-4">Live Hub Rankings</p>
            {[{u: 'MVP_JAKE', p: 1200}, {u: 'SEA_FAN_99', p: 950}, {u: user.name, p: 400}].map((s, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center font-black text-emerald-500">{i+1}</div>
                <div className="flex-1 font-black text-sm uppercase text-white">{s.u}</div>
                <div className="font-orbitron font-black text-emerald-400">{s.p}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER INTERACTION */}
      {activeTab === 'chat' && (
        <div className="absolute bottom-0 inset-x-0 p-4 glass border-t border-white/10 z-[60] pb-10">
          {/* HYPE SPAM BAR */}
          <div className="flex gap-2 mb-4">
             <button onClick={() => sendHype('T1')} className="flex-1 bg-blue-600/20 border border-blue-500/40 text-blue-400 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600/40 transition-all active:scale-95">RAMS HYPE</button>
             <button onClick={() => sendHype('T2')} className="flex-1 bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600/40 transition-all active:scale-95">SEA HYPE</button>
          </div>
          
          <form onSubmit={(e) => { 
            e.preventDefault(); 
            const input = e.currentTarget.elements[0] as HTMLInputElement; 
            if (!input.value.trim()) return; 
            addDoc(collection(db!, MSG_COLLECTION), { 
              senderId: user.id, 
              senderName: user.name, 
              text: input.value, 
              timestamp: serverTimestamp() 
            }); 
            input.value = ''; 
          }} className="flex gap-2">
            <input placeholder="SEND BROADCAST..." className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-4 outline-none text-white text-sm font-medium focus:border-emerald-500 transition-all" />
            <button className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 active:scale-90 transition-transform"><i className="fas fa-paper-plane"></i></button>
          </form>
        </div>
      )}
    </div>
  );
}