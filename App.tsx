
import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, setDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, getDoc } from './services/firebaseService';
import { getCoachResponse, getSidelineFact, getLiveScoreFromSearch, analyzeMomentum } from './services/geminiService';
import { ChatMessage, User, TriviaQuestion, ScoreEntry } from './types';

const MSG_COLLECTION = 'hub_v5_messages';
const GAME_STATE_DOC = 'hub_v5_state';
const HYPE_COLLECTION = 'hub_v5_hype';

export default function App() {
  const [user, setUser] = useState<(User & { team: 'T1' | 'T2' }) | null>(() => {
    const saved = localStorage.getItem('sblix_u5');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'stakes' | 'ranks'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameScore, setGameScore] = useState<{
    s1: number;
    s2: number;
    t1: string;
    t2: string;
    status: string;
    momentum: number;
    ticker: string;
    bigPlayTrigger: number;
    sources?: any[];
  }>({ 
    s1: 0, s2: 0, t1: "RAMS", t2: "SEAHAWKS", status: "LIVE", 
    momentum: 50, ticker: "ESTABLISHING SECURE CONNECTION...", 
    bigPlayTrigger: 0,
    sources: []
  });
  const [intensity, setIntensity] = useState(0);
  const [flashType, setFlashType] = useState<'blue' | 'emerald' | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Background Automation
  useEffect(() => {
    if (!user || !db) return;

    const runAutomation = async () => {
      const stateRef = doc(db, GAME_STATE_DOC, 'global');
      const stateSnap = await getDoc(stateRef);
      const data = stateSnap.exists() ? stateSnap.data() : {};
      const now = Date.now();

      if (now - (data.lastUpdate || 0) > 45000) {
        setIsSyncing(true);
        const score = await getLiveScoreFromSearch();
        if (score) {
          const intel = await analyzeMomentum({ rams: score.score1, seahawks: score.score2 });
          const tickerFact = await getSidelineFact();
          
          await setDoc(stateRef, {
            s1: score.score1, s2: score.score2,
            t1: score.team1, t2: score.team2,
            status: score.status,
            momentum: intel.momentum,
            ticker: `${intel.intel.toUpperCase()} | ${tickerFact.toUpperCase()}`,
            bigPlayTrigger: intel.isBigPlay ? now : (data.bigPlayTrigger || 0),
            lastUpdate: now,
            sources: [...(score.sources || []), ...(intel.sources || [])]
          }, { merge: true });

          if (intel.isBigPlay) {
            await addDoc(collection(db, MSG_COLLECTION), {
              senderId: 'sideline_bot_ai',
              senderName: 'COMBAT CONTROLLER',
              text: `URGENT: ${intel.intel}`,
              timestamp: serverTimestamp()
            });
          }
        }
        setIsSyncing(false);
      }
    };

    runAutomation();
    const interval = setInterval(runAutomation, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Sync state and listeners
  useEffect(() => {
    if (!user || !db) return;

    const unsubState = onSnapshot(doc(db, GAME_STATE_DOC, 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGameScore(data as any);
        // Detect "Big Play" flash from other clients
        if (data.bigPlayTrigger > (gameScore.bigPlayTrigger || 0)) {
           setFlashType(data.s1 > data.s2 ? 'blue' : 'emerald');
           setTimeout(() => setFlashType(null), 1500);
        }
      }
    });

    const qChat = query(collection(db, MSG_COLLECTION), orderBy('timestamp', 'asc'), limit(50));
    const unsubChat = onSnapshot(qChat, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    // Real-time Momentum Tug-of-War (Reactive Hype)
    const qHype = query(collection(db, HYPE_COLLECTION), orderBy('timestamp', 'desc'), limit(10));
    const unsubHype = onSnapshot(qHype, async (snap) => {
      if (!snap.empty) {
        const hypes = snap.docs.map(d => d.data());
        const t1Hype = hypes.filter(h => h.team === 'T1').length;
        const t2Hype = hypes.filter(h => h.team === 'T2').length;
        setIntensity(t1Hype + t2Hype);
        
        // Push local hype shift to momentum bar (Visual Only for local speed)
        const shift = (t2Hype - t1Hype) * 2;
        setGameScore(prev => ({...prev, momentum: Math.max(0, Math.min(100, prev.momentum + shift))}));
      }
    });

    return () => { unsubState(); unsubChat(); unsubHype(); };
  }, [user]);

  const sendHype = async () => {
    if (!db || !user) return;
    await addDoc(collection(db, HYPE_COLLECTION), {
      team: user.team,
      userId: user.id,
      timestamp: serverTimestamp()
    });
  };

  const handleJoin = (name: string, team: 'T1' | 'T2') => {
    const newUser = { id: 'u' + Math.random().toString(36).substr(2, 4), name: name.toUpperCase(), team };
    setUser(newUser);
    localStorage.setItem('sblix_u5', JSON.stringify(newUser));
  };

  const teamColor = user?.team === 'T1' ? 'blue' : 'emerald';

  if (!user) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <div className={`flex flex-col h-screen max-w-lg mx-auto bg-slate-950 text-white overflow-hidden relative ${flashType === 'blue' ? 'flash-blue' : flashType === 'emerald' ? 'flash-emerald' : ''}`}>
      {/* JUMBOTRON SCOREBOARD */}
      <header className="p-4 z-50 glass border-b border-white/10 shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full bg-${teamColor}-500 animate-pulse`}></span>
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">SECURE COMMS ESTABLISHED</span>
          </div>
          <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-500">
             {isSyncing ? <i className="fas fa-satellite fa-spin text-blue-400"></i> : <i className="fas fa-radar text-emerald-500"></i>}
             SBLIX_INTEL_ACTIVE
          </div>
        </div>

        <div className="relative group">
          <div className={`absolute -inset-1 bg-gradient-to-r ${user.team === 'T1' ? 'from-blue-600 to-indigo-600' : 'from-emerald-600 to-teal-600'} rounded-[2rem] blur opacity-10 group-hover:opacity-25 transition duration-1000`}></div>
          <div className="relative flex justify-between items-center px-6 py-5 bg-black/60 rounded-[2rem] border border-white/5 backdrop-blur-md">
            <div className="text-center w-20">
              <p className={`text-[9px] font-black uppercase mb-1 ${gameScore.s1 >= gameScore.s2 ? 'text-blue-400' : 'text-slate-600'}`}>{gameScore.t1}</p>
              <p className={`text-4xl font-orbitron font-black italic drop-shadow-[0_0_15px_rgba(59,130,246,0.3)] ${gameScore.s1 >= gameScore.s2 ? 'text-white' : 'text-slate-500'}`}>{gameScore.s1}</p>
            </div>
            
            <div className="flex flex-col items-center flex-1 mx-2">
              <div className="px-3 py-1 bg-white/5 rounded-full mb-3 border border-white/5">
                <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">{gameScore.status}</span>
              </div>
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden flex relative">
                <div style={{ width: `${100 - gameScore.momentum}%` }} className="h-full bg-blue-500 transition-all duration-300"></div>
                <div style={{ width: `${gameScore.momentum}%` }} className="h-full bg-emerald-500 transition-all duration-300"></div>
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/20 -ml-0.25"></div>
              </div>
              <p className="text-[6px] font-black text-slate-600 uppercase mt-1.5 tracking-tighter">MOMENTUM QUOTIENT</p>
            </div>

            <div className="text-center w-20">
              <p className={`text-[9px] font-black uppercase mb-1 ${gameScore.s2 >= gameScore.s1 ? 'text-emerald-400' : 'text-slate-600'}`}>{gameScore.t2}</p>
              <p className={`text-4xl font-orbitron font-black italic drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] ${gameScore.s2 >= gameScore.s1 ? 'text-white' : 'text-slate-500'}`}>{gameScore.s2}</p>
            </div>
          </div>
        </div>

        <nav className="flex gap-1 mt-6">
          {['chat', 'stakes', 'ranks'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab as any)} 
              className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? `bg-${teamColor}-600 text-white shadow-xl shadow-${teamColor}-500/20` : 'bg-white/5 text-slate-500 hover:text-white'}`}
            >
              {tab === 'stakes' ? 'COMMAND STAKES' : tab}
            </button>
          ))}
        </nav>
      </header>

      {/* FEED CONTENT */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {activeTab === 'chat' && (
          <div className="space-y-4 pb-32">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'} msg-animate`}>
                <span className={`text-[8px] font-black uppercase mb-1 px-2 ${msg.senderId === 'sideline_bot_ai' ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`}>
                   {msg.senderName} {msg.senderId === 'sideline_bot_ai' && '• TAC_INTEL'}
                </span>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                  msg.senderId === user.id ? `bg-${teamColor}-600 text-white rounded-tr-none shadow-lg shadow-${teamColor}-500/10` : 
                  msg.senderId === 'sideline_bot_ai' ? 'bg-slate-900 border-l-2 border-blue-500 text-slate-200 italic rounded-tl-none font-medium' :
                  'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'stakes' && (
          <div className="space-y-6 py-4">
             <div className="p-8 text-center glass border border-white/10 rounded-[2.5rem] space-y-4">
                <i className={`fas fa-lock text-4xl text-${teamColor}-500 mb-2`}></i>
                <h2 className="font-orbitron font-black text-xl uppercase italic">The Prediction Vault</h2>
                <p className="text-xs text-slate-400">Locking in your predictions. The Intel Officer will grade your tactical accuracy after the final whistle.</p>
                <div className="grid grid-cols-2 gap-4 mt-8">
                   <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black text-slate-500 mb-2">RAMS SCORE</p>
                      <input type="number" className="w-full bg-transparent text-center font-orbitron font-black text-2xl outline-none" placeholder="00" />
                   </div>
                   <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black text-slate-500 mb-2">SEA SCORE</p>
                      <input type="number" className="w-full bg-transparent text-center font-orbitron font-black text-2xl outline-none" placeholder="00" />
                   </div>
                </div>
                <button className={`w-full py-5 rounded-2xl bg-${teamColor}-600 font-black uppercase tracking-widest mt-6 hover:bg-${teamColor}-500 transition-all`}>SEAL PREDICTION</button>
             </div>
          </div>
        )}

        {activeTab === 'ranks' && (
          <div className="space-y-3 pb-20">
            {/* Fixed: Removed stray 'r' undefined variable reference from line 234 */}
            {[{n: 'COLONEL_FOOTBALL', p: 4500, t: 'T1'}, {n: 'STADIUM_SNIPER', p: 3100, t: 'T2'}, {n: user.name, p: 1200, t: user.team}].map((r, i) => (
              <div key={i} className={`flex items-center gap-4 p-5 glass rounded-3xl border ${r.n === user.name ? `border-${teamColor}-500` : 'border-white/5'}`}>
                 <div className="w-10 h-10 rounded-xl bg-black/60 flex items-center justify-center font-black text-emerald-500">{i+1}</div>
                 <div className="flex-1 font-black text-sm uppercase">{r.n} <span className={`text-[8px] text-${r.t === 'T1' ? 'blue' : 'emerald'}-400 ml-1`}>• {r.t === 'T1' ? 'RAMS' : 'SEA'}</span></div>
                 <div className="font-orbitron font-black text-emerald-400">{r.p}</div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* TACTICAL INPUT */}
      {activeTab === 'chat' && (
        <div className="absolute bottom-6 inset-x-4 p-4 glass rounded-[2.5rem] border border-white/10 shadow-2xl z-[60]">
           <div className="flex gap-2 mb-3">
              <button onClick={sendHype} className={`flex-1 py-3 bg-${teamColor}-600/20 border border-${teamColor}-500/40 rounded-xl text-[9px] font-black uppercase hover:bg-${teamColor}-600/40 active:scale-95 transition-all flex items-center justify-center gap-2`}>
                <i className="fas fa-fire-alt animate-bounce"></i>
                {user.team === 'T1' ? 'HYPE RAMS' : 'HYPE SEAHAWKS'}
              </button>
              <button className="px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase hover:bg-white/10 active:scale-95 transition-all">
                <i className="fas fa-volume-up"></i>
              </button>
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
             <input placeholder="ENTER INTEL..." className="flex-1 bg-black/40 border border-white/5 rounded-2xl px-5 outline-none text-white text-xs font-medium focus:border-emerald-500" />
             <button className={`w-12 h-12 bg-${teamColor}-600 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all`}><i className="fas fa-paper-plane"></i></button>
           </form>
        </div>
      )}

      {/* BROADCAST TICKER - Lists Search Grounding URLs as per MUST requirements */}
      <div className="h-7 bg-black border-t border-white/10 flex items-center overflow-hidden z-[100]">
         <div className="ticker-wrap w-full">
            <div className="ticker font-orbitron font-black text-[9px] text-emerald-500 uppercase tracking-widest space-x-20">
               <span>{gameScore.ticker} {gameScore.sources?.map((s: any) => s.web?.uri || s.web?.title).filter(Boolean).join(' | ')}</span>
               <span>{gameScore.ticker} {gameScore.sources?.map((s: any) => s.web?.uri || s.web?.title).filter(Boolean).join(' | ')}</span>
               <span>{gameScore.ticker} {gameScore.sources?.map((s: any) => s.web?.uri || s.web?.title).filter(Boolean).join(' | ')}</span>
            </div>
         </div>
      </div>
    </div>
  );
}

function JoinScreen({ onJoin }: { onJoin: (n: string, t: 'T1' | 'T2') => void }) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState<'T1' | 'T2'>('T1');
  const [isFlickering, setIsFlickering] = useState(false);

  return (
    <div className={`flex items-center justify-center min-h-screen p-6 transition-colors duration-1000 ${team === 'T1' ? 'bg-blue-950' : 'bg-emerald-950'} relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
      
      <div className="w-full max-w-md p-10 glass rounded-[3rem] text-center border-white/10 shadow-2xl relative z-10 space-y-10">
        <div>
          <h1 className="font-orbitron text-5xl font-black italic text-white mb-2 tracking-tighter">SBLIX LIX</h1>
          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.5em] animate-pulse">COMMAND FEED V5.0</p>
        </div>
        
        <div className="space-y-6">
          <div className="space-y-2 text-left">
            <label className="text-[8px] font-black text-slate-500 uppercase px-2">Operator Handle</label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value.toUpperCase())}
              placeholder="CALLSIGN" 
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-white font-black text-center uppercase outline-none focus:border-emerald-500 transition-all text-2xl" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <button onClick={() => setTeam('T1')} className={`py-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center ${team === 'T1' ? 'border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/20 scale-105' : 'border-white/5 bg-white/5 opacity-40'}`}>
                <p className="text-[10px] font-black text-blue-400 uppercase mb-1">FORCE A</p>
                <p className="text-xl font-orbitron font-black text-white italic">RAMS</p>
             </button>
             <button onClick={() => setTeam('T2')} className={`py-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center ${team === 'T2' ? 'border-emerald-500 bg-emerald-500/20 shadow-lg shadow-emerald-500/20 scale-105' : 'border-white/5 bg-white/5 opacity-40'}`}>
                <p className="text-[10px] font-black text-emerald-400 uppercase mb-1">FORCE B</p>
                <p className="text-xl font-orbitron font-black text-white italic">SEAHAWKS</p>
             </button>
          </div>
        </div>

        <button 
          onMouseEnter={() => setIsFlickering(true)}
          onMouseLeave={() => setIsFlickering(false)}
          onClick={() => name && onJoin(name, team)}
          className={`w-full bg-${team === 'T1' ? 'blue' : 'emerald'}-600 text-white font-black py-6 rounded-3xl transition-all shadow-2xl uppercase tracking-[0.2em] text-xl btn-flicker active:scale-95 ${isFlickering ? 'animate-pulse' : ''}`}
        >
          CONNECT TO FEED
        </button>
      </div>
    </div>
  );
}
