
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
  saveManualConfig
} from './services/firebaseService';
import { getCoachResponse, getSidelineFact, getLiveScoreFromSearch, analyzeMomentum, getDetailedStats } from './services/geminiService';
import { ChatMessage, User } from './types';

const MSG_COLLECTION = 'hub_lx_messages';
const SIDE_MSG_COLLECTION = 'hub_lx_side_messages';
const GAME_STATE_DOC = 'hub_lx_state';
const HYPE_COLLECTION = 'hub_lx_hype';
const REDZONE_PICKS_COLLECTION = 'hub_lx_redzone_picks';

const PREDICTION_TASKS = [
  { id: 'q1', label: 'COIN TOSS RESULT', options: ['HEADS', 'TAILS'], points: 100 },
  { id: 'q2', label: 'ANTHEM LENGTH', options: ['UNDER 1:58', 'OVER 1:58'], points: 150 },
  { id: 'q3', label: 'FIRST TOUCHDOWN', options: ['PATRIOTS', 'SEAHAWKS', 'OTHER'], points: 250 },
  { id: 'q4', label: 'QB RUSHING YDS', options: ['UNDER 28.5', 'OVER 28.5'], points: 200 },
  { id: 'q5', label: 'TOTAL SACKS', options: ['UNDER 3.5', 'OVER 3.5'], points: 300 },
  { id: 'q6', label: 'LONGEST RECEPTION', options: ['UNDER 38.5', 'OVER 38.5'], points: 200 },
  { id: 'q7', label: 'SB LX MVP', options: ['QB', 'WR', 'DEF', 'SPECIAL'], points: 750 },
  { id: 'q8', label: 'FINAL SCORE GAP', options: ['UNDER 4.5', 'OVER 4.5'], points: 300 },
];

const SIDE_TASKS = [
  { id: 's1', label: 'BEER AD COUNT', options: ['1-4', '5-8', '9+'], points: 100 },
  { id: 's2', label: 'CELEBRITY CAMEO', options: ['UNDER 5.5', 'OVER 5.5'], points: 150 },
  { id: 's3', label: 'HALFTIME: FIRST SONG', options: ['POP/HIT', 'ROCK/CLASSIC'], points: 200 },
  { id: 's4', label: 'GATORADE COLOR', options: ['ORANGE/RED', 'BLUE/PURPLE', 'CLEAR', 'ACTION GREEN'], points: 400 },
  { id: 's5', label: 'BEST MOVIE TRAILER', options: ['ACTION', 'SCIFI', 'HORROR', 'OTHER'], points: 100 },
  { id: 's6', label: 'AI AD DETECTED?', options: ['YES', 'NO'], points: 50 },
];

const themeStyles = {
  patriots: { 
    main: 'bg-[#C60C30]', // Patriots Red
    border: 'border-[#002244]', // Patriots Navy
    text: 'text-[#C60C30]', 
    glow: 'shadow-red-500/30', 
    bgLight: 'bg-[#C60C30]/10',
    accent: 'text-[#B0B7BC]' // Silver
  },
  seahawks: { 
    main: 'bg-[#69BE28]', // Action Green
    border: 'border-[#002244]', // College Navy
    text: 'text-[#69BE28]', 
    glow: 'shadow-emerald-500/30', 
    bgLight: 'bg-[#69BE28]/10',
    accent: 'text-[#A5ACAF]' // Wolf Gray
  },
  amber: { 
    main: 'bg-amber-600', 
    border: 'border-amber-500', 
    text: 'text-amber-400', 
    glow: 'shadow-amber-500/20', 
    bgLight: 'bg-amber-500/10' 
  },
  red: { 
    main: 'bg-red-600', 
    border: 'border-red-500', 
    text: 'text-red-400', 
    glow: 'shadow-red-500/20', 
    bgLight: 'bg-red-500/20' 
  }
};

