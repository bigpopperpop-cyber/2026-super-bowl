import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, setDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp, getMissingKeys } from './services/firebaseService';
import { getCoachResponse } from './services/geminiService';
import { ChatMessage, User } from './types';

export default function App() {
  const [user, setUser] = useState<(User & { team?: string }) | null>(() => {
    const saved = localStorage.getItem('chat_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [activeTab, setActiveTab] = useState<'chat' | 'squares'>('chat');
  const [inputName, setInputName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('CHIEFS');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<'Live' | 'Syncing' | 'Solo'>(db ? 'Syncing' : 'Solo');
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const [squares, setSquares] = useState<Record<string, string>>({});
  const [showDiag, setShowDiag] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    if (!db) {
      setStatus('Solo');
      setMessages(JSON.parse(localStorage.getItem('local_chat_history') || '[]'));
      setSquares(JSON.parse(localStorage.getItem('local_squares') || '{}'));
      return;
    }

    let isMounted = true;
    const syncTimeout = setTimeout(() => {
      if (isMounted && status === 'Syncing') setStatus('Solo');
    }, 5000);

    // Chat Subscription
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
    }, (err) => {
      console.error("Firestore Chat Error:", err);
      setStatus('Solo');
    });

    // Squares Subscription
    const unsubscribeSquares = onSnapshot(collection(db, 'squares_lix'), (snapshot) => {
      if (!isMounted) return;
      const sqData: Record<string, string> = {};
      snapshot.docs.forEach(doc => { 
        const data = doc.data();
        sqData[data.id] = data.name; 
      });
      setSquares(sqData);
    });

    return () => {
      isMounted = false;
      unsubscribeChat();
      unsubscribeSquares();
      clearTimeout(syncTimeout);
    };
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      timestamp: status === 'Live' ? serverTimestamp() : new Date().toISOString()
    };

    if (status === 'Live' && db) {
      try {
        await addDoc(collection(db, 'party_hub'), newMsg);
      } catch (err) {
        console.error("Failed to send:", err);
        setStatus('Solo');
      }
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

  const claimSquare = async (idx: number) => {
    if (!user) return;
    const key = `sq_${idx}`;
    if (squares[key]) return;

    if (status === 'Live' && db) {
      try {
        await setDoc(doc(db, 'squares_lix', key), { id: key, name: user.name, team: user.team });
      } catch (err) {
        console.error("Square claim failed:", err);
      }
    } else {
      const newSquares = { ...squares, [key]: user.name };
      setSquares(newSquares);
      localStorage.setItem('local_squares', JSON.stringify(newSquares));
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 relative overflow-hidden">
        <div className="scanline"></div>
        <div className="w-full max-w-md p-8 glass rounded-[2.5rem] shadow-2xl relative z-10 border border-white/10 text-center">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
            <i className="fas fa-football-ball text-2xl text-emerald-400"></i>
          </div>
          <h1 className="font-orbitron text-4xl font-black italic text-white mb-2 tracking-tighter">SBLIX LIX</h1>
          <p className="text-emerald-500/60 text-[10px] mb-8 font-black uppercase tracking-[0.4em]">STADIUM PARTY HUB</p>
          
          <form onSubmit={handleJoin} className="space-y-6">
            <input 
              autoFocus
              value={inputName}
              onChange={(e) => setInputName(e.target.value.slice(0, 12).toUpperCase())}
              placeholder="ENTER NICKNAME"
              className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500 transition-all text-white font-black text-lg uppercase tracking-widest placeholder:text-slate-800 text-center"
            />

            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button"
                onClick={() => setSelectedTeam('CHIEFS')}
                className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'CHIEFS' ? 'border-red-600 bg-red-600/20 text-red-500' : 'border-white/5 bg-white/5 text-slate-500'}`}
              >
                CHIEFS
              </button>
              <button 
                type="button"
                onClick={() => setSelectedTeam('EAGLES')}
                className={`py-4 rounded-2xl border-2 transition-all font-black text-xs tracking-widest ${selectedTeam === 'EAGLES' ? 'border-emerald-600 bg-emerald-600/20 text-emerald-500' : 'border-white/5 bg-white/5 text-slate-500'}`}
              >
                EAGLES
              </button>
            </div>

            <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/30">
              JOIN STADIUM
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-slate-950 border-x border-white/5 relative shadow-2xl overflow-hidden">
      <header className="pt-6 pb-4 px-4 glass border-b border-white/10 z-50">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'Live' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{status} STADIUM</span>
          </div>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-slate-600 hover:text-white transition-colors">
            <i className="fas fa-sign-out-alt text-xs"></i>
          </button>
        </div>
        
        <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-3xl border border-white/5 shadow-inner">
          <div className="text-center">
            <p className="text-[10px] font-black text-red-500 tracking-widest">KC</p>
            <p className="text-3xl font-orbitron font-black italic">24</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-600 mb-1 italic">4TH QUARTER</p>
            <p className="text-[10px] font-black text-emerald-500 animate-pulse tracking-[0.3em]">LIVE</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-emerald-500 tracking-widest">PHI</p>
            <p className="text-3xl font-orbitron font-black italic">21</p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-emerald-500 text-slate-950' : 'bg-white/5 text-slate-500'}`}
          >
            <i className="fas fa-comment-dots text-xs"></i> Chat
          </button>
          <button 
            onClick={() => setActiveTab('squares')}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${activeTab === 'squares' ? 'bg-emerald-500 text-slate-950' : 'bg-white/5 text-slate-500'}`}
          >
            <i className="fas fa-th text-xs"></i> Squares
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
        {activeTab === 'chat' ? (
          <div className="p-4 space-y-4 pb-24">
            {status !== 'Live' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4">
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                    <i className="fas fa-wifi-slash mr-2"></i> STADIUM OFFLINE
                  </p>
                  <button onClick={() => setShowDiag(!showDiag)} className="text-[8px] font-bold text-red-400 underline uppercase tracking-widest">
                    {showDiag ? 'HIDE' : 'DIAGNOSTICS'}
                  </button>
                </div>
                {showDiag && (
                  <div className="mt-3 text-[9px] text-red-300/70 space-y-1 font-mono p-3 bg-black/40 rounded-xl">
                    <p className="font-bold text-red-500">MISSING BUILD KEYS:</p>
                    {getMissingKeys().map(k => <p key={k} className="flex items-center gap-2"><i className="fas fa-times text-red-500 text-[6px]"></i> {k}</p>)}
                    <p className="mt-3 text-slate-500 leading-relaxed italic">To chat with 20 guests, add these to your hosting provider's Environment Variables and re-deploy.</p>
                  </div>
                )}
              </div>
            )}
            
            {messages.map((msg, i) => {
              const isMe = msg.senderId === user.id;
              const isCoach = msg.senderId === 'coach_ai';
              const teamColor = (msg as any).senderTeam === 'CHIEFS' ? 'text-red-500' : 'text-emerald-500';
              
              return (
                <div key={msg.id || i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} msg-animate`}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className={`text-[9px] font-black uppercase tracking-wider ${isCoach ? 'text-emerald-400' : teamColor}`}>
                      {msg.senderName} {isMe && '(YOU)'}
                    </span>
                  </div>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-xl ${
                    isMe ? 'bg-emerald-500 text-slate-950 font-bold rounded-tr-none' : 
                    isCoach ? 'bg-slate-900 border border-emerald-500/40 text-emerald-50 rounded-tl-none italic' :
                    'bg-slate-900 text-slate-200 rounded-tl-none border border-white/5'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            {isCoachThinking && <div className="text-[8px] font-black text-emerald-500/50 uppercase tracking-[0.4em] animate-pulse ml-2 mt-2">Coach is calling a timeout...</div>}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="p-4 pb-24">
            <div className="bg-black/40 p-1 rounded-2xl border border-white/5 mb-6">
               <div className="grid grid-cols-10 gap-1 aspect-square bg-slate-950 p-1 rounded-xl">
                {Array.from({ length: 100 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => claimSquare(i)}
                    className={`aspect-square rounded-[2px] text-[6px] font-black flex items-center justify-center transition-all ${
                      squares[`sq_${i}`] 
                        ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                        : 'bg-slate-900 hover:bg-slate-800 text-transparent border border-white/5'
                    }`}
                  >
                    {squares[`sq_${i}`]?.slice(0, 2) || i}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-center px-6">
              <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">STADIUM SQUARES</h4>
              <p className="text-[9px] text-slate-600 uppercase tracking-[0.2em] leading-relaxed">Tap a square to stake your claim. All 20 guests will see your name instantly in LIVE mode.</p>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'chat' && (
        <div className="absolute bottom-0 w-full p-4 glass border-t border-white/10">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Shout to stadium... (use /coach)"
              className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-emerald-500 transition-all text-white font-medium text-sm placeholder:text-slate-700"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 hover:bg-emerald-400 disabled:opacity-20 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <i className="fas fa-bolt"></i>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
