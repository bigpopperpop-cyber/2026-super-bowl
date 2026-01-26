import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, setDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, getDoc } from './services/firebaseService';
import { getCoachResponse, getPostGameAnalysis, getSidelineFact, getLiveScoreFromSearch, verifyPredictiveStats } from './services/geminiService';
import { ChatMessage, User, TriviaQuestion, ScoreEntry, UserPrediction } from './types';

const TRIVIA_SET: TriviaQuestion[] = [
  { id: 'q1', text: "Where did the Rams play before moving to Los Angeles?", options: ["Cleveland", "St. Louis", "Anaheim", "San Diego"], correctIndex: 0, points: 100 },
  { id: 'q2', text: "Which Seahawks player is known as 'Beast Mode'?", options: ["Shaun Alexander", "Marshawn Lynch", "DK Metcalf", "Tyler Lockett"], correctIndex: 1, points: 100 },
  { id: 'q3', text: "Over/Under: Will Matthew Stafford throw for 2+ Touchdowns tonight?", options: ["OVER", "UNDER"], correctIndex: 0, points: 250, isPredictive: true },
  { id: 'q4', text: "How many Super Bowl titles do the Seattle Seahawks have?", options: ["0", "1", "2", "3"], correctIndex: 1, points: 100 },
  { id: 'q5', text: "Which Rams defender has 3 NFL DPOY awards?", options: ["Jalen Ramsey", "Aaron Donald", "Bobby Wagner", "Ernest Jones"], correctIndex: 1, points: 100 },
  { id: 'q6', text: "Over/Under: Combined sacks tonight will be 5.5?", options: ["OVER", "UNDER"], correctIndex: 0, points: 200, isPredictive: true },
  { id: 'q9', text: "Over/Under: DK Metcalf records 75.5+ receiving yards?", options: ["OVER", "UNDER"], correctIndex: 1, points: 250, isPredictive: true },
  { id: 'h3', text: "Predict the total points for the 3rd Quarter (Both Teams).", options: ["0-10", "11+"], correctIndex: 0, points: 500, isPredictive: true }
];

const MSG_COLLECTION = 'hub_rams_sea_beta_v2';
const RANK_COLLECTION = 'ranks_rams_sea_beta_v2';
const PREDICTIONS_COLLECTION = 'predictions_rams_sea_beta_v2';
const GAME_STATE_DOC = 'state_rams_sea_beta_v2';
const SIDELINE_BOT_ID = 'sideline_bot_ai';

