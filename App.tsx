import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, setDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, getMissingKeys, saveManualConfig, clearManualConfig, getDoc } from './services/firebaseService';
import { getCoachResponse, getPostGameAnalysis, getSidelineFact, getLiveScoreFromSearch } from './services/geminiService';
import { ChatMessage, User, TriviaQuestion, ScoreEntry } from './types';

const INITIAL_TRIVIA: TriviaQuestion[] = [
  { id: 'q1', text: "Where did the Rams play before moving to Los Angeles (first time)?", options: ["Cleveland", "St. Louis", "Anaheim", "San Diego"], correctIndex: 0, points: 100 },
  { id: 'q2', text: "Which Seahawks player is known as 'Beast Mode'?", options: ["Shaun Alexander", "Marshawn Lynch", "DK Metcalf", "Tyler Lockett"], correctIndex: 1, points: 100 },
  { id: 'q3', text: "Over/Under: Will Matthew Stafford throw for 2+ Touchdowns tonight?", options: ["OVER", "UNDER"], correctIndex: 0, points: 150 },
  { id: 'q4', text: "How many Super Bowl titles do the Seattle Seahawks have?", options: ["0", "1", "2", "3"], correctIndex: 1, points: 150 },
  { id: 'q5', text: "Which Rams defensive player has won 3 NFL Defensive Player of the Year awards?", options: ["Jalen Ramsey", "Aaron Donald", "Bobby Wagner", "Ernest Jones"], correctIndex: 1, points: 200 },
  { id: 'q6', text: "Over/Under: Total sacks by both teams combined will be 5.5?", options: ["OVER", "UNDER"], correctIndex: 0, points: 150 },
  { id: 'q7', text: "What is the name of the Seahawks' home stadium?", options: ["Lumen Field", "SoFi Stadium", "Levi's Stadium", "State Farm Stadium"], correctIndex: 0, points: 100 },
  { id: 'q8', text: "Who is the current head coach of the Los Angeles Rams?", options: ["Sean McVay", "Pete Carroll", "Mike Macdonald", "Kyle Shanahan"], correctIndex: 0, points: 100 },
  { id: 'q9', text: "Over/Under: DK Metcalf records more than 75.5 receiving yards?", options: ["OVER", "UNDER"], correctIndex: 1, points: 200 },
  { id: 'q10', text: "Which team won the last head-to-head meeting between these two?", options: ["Rams", "Seahawks"], correctIndex: 0, points: 150 }
];

const HALFTIME_TRIVIA: TriviaQuestion[] = [
  { id: 'h1', text: "BONUS: In the 2021 Wild Card game, who threw a pick-six for Seattle against the Rams?", options: ["Russell Wilson", "Geno Smith", "Marshawn Lynch", "Tyler Lockett"], correctIndex: 0, points: 500 },
  { id: 'h2', text: "BONUS: Who holds the Seahawks record for most career rushing yards?", options: ["Marshawn Lynch", "Shaun Alexander", "Chris Carson", "Curt Warner"], correctIndex: 1, points: 500 },
  { id: 'h3', text: "ULTIMATE BONUS: Predict the exact point total for the 3rd Quarter (Both Teams).", options: ["0-7", "8-14", "15-21", "22+"], correctIndex: 2, points: 1000 }
];

const MSG_COLLECTION = 'hub_rams_sea_beta_v2';
const RANK_COLLECTION = 'ranks_rams_sea_beta_v2';
const USER_STORAGE_KEY = 'sblix_user_beta_v2';
const RECAP_COLLECTION = 'recap_rams_sea_beta_v2';
const GAME_STATE_DOC = 'state_rams_sea_beta_v2';
const SIDELINE_BOT_ID = 'sideline_bot_ai';

