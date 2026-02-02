
import React, { useState, useEffect, useRef } from 'react';
import { 
  db, 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  getDoc,
  saveManualConfig,
  clearManualConfig,
  getMissingKeys
} from './services/firebaseService';
import { getCoachResponse, getSidelineFact, getLiveScoreFromSearch, analyzeMomentum } from './services/geminiService';
import { ChatMessage, User } from './types';

const MSG_COLLECTION = 'hub_v5_messages';
const SIDE_MSG_COLLECTION = 'hub_v5_side_messages';
const GAME_STATE_DOC = 'hub_v5_state';
const HYPE_COLLECTION = 'hub_v5_hype';
const PREDICTIONS_COLLECTION = 'hub_v5_predictions';

const PREDICTION_TASKS = [
  { id: 'q1', label: 'COIN TOSS WINNER', options: ['RAMS', 'SEAHAWKS'] },
  { id: 'q2', label: 'FIRST STRIKE (TEAM)', options: ['RAMS', 'SEAHAWKS'] },
  { id: 'q3', label: '1ST HALF PASSING YDS', options: ['UNDER 240.5', 'OVER 240.5'] },
  { id: 'q4', label: 'TURNOVER COUNT', options: ['UNDER 2.5', 'OVER 2.5'] },
  { id: 'q5', label: 'TOTAL TOUCHDOWNS', options: ['UNDER 5.5', 'OVER 5.5'] },
  { id: 'q6', label: '50+ YD FIELD GOAL', options: ['NEGATIVE', 'CONFIRMED'] },
  { id: 'q7', label: 'MVP OPERATIVE', options: ['QB', 'WR', 'RB', 'DEF/SPEC'] },
  { id: 'q8', label: 'MAX DOMINANCE GAP', options: ['UNDER 10.5', 'OVER 10.5'] },
];

const SIDE_TASKS = [
  { id: 's1', label: 'FIRST BEER COMMERCIAL', options: ['BUD LIGHT', 'MICHELOB', 'COORS', 'OTHER'] },
  { id: 's2', label: 'MOVIE TRAILER PRIORITY', options: ['MARVEL', 'DC', 'HORROR', 'OTHER'] },
  { id: 's3', label: 'HALFTIME: FIRST SONG', options: ['UPBEAT/FAST', 'SLOW/BALLAD'] },
  { id: 's4', label: 'HALFTIME GUEST COUNT', options: ['UNDER 1.5', 'OVER 1.5'] },
  { id: 's5', label: 'CELEBRITY CHIPS AD?', options: ['YES', 'NO'] },
  { id: 's6', label: 'TAYLOR SWIFT CAMEO?', options: ['YES', 'NO'] },
  { id: 's7', label: 'GATORADE COLOR', options: ['RED/ORANGE', 'CLEAR/WATER', 'PURPLE/BLUE', 'YELLOW/GREEN'] },
];

// Color mapping for Tailwind JIT/CDN reliability
const themeStyles = {
  blue: {
    main: 'bg-blue-600',
    border: 'border-blue-500',
    text: 'text-blue-400',
    glow: 'shadow-blue-500/20',
    bgLight: 'bg-blue-500/10',
    ring: 'ring-blue-500'
  },
  emerald: {
    main: 'bg-emerald-600',
    border: 'border-emerald-500',
    text: 'text-emerald-400',
    glow: 'shadow-emerald-500/20',
    bgLight: 'bg-emerald-500/10',
    ring: 'ring-emerald-500'
  },
  amber: {
    main: 'bg-amber-600',
    border: 'border-amber-500',
    text: 'text-amber-400',
    glow: 'shadow-amber-500/20',
    bgLight: 'bg-amber-500/10',
    ring: 'ring-amber-500'
  }
};

