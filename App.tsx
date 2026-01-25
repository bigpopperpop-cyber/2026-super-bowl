import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, setDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, getMissingKeys, saveManualConfig, clearManualConfig } from './services/firebaseService';
import { getCoachResponse } from './services/geminiService';
import { ChatMessage, User, TriviaQuestion, ScoreEntry } from './types';

const INITIAL_TRIVIA: TriviaQuestion[] = [
  { id: 'ramsea_1', text: "Which player spent 10 years as a Seahawk before joining the Rams in 2022 and then returning to Seattle?", options: ["Bobby Wagner", "Richard Sherman", "Russell Wilson", "Cooper Kupp"], correctIndex: 0, points: 100 },
  { id: 'ramsea_2', text: "What is the nickname for the Seahawks' home stadium crowd in Seattle?", options: ["The Legion", "The 12th Man", "Sack City", "The Blue Crew"], correctIndex: 1, points: 150 },
  { id: 'ramsea_3', text: "In 2021, the Rams won the Super Bowl. Who was their offensive MVP for that game?", options: ["Matthew Stafford", "Cooper Kupp", "Aaron Donald", "Cam Akers"], correctIndex: 1, points: 200 }
];

export default function App() {
  const [user, setUser] = useState<(User & { team?: string }) | null>(() => {
    const saved = localStorage.getItem('chat_user');
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    if (!db) {
      setStatus('Solo');
      setMessages(JSON.parse(localStorage.getItem('local_chat_history') || '[]'));
      setLeaderboard(JSON.parse(localStorage.getItem('local_leaderboard') || '[]'));
      return;
    }

    let isMounted = true;
    const syncTimeout = setTimeout(() => {
      if (isMounted && status === 'Syncing') setStatus('Solo');
    }, 5000);

    const q = query(collection(db, 'party_hub'), orderBy('timestamp', 'asc'), limit(60));
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
    }, (err) => setStatus('Solo'));

    const unsubscribeLeaderboard = onSnapshot(collection(db, 'leaderboard_lix'), (snapshot) => {
      if (!isMounted) return;
      const scores = snapshot.docs.map(doc => doc.data() as ScoreEntry);
      setLeaderboard(scores.sort((a, b) => b.points - a.points));
    });

    return () => {
      isMounted = false;
      unsubscribeChat();
      unsubscribeLeaderboard();
      clearTimeout(syncTimeout);
    };
  }, [user]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const newUser = { 
      id: 'usr_' + Math.random().toString(36).substr(2, 5), 
      name: inputName.trim().toUpperCase(),
      team: selectedTeam 
    };
    setUser(newUser);
    localStorage.setItem('chat_user', JSON.stringify(newUser));
  };

  const handleInvite = async () => {
    const shareData = {
      title: 'SBLIX Beta Hub',
      text: 'Join me for the Rams vs Seahawks game! Test the hub load now.',
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share failed', err);
      }
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const wipeStadium = () => {
    if (window.confirm("BETA RESET: This will clear your local session and scores. Proceed?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const updateScore = async (points: number) => {
    if (!user) return;
    const currentScore = leaderboard.find(s => s.userId === user.id) || {
      userId: user.id,
      userName: user.name,
      team: user.team || 'RAMS',
      points: 0,
      trophies: 0
    };
    
    const newScore = {
      ...currentScore,
      points: currentScore.points + points,
      trophies: Math.floor((currentScore.points + points) / 300)
    };

    if (status === 'Live' && db) {
      await setDoc(doc(db, 'leaderboard_lix', user.id), newScore);
    } else {
      const newLB = [...leaderboard.filter(s => s.userId !== user.id), newScore];
      setLeaderboard(newLB.sort((a, b) => b.points - a.points));
      localStorage.setItem('local_leaderboard', JSON.stringify(newLB));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;
    const text = inputText.trim();
    setInputText('');
    
    const newMsg = {
      senderId: user.id,
      senderName: user.name,
      senderTeam: user.team,
      text,
      reactions: {},
      timestamp: status === 'Live' ? serverTimestamp() : new Date().toISOString()
    };

    if (status === 'Live' && db) {
      await addDoc(collection(db, 'party_hub'), newMsg);
    } else {
      const updated = [...messages, { ...newMsg, id: Date.now().toString() } as ChatMessage].slice(-50);
      setMessages(updated);
      localStorage.setItem('local_chat_history', JSON.stringify(updated));
    }

    if (text.toLowerCase().includes('/coach')) {
      setIsCoachThinking(true);
      const coachText = await getCoachResponse(text);
      const coachMsg = {
        senderId: 'coach_ai',
        senderName: 'COACH SBLIX 🏈',
        text: coachText,
        timestamp: status === 'Live' ? serverTimestamp() : new Date().toISOString()
      };
      if (status === 'Live' && db) {
        await addDoc(collection(db, 'party_hub'), coachMsg);
      } else {
        setMessages(prev => [...prev, { ...coachMsg, id: 'c' + Date.now() } as ChatMessage]);
      }
      setIsCoachThinking(false);
    }
  };

  const handleAnswer = (qId: string, idx: number, correct: number, pts: number) => {
    if (answeredQuestions.has(qId)) return;
    setAnsweredQuestions(prev => new Set(prev).add(qId));
    if (idx === correct) {
      updateScore(pts);
      alert("TOUCHDOWN! + " + pts + " pts");
    } else {
      alert("INCOMPLETE PASS! Try the next one.");
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 relative overflow-hidden">
        <div className="scanline"></div>
        <div className="w-full max-w-md p-8 glass rounded-[2.5rem] shadow-2xl relative z-10 border border-white/10 text-center">
          <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/30">
            <i className="fas fa-football-ball text-2xl text-blue-400"></i>
          </div>
          <h1 className="font-orbitron text-3xl font-black italic text-white mb-2 uppercase">Beta: NFC WEST</h1>
          <p className="text-blue-500/60 text-[10px] mb-8 font-black uppercase tracking-[0.4em]">RAMS vs SEAHAWKS</p>
          <form onSubmit={handleJoin} className="space-y-6">
            <input autoFocus value={inputName} onChange={(e) => setInputName(e.target.value.slice(0, 12).toUpperCase())} placeholder="YOUR HANDLE" className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-blue-500 transition-all text-white font-black text-lg uppercase tracking-widest text-center" />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setSelectedTeam('RAMS')} className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'RAMS' ? 'border-blue-600 bg-blue-600/20 text-blue-400' : 'border-white/5 bg-white/5 text-slate-500'}`}>RAMS</button>
              <button type="button" onClick={() => setSelectedTeam('SEAHAWKS')} className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'SEAHAWKS' ? 'border-emerald-600 bg-emerald-600/20 text-emerald-400' : 'border-white/5 bg-white/5 text-slate-500'}`}>SEAHAWKS</button>
            </div>
            <div className="flex flex-col gap-3">
              <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-blue-500/30">ENTER HUB</button>
              <button type="button" onClick={handleInvite} className="w-full bg-slate-800/50 hover:bg-slate-800 text-slate-400 border border-white/5 font-black uppercase tracking-[0.15em] py-4 rounded-2xl transition-all flex items-center justify-center gap-3">
                <i className={`fas ${copyFeedback ? 'fa-check text-emerald-500' : 'fa-user-plus'}`}></i>
                {copyFeedback ? 'LINK COPIED!' : 'INVITE SQUAD'}
              </button>
            </div>
          </form>
          <p className="mt-8 text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">Help us test the load for tonight's game!</p>
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
          <div className="flex items-center gap-3">
             <button onClick={() => setShowDiag(!showDiag)} className="text-slate-600 hover:text-white transition-colors text-[10px] font-black uppercase">
               <i className="fas fa-cog"></i>
             </button>
             <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-slate-600 hover:text-white transition-colors">
               <i className="fas fa-sign-out-alt text-xs"></i>
             </button>
          </div>
        </div>
        
        {showDiag && (
           <div className="mb-4 p-4 bg-black/80 rounded-2xl border border-white/10 animate-msgPop space-y-4">
             <div>
               <p className="text-[9px] font-black text-blue-500 uppercase mb-2">Manual Sync</p>
               <textarea value={manualConfig} onChange={(e) => setManualConfig(e.target.value)} placeholder='Paste Firebase JSON...' className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-[10px] font-mono text-slate-300 outline-none h-24 mb-2" />
               <div className="flex gap-2">
                 <button onClick={() => saveManualConfig(manualConfig)} className="flex-1 bg-blue-600 text-white text-[10px] font-black uppercase py-2 rounded-lg">Apply</button>
                 <button onClick={clearManualConfig} className="bg-white/5 text-slate-500 text-[10px] font-black uppercase py-2 px-4 rounded-lg">Reset</button>
               </div>
             </div>
             <button onClick={wipeStadium} className="w-full bg-red-600/20 text-red-500 border border-red-500/30 text-[10px] font-black uppercase py-3 rounded-xl hover:bg-red-600 hover:text-white transition-all">
               <i className="fas fa-bomb mr-2"></i> Nuclear Beta Reset
             </button>
           </div>
        )}

        <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-3xl border border-white/5 shadow-inner">
          <div className="text-center relative">
            <p className="text-[10px] font-black text-blue-500 tracking-widest">LAR</p>
            <p className="text-3xl font-orbitron font-black italic text-white">00</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-600 mb-1 italic uppercase">Kickoff 5:30</p>
            <div className="px-3 py-0.5 bg-blue-500/10 rounded-full border border-blue-500/20">
              <p className="text-[9px] font-black text-blue-400 animate-pulse tracking-[0.3em]">PREGAME</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-emerald-500 tracking-widest">SEA</p>
            <p className="text-3xl font-orbitron font-black italic text-white">00</p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 text-slate-500'}`}>
            <i className="fas fa-comment"></i> Chat
          </button>
          <button onClick={() => setActiveTab('trivia')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'trivia' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 text-slate-500'}`}>
            <i className="fas fa-bolt"></i> Trivia
          </button>
          <button onClick={() => setActiveTab('ranks')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'ranks' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 text-slate-500'}`}>
            <i className="fas fa-award"></i> Ranks
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] custom-scrollbar">
        {activeTab === 'chat' && (
          <div className="p-4 space-y-4 pb-32">
            {messages.map((msg, i) => {
              const isMe = msg.senderId === user.id;
              const isCoach = msg.senderId === 'coach_ai';
              const teamColor = (msg as any).senderTeam === 'RAMS' ? 'text-blue-400' : 'text-emerald-400';
              return (
                <div key={msg.id || i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} msg-animate`}>
                  <span className={`text-[9px] font-black uppercase tracking-wider mb-1 px-1 ${isCoach ? 'text-yellow-500' : teamColor}`}>
                    {msg.senderName} {isMe && '(YOU)'}
                  </span>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-xl ${isMe ? 'bg-blue-600 text-white font-bold rounded-tr-none' : isCoach ? 'bg-slate-900 border border-blue-500/40 text-blue-50 rounded-tl-none italic' : 'bg-slate-900 text-slate-200 rounded-tl-none border border-white/5'}`}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            {isCoachThinking && <div className="text-[8px] font-black text-blue-500/50 uppercase tracking-[0.4em] animate-pulse ml-2">Coach is scouting...</div>}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'trivia' && (
          <div className="p-6 space-y-6 pb-24">
            <h2 className="text-xl font-orbitron font-black italic text-white flex items-center gap-3">
              <i className="fas fa-fire text-orange-500"></i> NFC WEST TRIVIA
            </h2>
            {INITIAL_TRIVIA.map(q => (
              <div key={q.id} className={`p-6 rounded-3xl border transition-all ${answeredQuestions.has(q.id) ? 'bg-white/5 border-white/5 opacity-50' : 'bg-slate-900 border-white/10 shadow-2xl'}`}>
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full border border-blue-500/20">{q.points} PTS</span>
                  {answeredQuestions.has(q.id) && <i className="fas fa-check-circle text-emerald-500"></i>}
                </div>
                <p className="text-lg font-bold text-white mb-6 leading-tight">{q.text}</p>
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt, idx) => (
                    <button key={idx} disabled={answeredQuestions.has(q.id)} onClick={() => handleAnswer(q.id, idx, q.correctIndex, q.points)} className="w-full text-left px-5 py-4 rounded-2xl bg-black/40 border border-white/5 text-slate-300 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-sm font-bold">
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
            <div className="text-center">
              <h2 className="text-2xl font-orbitron font-black italic text-white mb-2">BETA LEADERBOARD</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic">Rams vs Seahawks | Tonight</p>
            </div>
            
            <div className="space-y-3">
              {leaderboard.length === 0 ? (
                <div className="text-center py-20 opacity-30">
                  <i className="fas fa-user-friends text-4xl mb-4 text-blue-500"></i>
                  <p className="font-black text-xs uppercase tracking-widest">Waiting for scores...</p>
                </div>
              ) : leaderboard.map((score, i) => (
                <div key={score.userId} className={`flex items-center gap-4 p-5 rounded-3xl border transition-all ${score.userId === user.id ? 'bg-blue-600 border-blue-400 shadow-xl shadow-blue-500/20' : 'bg-slate-900 border-white/5'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-orbitron font-black text-xl shadow-inner ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-slate-300 text-slate-600' : i === 2 ? 'bg-orange-400 text-orange-900' : 'bg-black/40 text-slate-500'}`}>
                    {i === 0 ? <i className="fas fa-crown"></i> : i + 1}
                  </div>
                  <div className="flex-1">
                    <p className={`font-black text-sm uppercase tracking-wider ${score.userId === user.id ? 'text-white' : 'text-white'}`}>{score.userName}</p>
                    <p className={`text-[9px] font-bold uppercase opacity-60 ${score.userId === user.id ? 'text-blue-100' : 'text-slate-400'}`}>{score.team}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-orbitron font-black text-lg ${score.userId === user.id ? 'text-white' : 'text-blue-400'}`}>{score.points}</p>
                    <div className="flex gap-1 justify-end">
                      {Array.from({ length: score.trophies || 0 }).map((_, t) => (
                        <i key={t} className={`fas fa-award text-[10px] ${score.userId === user.id ? 'text-white' : 'text-yellow-500'}`}></i>
                      ))}
                    </div>
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
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Talk to the hub... (/coach)" className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-blue-500 transition-all text-white font-medium text-sm" />
            <button type="submit" disabled={!inputText.trim()} className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white hover:bg-blue-500 disabled:opacity-20 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
              <i className="fas fa-paper-plane"></i>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