export default function App() {
  const [user, setUser] = useState<(User & { team?: string }) | null>(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'trivia' | 'ranks'>('chat');
  const [inputName, setInputName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('RAMS');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<'Live' | 'Syncing' | 'Solo'>(db ? 'Syncing' : 'Solo');
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [showDiag, setShowDiag] = useState(false);
  const [manualConfig, setManualConfig] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [gameScore, setGameScore] = useState({ rams: 0, seahawks: 0 });
  const [postGameRecap, setPostGameRecap] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isHalftime, setIsHalftime] = useState(false);
  const [scoreSources, setScoreSources] = useState<string[]>([]);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Background Automated Systems (Fact Bot & Score Sync)
  useEffect(() => {
    if (!user || !db || status !== 'Live') return;

    const backgroundInterval = setInterval(async () => {
      try {
        const stateRef = doc(db, GAME_STATE_DOC, 'global');
        const stateSnap = await getDoc(stateRef);
        const now = Date.now();
        const data = stateSnap.exists() ? stateSnap.data() : {};
        
        // 1. Fact Bot - Every 8 mins
        const lastFactTime = data.lastFactTime || 0;
        if (now - lastFactTime > 480000) {
          await setDoc(stateRef, { lastFactTime: now }, { merge: true });
          const fact = await getSidelineFact();
          const factMsg = {
            senderId: SIDELINE_BOT_ID,
            senderName: 'SIDELINE BOT 🤖',
            text: fact,
            timestamp: serverTimestamp()
          };
          await addDoc(collection(db, MSG_COLLECTION), factMsg);
        }

        // 2. Score Auto-Sync - Every 5 mins
        const lastScoreCheckTime = data.lastScoreCheckTime || 0;
        if (now - lastScoreCheckTime > 300000) {
          setIsAutoSyncing(true);
          await setDoc(stateRef, { lastScoreCheckTime: now }, { merge: true });
          const update = await getLiveScoreFromSearch();
          if (update && update.rams !== null) {
            await setDoc(stateRef, { 
              ramsScore: update.rams, 
              seahawksScore: update.seahawks,
              isHalftime: update.isHalftime,
              scoreSources: update.sources
            }, { merge: true });
          }
          setIsAutoSyncing(false);
        }
      } catch (e) {
        console.error("Background sync error:", e);
        setIsAutoSyncing(false);
      }
    }, 30000); // Poll lock every 30s

    return () => clearInterval(backgroundInterval);
  }, [user, status]);

  useEffect(() => {
    if (!user) return;
    if (!db) {
      setStatus('Solo');
      return;
    }

    let isMounted = true;
    const syncTimeout = setTimeout(() => {
      if (isMounted && status === 'Syncing') setStatus('Solo');
    }, 5000);

    const q = query(collection(db, MSG_COLLECTION), orderBy('timestamp', 'asc'), limit(60));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      clearTimeout(syncTimeout);
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp)
      })) as ChatMessage[];
      setMessages(msgs);
      setStatus('Live');
    });

    const unsubscribeLeaderboard = onSnapshot(collection(db, RANK_COLLECTION), (snapshot) => {
      if (!isMounted) return;
      const scores = snapshot.docs.map(doc => doc.data() as ScoreEntry);
      setLeaderboard(scores.sort((a, b) => b.points - a.points));
    });

    const unsubscribeRecap = onSnapshot(doc(db, RECAP_COLLECTION, 'latest'), (snapshot) => {
      if (snapshot.exists()) {
        setPostGameRecap(snapshot.data().text);
      }
    });

    const unsubscribeGameState = onSnapshot(doc(db, GAME_STATE_DOC, 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setIsHalftime(data.isHalftime);
        setGameScore({
          rams: data.ramsScore ?? 0,
          seahawks: data.seahawksScore ?? 0
        });
        setScoreSources(data.scoreSources ?? []);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeChat();
      unsubscribeLeaderboard();
      unsubscribeRecap();
      unsubscribeGameState();
      clearTimeout(syncTimeout);
    };
  }, [user]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const forceScoreSearch = async () => {
    setIsAutoSyncing(true);
    const update = await getLiveScoreFromSearch();
    if (update && update.rams !== null && db) {
      await setDoc(doc(db, GAME_STATE_DOC, 'global'), { 
        ramsScore: update.rams, 
        seahawksScore: update.seahawks,
        isHalftime: update.isHalftime,
        lastScoreCheckTime: Date.now(),
        scoreSources: update.sources
      }, { merge: true });
    }
    setIsAutoSyncing(false);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const newUser = { id: 'usr_' + Math.random().toString(36).substr(2, 5), name: inputName.trim().toUpperCase(), team: selectedTeam };
    setUser(newUser);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;
    const text = inputText.trim();
    setInputText('');
    const newMsg = { senderId: user.id, senderName: user.name, senderTeam: user.team, text, timestamp: status === 'Live' ? serverTimestamp() : new Date().toISOString() };
    if (status === 'Live' && db) await addDoc(collection(db, MSG_COLLECTION), newMsg);
    if (text.toLowerCase().includes('/coach')) {
      setIsCoachThinking(true);
      const coachText = await getCoachResponse(text);
      if (status === 'Live' && db) await addDoc(collection(db, MSG_COLLECTION), { senderId: 'coach_ai', senderName: 'COACH SBLIX 🏈', text: coachText, timestamp: serverTimestamp() });
      setIsCoachThinking(false);
    }
  };

  const handleAnswer = (qId: string, idx: number, correct: number, pts: number) => {
    if (answeredQuestions.has(qId)) return;
    setAnsweredQuestions(prev => new Set(prev).add(qId));
    if (idx === correct) {
      if (!user) return;
      const current = leaderboard.find(s => s.userId === user.id) || { userId: user.id, userName: user.name, team: user.team || 'RAMS', points: 0, trophies: 0 };
      if (status === 'Live' && db) setDoc(doc(db, RANK_COLLECTION, user.id), { ...current, points: current.points + pts }, { merge: true });
      alert("TOUCHDOWN! + " + pts + " pts");
    } else {
      alert("INCOMPLETE PASS! Better luck next play.");
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 relative overflow-hidden text-center">
        <div className="scanline"></div>
        <div className="w-full max-w-md p-8 glass rounded-[2.5rem] shadow-2xl relative z-10 border border-white/10">
          <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/30">
            <i className="fas fa-search-location text-2xl text-blue-400"></i>
          </div>
          <h1 className="font-orbitron text-3xl font-black italic text-white mb-2 uppercase tracking-tighter">SBLIX AUTO</h1>
          <p className="text-blue-500/60 text-[10px] mb-8 font-black uppercase tracking-[0.4em]">Live Search Grounding Enabled</p>
          <form onSubmit={handleJoin} className="space-y-6">
            <input autoFocus value={inputName} onChange={(e) => setInputName(e.target.value.slice(0, 12).toUpperCase())} placeholder="HANDLE" className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-blue-500 text-white font-black text-lg uppercase tracking-widest text-center" />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setSelectedTeam('RAMS')} className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'RAMS' ? 'border-blue-600 bg-blue-600/20 text-blue-400' : 'border-white/5 bg-white/5 text-slate-500'}`}>RAMS</button>
              <button type="button" onClick={() => setSelectedTeam('SEAHAWKS')} className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'SEAHAWKS' ? 'border-emerald-600 bg-emerald-600/20 text-emerald-400' : 'border-white/5 bg-white/5 text-slate-500'}`}>SEAHAWKS</button>
            </div>
            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-blue-500/30">JOIN GAME HUB</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-slate-950 border-x border-white/5 relative shadow-2xl overflow-hidden">
      <header className="pt-6 pb-4 px-4 glass border-b border-white/10 z-50">
        <div className="flex justify-between items-center mb-4 px-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'Live' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{status} HUB</span>
          </div>
          <div className="flex items-center gap-2">
            {isAutoSyncing && <i className="fas fa-sync fa-spin text-blue-500 text-[10px]"></i>}
            <button onClick={() => setShowDiag(!showDiag)} className="text-slate-600 hover:text-white transition-colors text-[10px] font-black uppercase"><i className="fas fa-cog"></i></button>
          </div>
        </div>
        
        {showDiag && (
           <div className="mb-4 p-4 bg-black/80 rounded-2xl border border-white/10 animate-msgPop space-y-4">
             <div className="space-y-4">
               <p className="text-[10px] font-black text-blue-500 uppercase italic">Admin Sync Controls</p>
               <button onClick={forceScoreSearch} disabled={isAutoSyncing} className="w-full bg-blue-600 text-white text-[10px] font-black uppercase py-3 rounded-lg flex items-center justify-center gap-2">
                 <i className={`fas ${isAutoSyncing ? 'fa-spinner fa-spin' : 'fa-satellite'}`}></i>
                 {isAutoSyncing ? 'Search Grounding Active...' : 'Manual Score Search'}
               </button>
               {scoreSources.length > 0 && (
                 <div className="space-y-1">
                   <p className="text-[8px] font-black text-slate-600 uppercase">Verification Sources:</p>
                   {scoreSources.map((src, idx) => (
                     <a key={idx} href={src} target="_blank" className="block text-[8px] text-blue-400 truncate underline">{src}</a>
                   ))}
                 </div>
               )}
             </div>
           </div>
        )}

        <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-3xl border border-white/5 shadow-inner">
          <div className="text-center">
            <p className="text-[10px] font-black text-blue-500 tracking-widest uppercase">LAR</p>
            <p className="text-3xl font-orbitron font-black italic text-white">{gameScore.rams}</p>
          </div>
          <div className="text-center">
            <div className={`px-4 py-1 rounded-full border transition-all ${isHalftime ? 'bg-purple-500/20 border-purple-500/40' : 'bg-blue-500/10 border-blue-500/20'}`}>
              <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${isHalftime ? 'text-purple-400 animate-pulse' : 'text-blue-400'}`}>
                {isHalftime ? 'HALFTIME' : 'LIVE SCORE'}
              </p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-emerald-500 tracking-widest uppercase">SEA</p>
            <p className="text-3xl font-orbitron font-black italic text-white">{gameScore.seahawks}</p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'chat' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-500'}`}>Chat</button>
          <button onClick={() => setActiveTab('trivia')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'trivia' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-500'}`}>Trivia</button>
          <button onClick={() => setActiveTab('ranks')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'ranks' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-500'}`}>Ranks</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] custom-scrollbar">
        {activeTab === 'chat' && (
          <div className="p-4 space-y-4 pb-32">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'} msg-animate`}>
                <span className={`text-[9px] font-black uppercase mb-1 px-1 ${msg.senderId === SIDELINE_BOT_ID ? 'text-emerald-400' : 'text-slate-500'}`}>{msg.senderName}</span>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-xl ${msg.senderId === user.id ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-900 text-slate-200 border border-white/5 rounded-tl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'trivia' && (
          <div className="p-6 space-y-6 pb-24">
            {INITIAL_TRIVIA.map(q => (
              <div key={q.id} className={`p-6 rounded-3xl border transition-all ${answeredQuestions.has(q.id) ? 'bg-white/5 border-white/5 opacity-50' : 'bg-slate-900 border-white/10 shadow-2xl'}`}>
                <div className="flex justify-between items-center mb-4">
                  <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full">{q.points} PTS</span>
                </div>
                <p className="text-lg font-bold text-white mb-6 leading-tight">{q.text}</p>
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt, idx) => (
                    <button key={idx} disabled={answeredQuestions.has(q.id)} onClick={() => handleAnswer(q.id, idx, q.correctIndex, q.points)} className="w-full text-left px-5 py-4 rounded-2xl bg-black/40 border border-white/5 text-slate-300 hover:border-blue-500 hover:text-white transition-all text-sm font-bold uppercase">
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'ranks' && (
          <div className="p-6 pb-24 space-y-8">
            <div className="space-y-3">
              {leaderboard.map((score, i) => (
                <div key={score.userId} className={`flex items-center gap-4 p-5 rounded-3xl border transition-all ${score.userId === user.id ? 'bg-blue-600 border-blue-400' : 'bg-slate-900 border-white/5'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-orbitron font-black text-xl ${i === 0 ? 'bg-yellow-400 text-yellow-900' : 'bg-black/40 text-slate-500'}`}>{i + 1}</div>
                  <div className="flex-1">
                    <p className="font-black text-sm uppercase tracking-wider text-white">{score.userName}</p>
                    <p className="text-[9px] font-bold uppercase opacity-60 text-slate-400">{score.team}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-orbitron font-black text-lg text-white">{score.points}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {activeTab === 'chat' && (
        <div className="absolute bottom-0 w-full p-4 glass border-t border-white/10 z-50">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Talk to the hub... (/coach)" className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-4 outline-none text-white text-sm" />
            <button type="submit" disabled={!inputText.trim()} className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><i className="fas fa-paper-plane"></i></button>
          </form>
        </div>
      )}
    </div>
  );
}