export default function App() {
  const [user, setUser] = useState<(User & { team: 'T1' | 'T2' }) | null>(() => {
    try {
      const saved = localStorage.getItem('sblix_u5');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'stakes' | 'side' | 'ranks'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sideMessages, setSideMessages] = useState<ChatMessage[]>([]);
  const [gameScore, setGameScore] = useState({ 
    s1: 0, s2: 0, t1: "RAMS", t2: "SEAHAWKS", status: "LIVE", 
    momentum: 50, ticker: "ESTABLISHING SECURE CONNECTION...", 
    bigPlayTrigger: 0, sources: []
  });
  const [flashType, setFlashType] = useState<'blue' | 'emerald' | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [predictions, setPredictions] = useState<Record<string, string>>({});
  const [sidePredictions, setSidePredictions] = useState<Record<string, string>>({});
  const [finalScorePred, setFinalScorePred] = useState({ s1: '', s2: '' });
  const [isSavingStakes, setIsSavingStakes] = useState(false);
  const [hasSavedStakes, setHasSavedStakes] = useState(false);
  const [hasSavedSide, setHasSavedSide] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sideMessagesEndRef = useRef<HTMLDivElement>(null);

  // Background Automation
  useEffect(() => {
    if (!user || !db) return;

    const runAutomation = async () => {
      try {
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
      } catch (err) {
        console.error("Automation error:", err);
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
        setGameScore(prev => ({ ...prev, ...data }));
        if (data.bigPlayTrigger > (gameScore.bigPlayTrigger || 0)) {
           setFlashType(data.s1 > data.s2 ? 'blue' : 'emerald');
           setTimeout(() => setFlashType(null), 1500);
        }
      }
    });

    const qChat = query(collection(db, MSG_COLLECTION), orderBy('timestamp', 'asc'), limit(50));
    const unsubChat = onSnapshot(qChat, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    const qSideChat = query(collection(db, SIDE_MSG_COLLECTION), orderBy('timestamp', 'asc'), limit(50));
    const unsubSideChat = onSnapshot(qSideChat, (snap) => {
      setSideMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any);
      setTimeout(() => sideMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    // Check existing predictions
    const checkPreds = async () => {
      try {
        const predRef = doc(db, PREDICTIONS_COLLECTION, user.id);
        const snap = await getDoc(predRef);
        if (snap.exists()) {
          const data = snap.data();
          setPredictions(data.choices || {});
          setSidePredictions(data.sideChoices || {});
          setFinalScorePred(data.finalScore || { s1: '', s2: '' });
          setHasSavedStakes(!!data.choices);
          setHasSavedSide(!!data.sideChoices);
        }
      } catch (e) { console.warn("Prediction sync error", e); }
    };
    checkPreds();

    return () => { unsubState(); unsubChat(); unsubSideChat(); };
  }, [user]);

  const handleResetSession = () => {
    if (confirm("TERMINATE SESSION? This will reset your callsign and team selection.")) {
      localStorage.removeItem('sblix_u5');
      window.location.reload();
    }
  };

  const handleSaveStakes = async () => {
    if (!db || !user) return;
    setIsSavingStakes(true);
    try {
      await setDoc(doc(db, PREDICTIONS_COLLECTION, user.id), {
        userId: user.id,
        userName: user.name,
        choices: predictions,
        finalScore: finalScorePred,
        timestamp: serverTimestamp()
      }, { merge: true });
      setHasSavedStakes(true);
      await addDoc(collection(db, MSG_COLLECTION), {
        senderId: 'sideline_bot_ai',
        senderName: 'COMBAT CONTROLLER',
        text: `LOGISTICS UPDATE: OPERATIVE ${user.name} HAS SEALED THE MAIN MISSION VAULT.`,
        timestamp: serverTimestamp()
      });
    } catch (e) { console.error(e); }
    setIsSavingStakes(false);
  };

  const handleSaveSide = async () => {
    if (!db || !user) return;
    setIsSavingStakes(true);
    try {
      await setDoc(doc(db, PREDICTIONS_COLLECTION, user.id), {
        userId: user.id,
        userName: user.name,
        sideChoices: sidePredictions,
        timestamp: serverTimestamp()
      }, { merge: true });
      setHasSavedSide(true);
      await addDoc(collection(db, SIDE_MSG_COLLECTION), {
        senderId: 'sideline_bot_ai',
        senderName: 'INTEL OFFICER',
        text: `SIDE OPS UPDATE: OPERATIVE ${user.name} HAS LOCKED IN COMMERCIAL INTELLIGENCE.`,
        timestamp: serverTimestamp()
      });
    } catch (e) { console.error(e); }
    setIsSavingStakes(false);
  };

  const handleJoin = (name: string, team: 'T1' | 'T2') => {
    const newUser = { id: 'u' + Math.random().toString(36).substr(2, 4), name: name.toUpperCase(), team };
    setUser(newUser);
    localStorage.setItem('sblix_u5', JSON.stringify(newUser));
  };

  if (!db) return <ConfigScreen />;
  if (!user) return <JoinScreen onJoin={handleJoin} />;

  const teamColorKey = user.team === 'T1' ? 'blue' : 'emerald';
  const activeColorKey = activeTab === 'side' ? 'amber' : teamColorKey;
  const activeTheme = themeStyles[activeColorKey];
  const teamTheme = themeStyles[teamColorKey];

  return (
    <div className={`flex flex-col h-screen max-w-lg mx-auto bg-slate-950 text-white overflow-hidden relative ${flashType === 'blue' ? 'flash-blue' : flashType === 'emerald' ? 'flash-emerald' : ''}`}>
      {/* JUMBOTRON SCOREBOARD */}
      <header className="p-3 z-50 glass border-b border-white/10 shadow-2xl">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${activeTheme.main} animate-pulse`}></span>
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.3em]">SECURE COMMS ESTABLISHED</span>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 text-[7px] font-black text-slate-500">
                {isSyncing ? <i className="fas fa-satellite fa-spin text-blue-400"></i> : <i className="fas fa-radar text-emerald-500"></i>}
                INTEL_FEED_ACTIVE
             </div>
             <button onClick={handleResetSession} className="w-5 h-5 rounded bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 text-[8px]"><i className="fas fa-power-off"></i></button>
          </div>
        </div>

        <div className="relative group">
          <div className={`absolute -inset-1 bg-gradient-to-r ${user.team === 'T1' ? 'from-blue-600 to-indigo-600' : 'from-emerald-600 to-teal-600'} rounded-[1.5rem] blur opacity-10`}></div>
          <div className="relative flex justify-between items-center px-5 py-3 bg-black/60 rounded-[1.5rem] border border-white/5 backdrop-blur-md">
            <div className="text-center w-16">
              <p className={`text-[8px] font-black uppercase mb-0.5 ${gameScore.s1 >= gameScore.s2 ? 'text-blue-400' : 'text-slate-600'}`}>{gameScore.t1}</p>
              <p className={`text-2xl font-orbitron font-black italic ${gameScore.s1 >= gameScore.s2 ? 'text-white' : 'text-slate-500'}`}>{gameScore.s1}</p>
            </div>
            
            <div className="flex flex-col items-center flex-1 mx-2">
              <div className="px-2 py-0.5 bg-white/5 rounded-full mb-2 border border-white/5">
                <span className="text-[6px] font-black text-emerald-400 uppercase tracking-widest">{gameScore.status}</span>
              </div>
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden flex relative">
                <div style={{ width: `${100 - gameScore.momentum}%` }} className="h-full bg-blue-500 transition-all duration-300"></div>
                <div style={{ width: `${gameScore.momentum}%` }} className="h-full bg-emerald-500 transition-all duration-300"></div>
              </div>
            </div>

            <div className="text-center w-16">
              <p className={`text-[8px] font-black uppercase mb-0.5 ${gameScore.s2 >= gameScore.s1 ? 'text-emerald-400' : 'text-slate-600'}`}>{gameScore.t2}</p>
              <p className={`text-2xl font-orbitron font-black italic ${gameScore.s2 >= gameScore.s1 ? 'text-white' : 'text-slate-500'}`}>{gameScore.s2}</p>
            </div>
          </div>
        </div>

        <nav className="flex gap-1 mt-4">
          {[
            { id: 'chat', label: 'COMBAT' },
            { id: 'stakes', label: 'STAKES' },
            { id: 'side', label: 'SIDE GAME' },
            { id: 'ranks', label: 'RANKS' }
          ].map(tab => {
            const isTabActive = activeTab === tab.id;
            const tabTheme = tab.id === 'side' ? themeStyles.amber : teamTheme;
            return (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex-1 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                  isTabActive 
                    ? `${tabTheme.main} text-white shadow-lg` 
                    : 'bg-white/5 text-slate-500 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* FEED CONTENT */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {activeTab === 'chat' && (
          <div className="space-y-4 pb-32">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'} msg-animate`}>
                <span className={`text-[7px] font-black uppercase mb-0.5 px-2 text-slate-500`}>
                   {msg.senderName} {msg.senderId === 'sideline_bot_ai' && '• TAC_INTEL'}
                </span>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] ${
                  msg.senderId === user.id ? `${teamTheme.main} text-white rounded-tr-none shadow-lg` : 
                  msg.senderId === 'sideline_bot_ai' ? 'bg-slate-900 border-l-2 border-blue-500 text-slate-200 italic rounded-tl-none' :
                  'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'side' && (
          <div className="space-y-6 pb-32">
             <div className={`p-5 glass border rounded-[2rem] space-y-6 relative overflow-hidden ${themeStyles.amber.bgLight} border-amber-500/20`}>
                <div className="text-center">
                   <h2 className="font-orbitron font-black text-lg uppercase italic text-amber-500 mb-1">SIDE MISSION MANIFEST</h2>
                   <p className="text-[7px] font-black text-slate-500 tracking-[0.3em] uppercase">COMMERCIAL_INTEL_V5.0</p>
                </div>

                <div className="space-y-5">
                  {SIDE_TASKS.map((task) => (
                    <div key={task.id} className="space-y-2">
                       <label className="text-[7px] font-black text-amber-500/60 uppercase tracking-widest px-1">{task.label}</label>
                       <div className="grid grid-cols-2 gap-2">
                          {task.options.map((opt) => (
                            <button
                              key={opt}
                              disabled={hasSavedSide}
                              onClick={() => setSidePredictions(prev => ({ ...prev, [task.id]: opt }))}
                              className={`py-2 rounded-lg text-[8px] font-black uppercase transition-all border ${
                                sidePredictions[task.id] === opt 
                                  ? `${themeStyles.amber.main} border-amber-500 text-white shadow-lg` 
                                  : 'bg-black/40 border-white/5 text-slate-500'
                              } ${hasSavedSide && sidePredictions[task.id] !== opt ? 'opacity-30' : ''}`}
                            >
                              {opt}
                            </button>
                          ))}
                       </div>
                    </div>
                  ))}
                </div>

                {!hasSavedSide ? (
                  <button onClick={handleSaveSide} className="w-full py-4 rounded-xl bg-amber-600 font-black uppercase tracking-[0.2em] mt-4 hover:bg-amber-500 shadow-xl shadow-amber-500/20">SEAL SIDE OPS</button>
                ) : (
                  <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                    <i className="fas fa-lock text-amber-500 mb-2"></i>
                    <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest">SIDE MISSION SEALED</p>
                  </div>
                )}
             </div>

             <div className="space-y-4 pt-6">
                <div className="flex items-center gap-2 mb-2 px-2">
                   <div className="h-px flex-1 bg-amber-500/20"></div>
                   <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">SIDE COMMS</span>
                   <div className="h-px flex-1 bg-amber-500/20"></div>
                </div>
                {sideMessages.map((msg, i) => (
                  <div key={msg.id || i} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'}`}>
                    <span className="text-[7px] font-black uppercase text-amber-500/40 mb-0.5 px-2">{msg.senderName}</span>
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] ${
                      msg.senderId === user.id ? `bg-amber-600 text-white rounded-tr-none` : `bg-slate-900 border border-amber-500/20 text-slate-200 rounded-tl-none`
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={sideMessagesEndRef} />
             </div>
          </div>
        )}

        {activeTab === 'stakes' && (
          <div className="space-y-6 py-4 pb-20">
             <div className="p-5 glass border border-white/10 rounded-[2rem] space-y-6">
                <div className="text-center">
                   <h2 className="font-orbitron font-black text-lg uppercase italic mb-1">COMMAND MISSION</h2>
                   <p className="text-[7px] font-black text-slate-500 tracking-[0.3em] uppercase">SBLIX_GRIDIRON_FORECAST</p>
                </div>
                <div className="space-y-5">
                  {PREDICTION_TASKS.map((task) => (
                    <div key={task.id} className="space-y-2">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest px-1">{task.label}</label>
                       <div className="grid grid-cols-2 gap-2">
                          {task.options.map((opt) => (
                            <button
                              key={opt}
                              disabled={hasSavedStakes}
                              onClick={() => setPredictions(prev => ({ ...prev, [task.id]: opt }))}
                              className={`py-2 rounded-lg text-[8px] font-black uppercase transition-all border ${
                                predictions[task.id] === opt 
                                  ? `${teamTheme.main} border-${teamColorKey}-500 text-white shadow-lg` 
                                  : 'bg-black/40 border-white/5 text-slate-500'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                       </div>
                    </div>
                  ))}
                </div>
                {!hasSavedStakes ? (
                  <button onClick={handleSaveStakes} className={`w-full py-4 rounded-xl ${teamTheme.main} font-black uppercase tracking-[0.2em] mt-4 shadow-lg`}>SEAL COMMAND VAULT</button>
                ) : (
                  <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center"><p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">COMMAND SEALED</p></div>
                )}
             </div>
          </div>
        )}

        {activeTab === 'ranks' && (
          <div className="space-y-3 pb-20">
            {[{n: 'COLONEL_FOOTBALL', p: 4500, t: 'T1'}, {n: 'STADIUM_SNIPER', p: 3100, t: 'T2'}, {n: user.name, p: 1200, t: user.team}].map((r, i) => (
              <div key={i} className={`flex items-center gap-4 p-4 glass rounded-3xl border border-white/5`}>
                 <div className="w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center font-black text-emerald-500 text-xs">{i+1}</div>
                 <div className="flex-1 font-black text-[12px] uppercase">{r.n}</div>
                 <div className="font-orbitron font-black text-emerald-400 text-sm">{r.p}</div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* TACTICAL INPUT */}
      {(activeTab === 'chat' || activeTab === 'side') && (
        <div className="absolute bottom-6 inset-x-4 p-4 glass rounded-[2.5rem] border border-white/10 shadow-2xl z-[60]">
           <div className="flex gap-2 mb-3">
              <button onClick={() => { if(db) addDoc(collection(db, HYPE_COLLECTION), { team: user.team, userId: user.id, timestamp: serverTimestamp() }); }} className={`flex-1 py-3 ${activeTheme.bgLight} border ${activeTheme.border}/40 rounded-xl text-[9px] font-black uppercase hover:${activeTheme.main}/40 active:scale-95 transition-all flex items-center justify-center gap-2`}>
                <i className="fas fa-fire-alt"></i>
                HYPE {user.team === 'T1' ? 'RAMS' : 'SEAHAWKS'}
              </button>
              <button className="px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase active:scale-95 transition-all">
                <i className="fas fa-volume-up"></i>
              </button>
           </div>
           <form onSubmit={(e) => {
             e.preventDefault();
             const input = e.currentTarget.elements[0] as HTMLInputElement;
             if (!input.value.trim() || !db) return;
             const collectionName = activeTab === 'side' ? SIDE_MSG_COLLECTION : MSG_COLLECTION;
             addDoc(collection(db, collectionName), {
               senderId: user.id,
               senderName: user.name,
               text: input.value,
               timestamp: serverTimestamp()
             });
             input.value = '';
           }} className="flex gap-2">
             <input placeholder={`ENTER ${activeTab === 'side' ? 'SIDE OPS' : 'COMMAND'} INTEL...`} className="flex-1 bg-black/40 border border-white/5 rounded-2xl px-5 outline-none text-white text-[11px] font-medium focus:border-emerald-500" />
             <button type="submit" className={`w-12 h-12 ${activeTheme.main} rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all`}><i className="fas fa-paper-plane"></i></button>
           </form>
        </div>
      )}

      {/* BROADCAST TICKER */}
      <div className="h-6 bg-black border-t border-white/10 flex items-center overflow-hidden z-[100]">
         <div className="ticker-wrap w-full">
            <div className="ticker font-orbitron font-black text-[8px] text-emerald-500 uppercase tracking-widest space-x-20">
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

  return (
    <div className={`flex items-center justify-center min-h-screen p-6 transition-colors duration-1000 ${team === 'T1' ? 'bg-blue-950' : 'bg-emerald-950'} relative overflow-hidden`}>
      <div className="w-full max-w-md p-10 glass rounded-[3rem] text-center border-white/10 shadow-2xl relative z-10 space-y-10">
        <div>
          <h1 className="font-orbitron text-4xl font-black italic text-white mb-2 tracking-tighter">SBLIX LIX</h1>
          <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.5em] animate-pulse">COMMAND FEED V5.0</p>
        </div>
        <div className="space-y-6">
          <div className="space-y-2 text-left">
            <label className="text-[8px] font-black text-slate-500 uppercase px-2">Operator Handle</label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value.toUpperCase())}
              placeholder="CALLSIGN" 
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-center uppercase outline-none focus:border-emerald-500 text-xl" 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <button onClick={() => setTeam('T1')} className={`py-4 rounded-xl border-2 transition-all ${team === 'T1' ? 'border-blue-500 bg-blue-500/20' : 'border-white/5 opacity-40'}`}>
                <p className="text-[8px] font-black text-blue-400 mb-1">FORCE A</p>
                <p className="font-orbitron font-black text-white italic">RAMS</p>
             </button>
             <button onClick={() => setTeam('T2')} className={`py-4 rounded-xl border-2 transition-all ${team === 'T2' ? 'border-emerald-500 bg-emerald-500/20' : 'border-white/5 opacity-40'}`}>
                <p className="text-[8px] font-black text-emerald-400 mb-1">FORCE B</p>
                <p className="font-orbitron font-black text-white italic">SEAHAWKS</p>
             </button>
          </div>
        </div>
        <button onClick={() => name && onJoin(name, team)} className={`w-full ${team === 'T1' ? 'bg-blue-600' : 'bg-emerald-600'} text-white font-black py-5 rounded-2xl shadow-2xl uppercase tracking-[0.2em]`}>CONNECT TO FEED</button>
      </div>
    </div>
  );
}

function ConfigScreen() {
  const [config, setConfig] = useState('');
  const missing = getMissingKeys();
  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 text-white">
      <div className="max-w-md w-full glass p-8 rounded-[2rem] space-y-6">
        <div className="text-center">
          <i className="fas fa-exclamation-triangle text-3xl text-yellow-500 mb-4 animate-bounce"></i>
          <h2 className="text-xl font-orbitron font-black italic uppercase">Config Required</h2>
          <p className="text-[10px] text-slate-400 mt-2">Provide Firebase JSON configuration.</p>
        </div>
        <div className="space-y-4">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
             <ul className="text-[8px] space-y-1 text-slate-300">
              {missing.map(k => <li key={k}>• {k}</li>)}
            </ul>
          </div>
          <textarea rows={4} value={config} onChange={e => setConfig(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-xl p-3 text-[9px] font-mono outline-none" placeholder='{ "apiKey": "...", ... }'/>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => saveManualConfig(config)} className="w-full bg-blue-600 py-3 rounded-xl font-black text-[10px] uppercase">INITIALIZE</button>
          <button onClick={clearManualConfig} className="w-full bg-slate-800 py-2 rounded-xl font-black text-[8px] text-slate-400 uppercase">CLEAR CONFIG</button>
        </div>
      </div>
    </div>
  );
}