export default function App() {
  const [user, setUser] = useState<(User & { team?: string }) | null>(() => {
    const saved = localStorage.getItem('sblix_user_beta_v2');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'trivia' | 'ranks'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'Live' | 'Syncing' | 'Solo'>(db ? 'Syncing' : 'Solo');
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [gameScore, setGameScore] = useState({ rams: 0, seahawks: 0 });
  const [showDiag, setShowDiag] = useState(false);
  const [settledResults, setSettledResults] = useState<Record<string, number>>({});
  const [myPredictions, setMyPredictions] = useState<Record<string, number>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // BACKGROUND AUTOMATION: Poll scores every 120 seconds (2 mins) for responsiveness
  useEffect(() => {
    if (!user || !db) return;

    const backgroundSync = async () => {
      try {
        const stateRef = doc(db, GAME_STATE_DOC, 'global');
        const stateSnap = await getDoc(stateRef);
        const data = stateSnap.exists() ? stateSnap.data() : {};
        const now = Date.now();

        // 1. AUTO SCORE SYNC (Every 2 Minutes for high-octane updates)
        const lastScoreCheck = data.lastScoreCheckTime || 0;
        if (now - lastScoreCheck > 120000) { 
          setIsAutoUpdating(true);
          // Optimistically update timestamp to lock other clients immediately
          await setDoc(stateRef, { lastScoreCheckTime: now }, { merge: true });
          
          const update = await getLiveScoreFromSearch();
          if (update && update.rams !== null) {
            await setDoc(stateRef, {
              ramsScore: update.rams,
              seahawksScore: update.seahawks,
              isHalftime: update.isHalftime,
              scoreSources: update.sources,
              lastSuccessfulSync: now
            }, { merge: true });
          } else {
            // If failed, reset lock earlier so someone else can try in 30s
            await setDoc(stateRef, { lastScoreCheckTime: now - 90000 }, { merge: true });
          }
          setIsAutoUpdating(false);
        }

        // 2. AUTO SIDELINE FACT (Every 8 Minutes)
        const lastFactTime = data.lastFactTime || 0;
        if (now - lastFactTime > 480000) {
          await setDoc(stateRef, { lastFactTime: now }, { merge: true });
          const fact = await getSidelineFact();
          await addDoc(collection(db, MSG_COLLECTION), {
            senderId: SIDELINE_BOT_ID,
            senderName: 'SIDELINE BOT 🤖',
            text: fact,
            timestamp: serverTimestamp()
          });
        }
      } catch (err) {
        console.error("Automation error:", err);
        setIsAutoUpdating(false);
      }
    };

    backgroundSync();
    const interval = setInterval(backgroundSync, 30000); // Check every 30s if we need to be the "syncer"
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;

    const unsubscribeGameState = onSnapshot(doc(db, GAME_STATE_DOC, 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setGameScore({ rams: data.ramsScore ?? 0, seahawks: data.seahawksScore ?? 0 });
        setSettledResults(data.settledTrivia ?? {});
        setLastSyncTime(data.lastSuccessfulSync ?? null);
      }
    });

    const q = query(collection(db, MSG_COLLECTION), orderBy('timestamp', 'asc'), limit(60));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any);
      setStatus('Live');
    });

    const unsubscribeLeaderboard = onSnapshot(collection(db, RANK_COLLECTION), (snapshot) => {
      setLeaderboard(snapshot.docs.map(doc => doc.data() as ScoreEntry).sort((a, b) => b.points - a.points));
    });

    const unsubscribeMyPredictions = onSnapshot(collection(db, PREDICTIONS_COLLECTION), (snapshot) => {
      const preds: Record<string, number> = {};
      snapshot.docs.filter(d => d.id.startsWith(user.id)).forEach(d => {
        preds[d.id.split('_')[1]] = d.data().choice;
      });
      setMyPredictions(preds);
      setAnsweredQuestions(new Set(Object.keys(preds)));
    });

    return () => {
      unsubscribeGameState();
      unsubscribeChat();
      unsubscribeLeaderboard();
      unsubscribeMyPredictions();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    
    const awardPoints = async () => {
      for (const [qId, correctIdx] of Object.entries(settledResults)) {
        const question = TRIVIA_SET.find(q => q.id === qId);
        const myChoice = myPredictions[qId];
        const alreadyPaidKey = `paid_${user.id}_${qId}`;
        
        if (question && myChoice !== undefined && myChoice === correctIdx && !localStorage.getItem(alreadyPaidKey)) {
          const current = leaderboard.find(s => s.userId === user.id) || { userId: user.id, userName: user.name, team: user.team || 'RAMS', points: 0, trophies: 0 };
          await setDoc(doc(db, RANK_COLLECTION, user.id), { ...current, points: current.points + question.points }, { merge: true });
          localStorage.setItem(alreadyPaidKey, 'true');
        }
      }
    };
    awardPoints();
  }, [settledResults, myPredictions]);

  const handleAnswer = async (q: TriviaQuestion, idx: number) => {
    if (!user || !db || answeredQuestions.has(q.id)) return;

    if (q.isPredictive) {
      await setDoc(doc(db, PREDICTIONS_COLLECTION, `${user.id}_${q.id}`), {
        userId: user.id,
        questionId: q.id,
        choice: idx,
        timestamp: serverTimestamp()
      });
    } else {
      if (idx === q.correctIndex) {
        const current = leaderboard.find(s => s.userId === user.id) || { userId: user.id, userName: user.name, team: user.team || 'RAMS', points: 0, trophies: 0 };
        await setDoc(doc(db, RANK_COLLECTION, user.id), { ...current, points: current.points + q.points }, { merge: true });
      }
      setAnsweredQuestions(prev => new Set(prev).add(q.id));
    }
  };

  const aiAutoSettle = async () => {
    setIsVerifying(true);
    const predictiveOnes = TRIVIA_SET.filter(q => q.isPredictive && settledResults[q.id] === undefined);
    const results = await verifyPredictiveStats(predictiveOnes);
    if (results && db) {
      const mappedResults: Record<string, number> = { ...settledResults };
      predictiveOnes.forEach(q => {
        if (results[q.text] !== undefined) mappedResults[q.id] = results[q.text];
      });
      await setDoc(doc(db, GAME_STATE_DOC, 'global'), { settledTrivia: mappedResults }, { merge: true });
    }
    setIsVerifying(false);
  };

  const forceSyncScore = async () => {
    setIsAutoUpdating(true);
    const update = await getLiveScoreFromSearch();
    if (update && update.rams !== null && db) {
      await setDoc(doc(db, GAME_STATE_DOC, 'global'), {
        ramsScore: update.rams,
        seahawksScore: update.seahawks,
        isHalftime: update.isHalftime,
        lastScoreCheckTime: Date.now(),
        lastSuccessfulSync: Date.now()
      }, { merge: true });
    }
    setIsAutoUpdating(false);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.currentTarget.elements[0] as HTMLInputElement).value.toUpperCase();
    if (!name) return;
    const newUser = { id: 'u' + Math.random().toString(36).substr(2, 5), name, team: 'RAMS' };
    setUser(newUser);
    localStorage.setItem('sblix_user_beta_v2', JSON.stringify(newUser));
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return "INITIALIZING...";
    const secondsAgo = Math.floor((Date.now() - lastSyncTime) / 1000);
    if (secondsAgo < 60) return "UPDATED SECONDS AGO";
    return `UPDATED ${Math.floor(secondsAgo / 60)}M AGO`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950">
        <div className="w-full max-w-md p-8 glass rounded-[2.5rem] text-center border border-white/10">
          <h1 className="font-orbitron text-3xl font-black italic text-white mb-6 uppercase tracking-tighter">SBLIX AUTO</h1>
          <form onSubmit={handleJoin} className="space-y-6">
            <input placeholder="ENTER HANDLE" className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-center uppercase outline-none focus:border-emerald-500 transition-all" />
            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/20 uppercase tracking-widest">JOIN BROADCAST</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-slate-950 border-x border-white/5 shadow-2xl overflow-hidden relative">
      <header className="p-6 glass border-b border-white/10 z-50">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'Live' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{status} HUB</span>
          </div>
          <div className="flex items-center gap-3">
             {isAutoUpdating && <i className="fas fa-satellite-dish text-blue-500 text-[10px] animate-pulse"></i>}
             <button onClick={() => setShowDiag(!showDiag)} className="text-slate-600 hover:text-white transition-colors"><i className="fas fa-cog"></i></button>
          </div>
        </div>

        {showDiag && (
          <div className="mb-6 p-4 bg-black/80 rounded-2xl border border-white/10 space-y-4 animate-msgPop">
            <p className="text-[10px] font-black text-emerald-500 uppercase italic">Admin Game Controls</p>
            <div className="space-y-3">
              <button onClick={forceSyncScore} disabled={isAutoUpdating} className="w-full bg-emerald-600 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                <i className={`fas ${isAutoUpdating ? 'fa-sync fa-spin' : 'fa-search'}`}></i>
                {isAutoUpdating ? 'Syncing Live Data...' : 'Force Score Sync'}
              </button>
              <button onClick={aiAutoSettle} disabled={isVerifying} className="w-full bg-blue-600 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                <i className={`fas ${isVerifying ? 'fa-spinner fa-spin' : 'fa-robot'}`}></i>
                Verify Stat Predictions
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center px-4 py-4 bg-black/40 rounded-3xl border border-white/5 relative overflow-hidden">
          {isAutoUpdating && <div className="absolute inset-0 bg-blue-500/5 animate-pulse pointer-events-none"></div>}
          <div className="text-center">
            <p className="text-[10px] font-black text-blue-500 uppercase mb-1">LAR</p>
            <p className="text-3xl font-orbitron font-black text-white italic">{gameScore.rams}</p>
          </div>
          <div className="text-center">
             <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full mb-1">
               <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] animate-pulse">Live Tracking</p>
             </div>
             <p className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">{formatLastSync()}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-emerald-500 uppercase mb-1">SEA</p>
            <p className="text-3xl font-orbitron font-black text-white italic">{gameScore.seahawks}</p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          {['chat', 'trivia', 'ranks'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-slate-500'}`}>{tab}</button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {activeTab === 'chat' && (
          <div className="space-y-4 pb-20">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'} msg-animate`}>
                <span className="text-[8px] font-black text-slate-500 uppercase mb-1 px-2">{msg.senderName}</span>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${msg.senderId === user.id ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'trivia' && (
          <div className="space-y-4 pb-10">
            {TRIVIA_SET.map(q => {
              const hasAnswered = answeredQuestions.has(q.id);
              const isSettled = settledResults[q.id] !== undefined;
              const myPick = myPredictions[q.id];
              const wasCorrect = isSettled && myPick === settledResults[q.id];

              return (
                <div key={q.id} className={`p-6 rounded-3xl border transition-all ${hasAnswered ? 'bg-white/5 border-white/5' : 'bg-slate-900 border-white/10 shadow-xl'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full ${q.isPredictive ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {q.isPredictive ? 'PREDICTION' : 'INSTANT FACT'} | {q.points} PTS
                    </span>
                    {isSettled && hasAnswered && (
                       <span className={`text-[10px] font-black ${wasCorrect ? 'text-emerald-500' : 'text-red-500'}`}>
                         {wasCorrect ? 'WINNER!' : 'MISS'}
                       </span>
                    )}
                  </div>
                  <p className="text-lg font-bold text-white mb-6 leading-tight uppercase italic">{q.text}</p>
                  
                  {q.isPredictive && !isSettled && hasAnswered && (
                    <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-center">
                      <p className="text-[10px] font-black text-blue-400 uppercase italic animate-pulse">Waiting for official stats...</p>
                      <p className="text-[9px] text-slate-500 uppercase mt-1">Your Pick: {q.options[myPick]}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2">
                    {q.options.map((opt, i) => (
                      <button 
                        key={i} 
                        disabled={hasAnswered} 
                        onClick={() => handleAnswer(q, i)} 
                        className={`w-full text-left px-5 py-4 rounded-2xl transition-all text-sm font-black border ${hasAnswered ? (isSettled ? (i === settledResults[q.id] ? 'bg-emerald-500 border-emerald-400 text-white' : (i === myPick ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-slate-900 border-white/5 text-slate-700')) : (i === myPick ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900 border-white/5 text-slate-700')) : 'bg-black/40 border-white/10 text-slate-300 hover:border-emerald-500 hover:text-white uppercase'}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'ranks' && (
          <div className="space-y-3 pb-10">
            {leaderboard.map((score, i) => (
              <div key={score.userId} className={`flex items-center gap-4 p-5 rounded-3xl border transition-all ${score.userId === user.id ? 'bg-emerald-600 border-emerald-400' : 'bg-slate-900 border-white/5'}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-orbitron font-black text-xl ${i === 0 ? 'bg-yellow-400 text-yellow-900' : 'bg-black/40 text-slate-500'}`}>{i + 1}</div>
                <div className="flex-1">
                  <p className="font-black text-sm uppercase text-white tracking-widest">{score.userName}</p>
                  <p className="text-[9px] font-bold uppercase text-slate-400 opacity-60">Super Fan</p>
                </div>
                <div className="text-right">
                  <p className="font-orbitron font-black text-lg text-white">{score.points}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'chat' && (
        <div className="p-4 glass border-t border-white/10 pb-10">
          <form onSubmit={(e) => { e.preventDefault(); const input = e.currentTarget.elements[0] as HTMLInputElement; if (!input.value.trim()) return; addDoc(collection(db!, MSG_COLLECTION), { senderId: user.id, senderName: user.name, text: input.value, timestamp: serverTimestamp() }); input.value = ''; }} className="flex gap-2">
            <input placeholder="TALK TO THE HUB..." className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-4 outline-none text-white text-sm" />
            <button className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><i className="fas fa-paper-plane"></i></button>
          </form>
        </div>
      )}
    </div>
  );
}