export default function App() {
  const [user, setUser] = useState<(User & { team: 'T1' | 'T2' }) | null>(() => {
    try {
      const saved = localStorage.getItem('sblix_lx_v1');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'stats' | 'stakes' | 'side' | 'ranks'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sideMessages, setSideMessages] = useState<ChatMessage[]>([]);
  const [gameScore, setGameScore] = useState({ 
    s1: 0, s2: 0, t1: "NEW ENGLAND", t2: "SEATTLE", status: "PRE-GAME", 
    momentum: 50, ticker: "PREPARING FOR SUPER BOWL LX KICKOFF...", 
    bigPlayTrigger: 0, sources: [], redzoneTeam: null, redzoneId: null,
    detailedStats: null as any
  });
  const [flashType, setFlashType] = useState<'red' | 'patriots' | 'seahawks' | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [predictions, setPredictions] = useState<Record<string, string>>({});
  const [sidePredictions, setSidePredictions] = useState<Record<string, string>>({});
  const [hasSavedStakes, setHasSavedStakes] = useState(false);
  const [hasSavedSide, setHasSavedSide] = useState(false);
  const [hasVotedRedzone, setHasVotedRedzone] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sideMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !db) return;

    const runAutomation = async () => {
      try {
        const stateRef = doc(db, GAME_STATE_DOC, 'global');
        const stateSnap = await getDoc(stateRef);
        const data = stateSnap.exists() ? stateSnap.data() : {};
        const now = Date.now();

        if (now - (data.lastUpdate || 0) > 40000) {
          setIsSyncing(true);
          const score = await getLiveScoreFromSearch();
          const stats = await getDetailedStats();
          if (score) {
            const intel = await analyzeMomentum({ t1: score.score1, t2: score.score2 });
            const tickerFact = await getSidelineFact();
            const newRedzoneId = intel.redzoneTeam ? `rz_${score.score1}_${score.score2}_${now}` : null;

            await setDoc(stateRef, {
              s1: score.score1, s2: score.score2,
              t1: score.team1, t2: score.team2,
              status: score.status,
              momentum: intel.momentum,
              ticker: `${intel.intel.toUpperCase()} | ${tickerFact.toUpperCase()}`,
              bigPlayTrigger: intel.isBigPlay ? now : (data.bigPlayTrigger || 0),
              lastUpdate: now,
              sources: [...(score.sources || []), ...(intel.sources || [])],
              redzoneTeam: intel.redzoneTeam || null,
              redzoneId: newRedzoneId || (intel.redzoneTeam ? data.redzoneId : null),
              detailedStats: stats || data.detailedStats || null
            }, { merge: true });

            if (intel.isBigPlay || (stats && stats.turnovers !== data.detailedStats?.turnovers)) {
              await addDoc(collection(db, MSG_COLLECTION), {
                senderId: 'controller_ai',
                senderName: 'COMMAND CONTROLLER',
                text: intel.isBigPlay ? `CRITICAL PLAY: ${intel.intel}` : `STAT ALERT: TURNOVER DETECTED! NEW COUNT: ${stats?.turnovers}`,
                timestamp: serverTimestamp()
              });
            }
          }
          setIsSyncing(false);
        }
      } catch (err) {
        setIsSyncing(false);
      }
    };

    runAutomation();
    const interval = setInterval(runAutomation, 35000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;

    const unsubState = onSnapshot(doc(db, GAME_STATE_DOC, 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGameScore(prev => {
          if (data.redzoneId && data.redzoneId !== prev.redzoneId) {
             setFlashType('red');
             setHasVotedRedzone(false);
             setTimeout(() => setFlashType(null), 1200);
          }
          return { ...prev, ...data };
        });
        if (data.bigPlayTrigger > (gameScore.bigPlayTrigger || 0)) {
           setFlashType(data.s1 > data.s2 ? 'patriots' : 'seahawks');
           setTimeout(() => setFlashType(null), 2000);
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

    return () => { unsubState(); unsubChat(); unsubSideChat(); };
  }, [user]);

  const handleShare = async () => {
    const shareData = {
      title: 'SUPER BOWL LX COMMAND CENTER',
      text: 'JOIN THE COMMAND FEED. SUPER BOWL LX IS LIVE.',
      url: window.location.href
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      }
    } catch (err) {}
  };

  const handleRedzoneVote = async (choice: string) => {
    if (!db || !user || !gameScore.redzoneId) return;
    setHasVotedRedzone(true);
    try {
      await addDoc(collection(db, REDZONE_PICKS_COLLECTION), {
        userId: user.id, userName: user.name, redzoneId: gameScore.redzoneId, choice, timestamp: serverTimestamp()
      });
      await addDoc(collection(db, MSG_COLLECTION), {
        senderId: 'controller_ai', senderName: 'COMMAND CONTROLLER',
        text: `TACTICAL BONUS: OPERATIVE ${user.name} DEPLOYED '${choice}' PREDICTION. [+750 XP PENDING]`,
        timestamp: serverTimestamp()
      });
    } catch (e) {}
  };

  const handleResetSession = () => {
    if (confirm("ABORT MISSION? This will reset your operative status.")) {
      localStorage.removeItem('sblix_lx_v1');
      window.location.reload();
    }
  };

  const handleJoin = (name: string, team: 'T1' | 'T2') => {
    const newUser = { id: 'op_' + Math.random().toString(36).substr(2, 4), name: name.toUpperCase(), team };
    setUser(newUser);
    localStorage.setItem('sblix_lx_v1', JSON.stringify(newUser));
  };

  if (!db) return <ConfigScreen />;
  if (!user) return <JoinScreen onJoin={handleJoin} onInvite={handleShare} />;

  const teamColorKey = user.team === 'T1' ? 'patriots' : 'seahawks';
  const activeColorKey = activeTab === 'side' ? 'amber' : teamColorKey;
  const activeTheme = themeStyles[activeColorKey];
  const teamTheme = themeStyles[teamColorKey];

  return (
    <div className={`flex flex-col h-screen max-w-lg mx-auto bg-[#001122] text-white overflow-hidden relative transition-colors duration-500 ${flashType === 'patriots' ? 'bg-[#440615]' : flashType === 'seahawks' ? 'bg-[#153408]' : flashType === 'red' ? 'bg-[#330000]' : ''}`}>
      
      {/* SHARE NOTIFICATION */}
      {shareToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[2000] px-8 py-3 bg-[#69BE28] text-white font-black text-[10px] uppercase rounded-full shadow-2xl animate-bounce border-2 border-white/20">
          MISSION LINK BROADCASTED
        </div>
      )}

      {/* NUCLEAR REDZONE ALERT */}
      {gameScore.redzoneTeam && !hasVotedRedzone && (
        <div className="absolute inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-red-600/10 animate-pulse pointer-events-none"></div>
           <div className="text-center space-y-4 mb-12 relative">
              <div className="w-24 h-24 rounded-full border-4 border-red-600 flex items-center justify-center mx-auto mb-6 animate-pulse">
                <i className="fas fa-radiation text-5xl text-red-600"></i>
              </div>
              <h1 className="font-orbitron text-5xl font-black italic tracking-tighter text-white">REDZONE OVERRIDE</h1>
              <p className="text-red-500 font-black text-sm uppercase tracking-[0.4em]">{gameScore.redzoneTeam} IN STRIKING RANGE</p>
           </div>
           
           <div className="w-full space-y-4 relative z-10">
              <p className="text-center text-[11px] font-black text-slate-400 uppercase mb-4 tracking-[0.3em]">CHOOSE OUTCOME [+750 XP]</p>
              {['TOUCHDOWN', 'FIELD GOAL', 'REJECTED'].map(choice => (
                <button 
                  key={choice}
                  onClick={() => handleRedzoneVote(choice)}
                  className="w-full py-6 rounded-[2rem] bg-red-700 hover:bg-red-600 text-white font-black uppercase tracking-widest text-xl border-b-4 border-red-900 active:translate-y-1 active:border-b-0 transition-all"
                >
                  {choice}
                </button>
              ))}
           </div>
           <p className="mt-12 text-[9px] font-black text-red-800 uppercase tracking-[0.5em] animate-pulse">LOCK IN BEFORE THE SNAP</p>
        </div>
      )}

      {/* CHAMPIONSHIP JUMBOTRON */}
      <header className="p-4 z-50 glass border-b border-white/10 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${activeTheme.main} animate-ping`}></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">LX COMMAND ACTIVE</span>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={handleShare} className="h-8 px-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[9px] font-black uppercase tracking-widest gap-2">
                <i className="fas fa-satellite"></i> INVITE SQUAD
             </button>
             <button onClick={handleResetSession} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 text-[12px]"><i className="fas fa-power-off"></i></button>
          </div>
        </div>

        <div className="relative">
          <div className={`absolute -inset-1 bg-gradient-to-r ${user.team === 'T1' ? 'from-[#C60C30] to-[#002244]' : 'from-[#69BE28] to-[#002244]'} rounded-[2rem] blur opacity-20`}></div>
          <div className="relative flex justify-between items-center px-6 py-5 bg-black/80 rounded-[2rem] border border-white/10 backdrop-blur-xl">
            <div className="text-center w-24">
              <p className={`text-[10px] font-black uppercase mb-1 ${gameScore.s1 >= gameScore.s2 ? 'text-[#C60C30]' : 'text-slate-600'}`}>PATRIOTS</p>
              <p className={`text-3xl font-orbitron font-black italic ${gameScore.s1 >= gameScore.s2 ? 'text-white' : 'text-slate-500'}`}>{gameScore.s1}</p>
            </div>
            
            <div className="flex flex-col items-center flex-1 mx-4">
              <div className="px-3 py-1 bg-white/5 rounded-full mb-3 border border-white/5">
                <span className={`text-[8px] font-black ${gameScore.redzoneTeam ? 'text-red-500 animate-pulse' : 'text-[#69BE28]'} uppercase tracking-widest`}>
                  {gameScore.redzoneTeam ? 'REDZONE ALERT' : gameScore.status}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex relative shadow-inner">
                <div style={{ width: `${100 - gameScore.momentum}%` }} className="h-full bg-[#C60C30] transition-all duration-700 ease-out shadow-[0_0_10px_rgba(198,12,48,0.5)]"></div>
                <div style={{ width: `${gameScore.momentum}%` }} className="h-full bg-[#69BE28] transition-all duration-700 ease-out shadow-[0_0_10px_rgba(105,190,40,0.5)]"></div>
              </div>
            </div>

            <div className="text-center w-24">
              <p className={`text-[10px] font-black uppercase mb-1 ${gameScore.s2 >= gameScore.s1 ? 'text-[#69BE28]' : 'text-slate-600'}`}>SEAHAWKS</p>
              <p className={`text-3xl font-orbitron font-black italic ${gameScore.s2 >= gameScore.s1 ? 'text-white' : 'text-slate-500'}`}>{gameScore.s2}</p>
            </div>
          </div>
        </div>

        <nav className="flex gap-1.5 mt-5 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'chat', label: 'COMMS' },
            { id: 'stats', label: 'STATS' },
            { id: 'stakes', label: 'STAKES' },
            { id: 'side', label: 'SHOW' },
            { id: 'ranks', label: 'RANKS' }
          ].map(tab => {
            const isTabActive = activeTab === tab.id;
            const tabTheme = tab.id === 'side' ? themeStyles.amber : teamTheme;
            return (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex-1 min-w-[70px] py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all transform active:scale-95 ${
                  isTabActive 
                    ? `${tabTheme.main} text-white shadow-xl z-10 border border-white/20` 
                    : 'bg-white/5 text-slate-500 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* MAIN THEATER */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-5">
        {activeTab === 'chat' && (
          <div className="space-y-5 pb-36">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2`}>
                <span className={`text-[8px] font-black uppercase mb-1 px-3 text-slate-500 tracking-widest`}>
                   {msg.senderName} {msg.senderId === 'controller_ai' && '• TAC_INTEL'}
                </span>
                <div className={`max-w-[90%] px-5 py-3 rounded-2xl text-[14px] leading-relaxed ${
                  msg.senderId === user.id ? `${teamTheme.main} text-white rounded-tr-none shadow-lg border border-white/10` : 
                  msg.senderId === 'controller_ai' ? 'bg-slate-900 border-l-4 border-blue-500 text-slate-200 italic rounded-tl-none font-medium' :
                  'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6 pb-24">
             {!gameScore.detailedStats ? (
               <div className="p-10 text-center glass rounded-[2.5rem] border-dashed border-white/10">
                  <i className="fas fa-sync-alt fa-spin text-4xl text-emerald-500 mb-4"></i>
                  <p className="font-orbitron font-black text-sm uppercase tracking-widest text-slate-500">Retrieving Live Intel...</p>
               </div>
             ) : (
               <>
                 <div className="p-6 glass rounded-[2.5rem] border border-white/10 space-y-6">
                    <h2 className="font-orbitron font-black text-lg uppercase italic text-white mb-4 border-b border-white/10 pb-2">COMMAND HUD</h2>
                    
                    {/* TOTAL YARDS BATTLE */}
                    <div className="space-y-3">
                       <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                          <span className="text-red-500">NE {gameScore.detailedStats.pYds} YDS</span>
                          <span className="text-emerald-500">SEA {gameScore.detailedStats.sYds} YDS</span>
                       </div>
                       <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden flex border border-white/5">
                          <div style={{ width: `${(parseInt(gameScore.detailedStats.pYds) / (parseInt(gameScore.detailedStats.pYds) + parseInt(gameScore.detailedStats.sYds))) * 100}%` }} className="bg-red-600 transition-all duration-1000"></div>
                          <div style={{ width: `${(parseInt(gameScore.detailedStats.sYds) / (parseInt(gameScore.detailedStats.pYds) + parseInt(gameScore.detailedStats.sYds))) * 100}%` }} className="bg-emerald-600 transition-all duration-1000"></div>
                       </div>
                       <p className="text-center text-[8px] font-black text-slate-500 uppercase tracking-[0.4em]">TOTAL OFFENSIVE PENETRATION</p>
                    </div>

                    {/* TOP HUD */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                       <div className="text-center">
                          <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">PATRIOTS TOP</p>
                          <p className="text-xl font-orbitron font-black text-white">{gameScore.detailedStats.pTop}</p>
                       </div>
                       <div className="text-center border-l border-white/10">
                          <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">SEAHAWKS TOP</p>
                          <p className="text-xl font-orbitron font-black text-white">{gameScore.detailedStats.sTop}</p>
                       </div>
                    </div>
                 </div>

                 {/* LEADER CARDS */}
                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 glass rounded-3xl border border-red-900/30 bg-red-900/5 space-y-3">
                       <p className="text-[8px] font-black text-red-500 uppercase">NE LEADERS</p>
                       <div className="space-y-2">
                          <div>
                             <p className="text-[7px] font-bold text-slate-600">PASS</p>
                             <p className="text-[10px] font-black truncate">{gameScore.detailedStats.pPassLead}</p>
                          </div>
                          <div>
                             <p className="text-[7px] font-bold text-slate-600">RUSH</p>
                             <p className="text-[10px] font-black truncate">{gameScore.detailedStats.pRushLead}</p>
                          </div>
                          <div>
                             <p className="text-[7px] font-bold text-slate-600">3RD CONV</p>
                             <p className="text-[10px] font-black">{gameScore.detailedStats.p3rd}</p>
                          </div>
                       </div>
                    </div>
                    <div className="p-4 glass rounded-3xl border border-emerald-900/30 bg-emerald-900/5 space-y-3">
                       <p className="text-[8px] font-black text-emerald-500 uppercase">SEA LEADERS</p>
                       <div className="space-y-2">
                          <div>
                             <p className="text-[7px] font-bold text-slate-600">PASS</p>
                             <p className="text-[10px] font-black truncate">{gameScore.detailedStats.sPassLead}</p>
                          </div>
                          <div>
                             <p className="text-[7px] font-bold text-slate-600">RUSH</p>
                             <p className="text-[10px] font-black truncate">{gameScore.detailedStats.sRushLead}</p>
                          </div>
                          <div>
                             <p className="text-[7px] font-bold text-slate-600">3RD CONV</p>
                             <p className="text-[10px] font-black">{gameScore.detailedStats.s3rd}</p>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="p-5 glass rounded-[2rem] border border-amber-500/20 flex justify-between items-center">
                    <div className="text-center">
                       <p className="text-[7px] font-black text-slate-500 uppercase">SACKS</p>
                       <p className="text-2xl font-orbitron font-black text-amber-500">{gameScore.detailedStats.sacks}</p>
                    </div>
                    <div className="h-10 w-px bg-white/10"></div>
                    <div className="text-center">
                       <p className="text-[7px] font-black text-slate-500 uppercase">TURNOVERS</p>
                       <p className="text-2xl font-orbitron font-black text-red-500">{gameScore.detailedStats.turnovers}</p>
                    </div>
                    <div className="h-10 w-px bg-white/10"></div>
                    <div className="text-center">
                       <p className="text-[7px] font-black text-slate-500 uppercase">BIG PLAYS</p>
                       <p className="text-2xl font-orbitron font-black text-emerald-500">{gameScore.bigPlayTrigger > 0 ? 'ACTIVE' : '0'}</p>
                    </div>
                 </div>

                 <p className="text-center text-[7px] font-black text-slate-600 uppercase tracking-[0.5em] mt-4">SEARCH GROUNDED INTEL • UPDATED REAL-TIME</p>
               </>
             )}
          </div>
        )}

        {activeTab === 'stakes' && (
          <div className="space-y-6 pb-24">
             <div className="p-6 glass border border-white/10 rounded-[2.5rem] space-y-8">
                <div className="text-center">
                   <h2 className="font-orbitron font-black text-xl uppercase italic mb-2 tracking-tight">SB LX STAKES</h2>
                   <p className="text-[8px] font-black text-slate-500 tracking-[0.4em] uppercase">MISSION_OBJECTIVES_2026</p>
                </div>
                <div className="space-y-6">
                  {PREDICTION_TASKS.map((task) => (
                    <div key={task.id} className="space-y-3">
                       <div className="flex justify-between items-center px-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{task.label}</label>
                          <span className="text-[7px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">+{task.points} XP</span>
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                          {task.options.map((opt) => (
                            <button
                              key={opt}
                              disabled={hasSavedStakes}
                              onClick={() => setPredictions(prev => ({ ...prev, [task.id]: opt }))}
                              className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${
                                predictions[task.id] === opt 
                                  ? `${teamTheme.main} border-white/40 text-white shadow-2xl` 
                                  : 'bg-black/40 border-white/5 text-slate-500 hover:border-white/20'
                              } ${hasSavedStakes && predictions[task.id] !== opt ? 'opacity-30' : ''}`}
                            >
                              {opt}
                            </button>
                          ))}
                       </div>
                    </div>
                  ))}
                </div>
                {!hasSavedStakes && (
                  <button onClick={() => setHasSavedStakes(true)} className={`w-full py-5 rounded-2xl ${teamTheme.main} font-black uppercase tracking-[0.3em] mt-6 shadow-2xl border-t-2 border-white/20`}>SEAL PREDICTIONS</button>
                )}
             </div>
          </div>
        )}

        {activeTab === 'side' && (
          <div className="space-y-6 pb-24">
             <div className="p-6 glass border border-amber-500/20 rounded-[2.5rem] space-y-8 bg-amber-500/5">
                <div className="text-center">
                   <h2 className="font-orbitron font-black text-xl uppercase italic text-amber-500 mb-2 tracking-tight">SUPER BOWL SHOW</h2>
                   <p className="text-[8px] font-black text-amber-500/40 tracking-[0.4em] uppercase">ADS_&_HALFTIME_INTEL</p>
                </div>
                <div className="space-y-6">
                  {SIDE_TASKS.map((task) => (
                    <div key={task.id} className="space-y-3">
                       <div className="flex justify-between items-center px-2">
                          <label className="text-[9px] font-black text-amber-500/70 uppercase tracking-[0.2em]">{task.label}</label>
                          <span className="text-[7px] font-black text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full border border-amber-500/20">+{task.points} XP</span>
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                          {task.options.map((opt) => (
                            <button
                              key={opt}
                              disabled={hasSavedSide}
                              onClick={() => setSidePredictions(prev => ({ ...prev, [task.id]: opt }))}
                              className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${
                                sidePredictions[task.id] === opt 
                                  ? 'bg-amber-600 border-white/40 text-white shadow-2xl' 
                                  : 'bg-black/40 border-white/5 text-slate-600'
                              } ${hasSavedSide && sidePredictions[task.id] !== opt ? 'opacity-30' : ''}`}
                            >
                              {opt}
                            </button>
                          ))}
                       </div>
                    </div>
                  ))}
                </div>
                {!hasSavedSide && (
                  <button onClick={() => setHasSavedSide(true)} className="w-full py-5 rounded-2xl bg-amber-600 font-black uppercase tracking-[0.3em] mt-6 shadow-2xl border-t-2 border-white/20">SEAL SHOW OPS</button>
                )}
             </div>
          </div>
        )}

        {activeTab === 'ranks' && (
          <div className="space-y-4 pb-24">
            <div className="text-center mb-8 py-6 border-y border-white/10">
               <h3 className="font-orbitron text-[12px] font-black text-slate-500 uppercase tracking-[0.5em]">LX MISSION STATUS</h3>
               <p className="text-[9px] font-black text-[#69BE28] uppercase mt-2 animate-pulse">2026 OPERATIVES RETURNING TO ZERO BASELINE</p>
            </div>
            {[{n: user.name, p: 0, r: 'RECRUIT'}].map((r, i) => (
              <div key={i} className={`flex items-center gap-5 p-5 glass rounded-[2rem] border-l-4 border-l-[#69BE28] border border-white/10 shadow-2xl relative overflow-hidden bg-white/5`}>
                 <div className="w-10 h-10 rounded-xl bg-black/60 flex items-center justify-center font-black text-[#69BE28] text-sm border border-white/10">{i+1}</div>
                 <div className="flex-1">
                    <div className="font-black text-sm uppercase text-white tracking-wide">{r.n}</div>
                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">RANK: {r.r}</div>
                 </div>
                 <div className="text-right">
                    <div className="font-orbitron font-black text-[#69BE28] text-lg">{r.p}</div>
                    <div className="text-[7px] font-black text-[#69BE28]/40 uppercase tracking-tighter">XP INTEL</div>
                 </div>
              </div>
            ))}
            <div className="mt-10 p-10 bg-white/2 rounded-[2rem] border border-dashed border-white/10 text-center">
               <i className="fas fa-trophy text-4xl text-slate-700 mb-4 opacity-30"></i>
               <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">WAITING FOR LX KICKOFF</p>
            </div>
          </div>
        )}
      </main>

      {/* MISSION CONTROL INPUT */}
      {(activeTab === 'chat' || activeTab === 'side') && (
        <div className="absolute bottom-8 inset-x-6 p-5 glass rounded-[3rem] border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[60] backdrop-blur-3xl">
           <div className="flex gap-3 mb-4">
              <button onClick={() => { if(db) addDoc(collection(db, HYPE_COLLECTION), { team: user.team, userId: user.id, timestamp: serverTimestamp() }); }} className={`flex-1 py-4 ${activeTheme.bgLight} border border-white/10 rounded-2xl text-[10px] font-black uppercase hover:${activeTheme.main}/30 active:scale-95 transition-all flex items-center justify-center gap-3`}>
                <i className="fas fa-fire-alt text-amber-500"></i>
                HYPE {user.team === 'T1' ? 'NEW ENGLAND' : 'SEATTLE'}
              </button>
              <button className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase active:scale-95 transition-all hover:bg-white/10">
                <i className="fas fa-bullhorn text-emerald-400"></i>
              </button>
           </div>
           <form onSubmit={(e) => {
             e.preventDefault();
             const input = e.currentTarget.elements[0] as HTMLInputElement;
             if (!input.value.trim() || !db) return;
             const collectionName = activeTab === 'side' ? SIDE_MSG_COLLECTION : MSG_COLLECTION;
             addDoc(collection(db, collectionName), {
               senderId: user.id, senderName: user.name, text: input.value, timestamp: serverTimestamp()
             });
             input.value = '';
           }} className="flex gap-3">
             <input placeholder={`ENTER ${activeTab === 'side' ? 'SHOW' : 'COMMAND'} INTEL...`} className="flex-1 bg-black/50 border border-white/10 rounded-[1.5rem] px-6 py-4 outline-none text-white text-[13px] font-medium focus:border-emerald-500 placeholder:text-slate-600 transition-all" />
             <button type="submit" className={`w-14 h-14 ${activeTheme.main} rounded-[1.5rem] flex items-center justify-center shadow-lg active:scale-90 transition-all border-t border-white/30`}><i className="fas fa-paper-plane"></i></button>
           </form>
        </div>
      )}

      {/* TACTICAL TICKER */}
      <div className="h-8 bg-black border-t border-white/10 flex items-center overflow-hidden z-[100] relative">
         <div className="ticker-wrap w-full flex items-center">
            <div className="ticker font-orbitron font-black text-[9px] text-[#69BE28] uppercase tracking-[0.4em] space-x-24">
               <span>{gameScore.ticker}</span>
            </div>
         </div>
         <div className="absolute right-0 top-0 h-full w-20 bg-gradient-to-l from-black to-transparent pointer-events-none"></div>
      </div>
    </div>
  );
}

function JoinScreen({ onJoin, onInvite }: { onJoin: (n: string, t: 'T1' | 'T2') => void, onInvite: () => void }) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState<'T1' | 'T2'>('T1');
  return (
    <div className={`flex items-center justify-center min-h-screen p-6 transition-colors duration-1000 ${team === 'T1' ? 'bg-[#002244]' : 'bg-[#002244]'} relative overflow-hidden`}>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
      <div className="w-full max-w-md p-12 glass rounded-[4rem] text-center border-white/10 shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative z-10 space-y-12">
        <div className="animate-in fade-in zoom-in duration-700">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center rotate-3 shadow-2xl">
            <i className="fas fa-football-ball text-4xl text-white"></i>
          </div>
          <h1 className="font-orbitron text-5xl font-black italic text-white mb-3 tracking-tighter drop-shadow-2xl">SUPER BOWL LX</h1>
          <button onClick={onInvite} className="mt-4 text-[9px] font-black text-[#69BE28] uppercase tracking-[0.4em] bg-[#69BE28]/10 border border-[#69BE28]/30 px-6 py-2.5 rounded-full hover:bg-[#69BE28]/20 active:scale-95 transition-all shadow-lg">
            <i className="fas fa-satellite-dish mr-2"></i> BROADCAST MISSION INVITE
          </button>
        </div>
        
        <div className="space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">ASSIGN OPERATIVE NAME</label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value.toUpperCase())} 
              placeholder="ENTER CALLSIGN" 
              className="w-full bg-black/60 border-b-4 border-white/10 rounded-2xl px-8 py-5 text-white font-black text-center uppercase outline-none focus:border-[#69BE28] text-2xl transition-all shadow-inner" 
            />
          </div>
          
          <div className="space-y-4">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">CHOOSE ALLEGIANCE</label>
            <div className="grid grid-cols-2 gap-5">
               <button onClick={() => setTeam('T1')} className={`py-6 rounded-3xl border-2 transition-all transform ${team === 'T1' ? 'border-[#C60C30] bg-[#C60C30] text-white shadow-[0_0_30px_rgba(198,12,48,0.4)] scale-105' : 'border-white/5 bg-black/40 text-slate-600 opacity-50'}`}>
                 <span className="font-black text-lg tracking-tighter">PATRIOTS</span>
                 <p className="text-[8px] font-black opacity-60">NEW ENGLAND</p>
               </button>
               <button onClick={() => setTeam('T2')} className={`py-6 rounded-3xl border-2 transition-all transform ${team === 'T2' ? 'border-[#69BE28] bg-[#69BE28] text-white shadow-[0_0_30px_rgba(105,190,40,0.4)] scale-105' : 'border-white/5 bg-black/40 text-slate-600 opacity-50'}`}>
                 <span className="font-black text-lg tracking-tighter">SEAHAWKS</span>
                 <p className="text-[8px] font-black opacity-60">SEATTLE</p>
               </button>
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => name && onJoin(name, team)} 
          className={`w-full py-6 rounded-[2.5rem] ${team === 'T1' ? 'bg-[#C60C30]' : 'bg-[#69BE28]'} text-white font-black text-xl tracking-[0.3em] shadow-[0_15px_40px_rgba(0,0,0,0.5)] border-t-2 border-white/20 active:translate-y-1 transition-all`}
        >
          DEPLOY TO HUB
        </button>
      </div>
    </div>
  );
}

function ConfigScreen() {
  const [config, setConfig] = useState('');
  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-[#001122] text-white">
      <div className="max-w-md w-full glass p-10 rounded-[3rem] space-y-8 border-white/10 shadow-2xl">
        <div className="text-center">
           <i className="fas fa-shield-alt text-4xl text-blue-500 mb-4"></i>
           <h2 className="text-2xl font-orbitron font-black italic uppercase tracking-tight">System Initialization</h2>
           <p className="text-[9px] font-black text-slate-500 uppercase mt-2 tracking-widest">Database Credentials Required</p>
        </div>
        <textarea 
          rows={6} 
          value={config} 
          onChange={e => setConfig(e.target.value)} 
          className="w-full bg-black/60 border border-white/10 rounded-[2rem] p-5 text-[10px] font-mono outline-none focus:border-blue-500 shadow-inner" 
          placeholder='{ "apiKey": "...", ... }'
        />
        <button onClick={() => saveManualConfig(config)} className="w-full bg-blue-600 py-5 rounded-[2rem] font-black text-[12px] tracking-[0.2em] shadow-xl hover:bg-blue-500 transition-all">ESTABLISH SECURE LINK</button>
      </div>
    </div>
  );
}
