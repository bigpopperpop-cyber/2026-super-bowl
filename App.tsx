import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, setDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, getMissingKeys, saveManualConfig, clearManualConfig } from './services/firebaseService';
import { getCoachResponse } from './services/geminiService';
import { ChatMessage, User, TriviaQuestion, ScoreEntry } from './types';

const INITIAL_TRIVIA: TriviaQuestion[] = [
  { id: 'q1', text: "Who has the most Super Bowl rings as a player?", options: ["Tom Brady", "Joe Montana", "Jerry Rice", "Terry Bradshaw"], correctIndex: 0, points: 100 },
  { id: 'q2', text: "Which city has hosted the most Super Bowls?", options: ["Miami", "New Orleans", "Los Angeles", "New York"], correctIndex: 0, points: 150 },
  { id: 'q3', text: "What is the highest score ever by one team in a Super Bowl?", options: ["42", "55", "52", "49"], correctIndex: 1, points: 200 }
];

export default function App() {
  const [user, setUser] = useState<(User & { team?: string }) | null>(() => {
    const saved = localStorage.getItem('chat_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'trivia' | 'ranks'>('chat');
  const [inputName, setInputName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('AFC');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<'Live' | 'Syncing' | 'Solo'>(db ? 'Syncing' : 'Solo');
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [showDiag, setShowDiag] = useState(false);
  const [manualConfig, setManualConfig] = useState('');
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

  const updateScore = async (points: number) => {
    if (!user) return;
    const currentScore = leaderboard.find(s => s.userId === user.id) || {
      userId: user.id,
      userName: user.name,
      team: user.team || 'AFC',
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
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
            <i className="fas fa-trophy text-2xl text-yellow-400"></i>
          </div>
          <h1 className="font-orbitron text-4xl font-black italic text-white mb-2">SBLIX STAGE 2</h1>
          <p className="text-emerald-500/60 text-[10px] mb-8 font-black uppercase tracking-[0.4em]">LIVE TRIVIA & RANKS</p>
          <form onSubmit={handleJoin} className="space-y-6">
            <input autoFocus value={inputName} onChange={(e) => setInputName(e.target.value.slice(0, 12).toUpperCase())} placeholder="YOUR HANDLE" className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500 transition-all text-white font-black text-lg uppercase tracking-widest text-center" />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setSelectedTeam('AFC')} className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'AFC' ? 'border-red-600 bg-red-600/20 text-red-500' : 'border-white/5 bg-white/5 text-slate-500'}`}>AFC</button>
              <button type="button" onClick={() => setSelectedTeam('NFC')} className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'NFC' ? 'border-emerald-600 bg-emerald-600/20 text-emerald-500' : 'border-white/5 bg-white/5 text-slate-500'}`}>NFC</button>
            </div>
            <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/30">ENTER STADIUM</button>
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
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{status} STADIUM</span>
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
           <div className="mb-4 p-4 bg-black/60 rounded-2xl border border-white/5 animate-msgPop">
             <textarea value={manualConfig} onChange={(e) => setManualConfig(e.target.value)} placeholder='Paste Firebase JSON...' className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-[10px] font-mono text-slate-300 outline-none h-24 mb-2" />
             <div className="flex gap-2">
               <button onClick={() => saveManualConfig(manualConfig)} className="flex-1 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase py-2 rounded-lg">Apply</button>
               <button onClick={clearManualConfig} className="bg-white/5 text-slate-500 text-[10px] font-black uppercase py-2 px-4 rounded-lg">Reset</button>
             </div>
           </div>
        )}

        <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-3xl border border-white/5 shadow-inner">
          <div className="text-center relative">
            <p className="text-[10px] font-black text-red-500 tracking-widest">AFC</p>
            <p className="text-3xl font-orbitron font-black italic text-white">24</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-600 mb-1 italic uppercase">STAGE 2</p>
            <div className="px-3 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <p className="text-[9px] font-black text-emerald-500 animate-pulse tracking-[0.3em]">LIVE HUB</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-emerald-500 tracking-widest">NFC</p>
            <p className="text-3xl font-orbitron font-black italic text-white/50">21</p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-slate-500'}`}>
            <i className="fas fa-comment"></i> Chat
          </button>
          <button onClick={() => setActiveTab('trivia')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'trivia' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-slate-500'}`}>
            <i className="fas fa-question-circle"></i> Trivia
          </button>
          <button onClick={() => setActiveTab('ranks')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'ranks' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-slate-500'}`}>
            <i className="fas fa-trophy"></i> Ranks
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] custom-scrollbar">
        {activeTab === 'chat' && (
          <div className="p-4 space-y-4 pb-32">
            {messages.map((msg, i) => {
              const isMe = msg.senderId === user.id;
              const isCoach = msg.senderId === 'coach_ai';
              return (
                <div key={msg.id || i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} msg-animate`}>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1 px-1">
                    {msg.senderName} {isMe && '(YOU)'}
                  </span>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-xl ${isMe ? 'bg-emerald-500 text-slate-950 font-bold rounded-tr-none' : isCoach ? 'bg-slate-900 border border-emerald-500/40 text-emerald-50 rounded-tl-none italic' : 'bg-slate-900 text-slate-200 rounded-tl-none border border-white/5'}`}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            {isCoachThinking && <div className="text-[8px] font-black text-emerald-500/50 uppercase tracking-[0.4em] animate-pulse ml-2">Coach is analyzing...</div>}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'trivia' && (
          <div className="p-6 space-y-6 pb-24">
            <h2 className="text-xl font-orbitron font-black italic text-white flex items-center gap-3">
              <i className="fas fa-bolt text-yellow-400"></i> LIVE BLITZ
            </h2>
            {INITIAL_TRIVIA.map(q => (
              <div key={q.id} className={`p-6 rounded-3xl border transition-all ${answeredQuestions.has(q.id) ? 'bg-white/5 border-white/5 opacity-50' : 'bg-slate-900 border-white/10 shadow-2xl'}`}>
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/20">{q.points} PTS</span>
                  {answeredQuestions.has(q.id) && <i className="fas fa-check-circle text-emerald-500"></i>}
                </div>
                <p className="text-lg font-bold text-white mb-6 leading-tight">{q.text}</p>
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt, idx) => (
                    <button key={idx} disabled={answeredQuestions.has(q.id)} onClick={() => handleAnswer(q.id, idx, q.correctIndex, q.points)} className="w-full text-left px-5 py-4 rounded-2xl bg-black/40 border border-white/5 text-slate-300 hover:border-emerald-500 hover:bg-emerald-500/5 transition-all text-sm font-bold">
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
              <h2 className="text-2xl font-orbitron font-black italic text-white mb-2">CHAMPIONSHIP RANKS</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic">Top 20 Guests | Stage 2</p>
            </div>
            
            <div className="space-y-3">
              {leaderboard.length === 0 ? (
                <div className="text-center py-20 opacity-30">
                  <i className="fas fa-users text-4xl mb-4"></i>
                  <p className="font-black text-xs uppercase">Awaiting First Score...</p>
                </div>
              ) : leaderboard.map((score, i) => (
                <div key={score.userId} className={`flex items-center gap-4 p-5 rounded-3xl border transition-all ${score.userId === user.id ? 'bg-emerald-500 border-emerald-400 shadow-xl shadow-emerald-500/20' : 'bg-slate-900 border-white/5'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-orbitron font-black text-xl shadow-inner ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-slate-300 text-slate-600' : i === 2 ? 'bg-orange-400 text-orange-900' : 'bg-black/40 text-slate-500'}`}>
                    {i === 0 ? <i className="fas fa-trophy"></i> : i === 1 ? <i className="fas fa-medal"></i> : i === 2 ? <i className="fas fa-award"></i> : i + 1}
                  </div>
                  <div className="flex-1">
                    <p className={`font-black text-sm uppercase tracking-wider ${score.userId === user.id ? 'text-slate-950' : 'text-white'}`}>{score.userName}</p>
                    <p className={`text-[9px] font-bold uppercase opacity-60 ${score.userId === user.id ? 'text-slate-900' : 'text-slate-400'}`}>{score.team} CONFERENCE</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-orbitron font-black text-lg ${score.userId === user.id ? 'text-slate-950' : 'text-emerald-500'}`}>{score.points}</p>
                    <div className="flex gap-1 justify-end">
                      {Array.from({ length: score.trophies || 0 }).map((_, t) => (
                        <i key={t} className={`fas fa-ring text-[10px] ${score.userId === user.id ? 'text-slate-900' : 'text-yellow-500'}`}></i>
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
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Shout to stadium... (/coach)" className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-emerald-500 transition-all text-white font-medium text-sm" />
            <button type="submit" disabled={!inputText.trim()} className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 hover:bg-emerald-400 disabled:opacity-20 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
              <i className="fas fa-paper-plane"></i>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
