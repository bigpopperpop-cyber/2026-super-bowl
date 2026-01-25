import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from './services/firebaseService';
import { getCoachResponse } from './services/geminiService';
import { ChatMessage, User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('chat_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [inputName, setInputName] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectionMode, setConnectionMode] = useState<'Live' | 'Party Demo'>(db ? 'Live' : 'Party Demo');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync logic
  useEffect(() => {
    if (!user) return;

    if (db) {
      try {
        const q = query(
          collection(db, 'sblix_messages'),
          orderBy('timestamp', 'asc'),
          limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ChatMessage[];
          setMessages(msgs);
          setConnectionMode('Live');
        }, (err) => {
          console.warn("Firestore snapshot error, falling back to local simulation:", err);
          setConnectionMode('Party Demo');
        });

        return () => unsubscribe();
      } catch (e) {
        setConnectionMode('Party Demo');
      }
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const newUser = { id: 'u_' + Math.random().toString(36).substr(2, 5), name: inputName.trim() };
    setUser(newUser);
    localStorage.setItem('chat_user', JSON.stringify(newUser));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText || !user) return;

    setInputText('');
    const isCoachCommand = cleanText.toLowerCase().startsWith('/coach');

    // Optimistic local UI update if in Demo mode or for instant feedback
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      senderId: user.id,
      senderName: user.name,
      text: cleanText,
      timestamp: new Date()
    };

    if (connectionMode === 'Party Demo') {
      setMessages(prev => [...prev, userMsg].slice(-50));
    }

    // Try sending to Firebase
    if (db && connectionMode === 'Live') {
      try {
        await addDoc(collection(db, 'sblix_messages'), {
          senderId: user.id,
          senderName: user.name,
          text: cleanText,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("Firebase send failed:", err);
      }
    }

    // AI Coach Logic
    if (isCoachCommand) {
      setIsTyping(true);
      const coachMsg = await getCoachResponse(cleanText.replace('/coach', ''));
      const coachMsgObj: ChatMessage = {
        id: 'coach_' + Date.now(),
        senderId: 'coach_ai',
        senderName: 'COACH SBLIX 🏈',
        text: coachMsg || "Let's go team!",
        timestamp: new Date()
      };
      
      if (connectionMode === 'Party Demo') {
        setMessages(prev => [...prev, coachMsgObj].slice(-50));
      } else if (db) {
        await addDoc(collection(db, 'sblix_messages'), {
          ...coachMsgObj,
          timestamp: serverTimestamp()
        });
      }
      setIsTyping(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 relative overflow-hidden">
        <div className="scanline"></div>
        <div className="w-full max-w-md p-10 glass rounded-[3rem] shadow-2xl relative z-10 border-t border-white/10">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 neon-border">
            <i className="fas fa-football-ball text-3xl text-emerald-400"></i>
          </div>
          <h1 className="font-orbitron text-4xl font-black italic tracking-tighter text-white text-center mb-1">SBLIX</h1>
          <p className="text-emerald-500/60 font-orbitron text-[10px] uppercase tracking-[0.4em] text-center mb-10">Party Command Center</p>
          
          <form onSubmit={handleJoin} className="space-y-4">
            <input 
              autoFocus
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="YOUR HANDLE"
              className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500/50 transition-all text-white text-center font-black placeholder:text-slate-700"
            />
            <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-widest py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/20">
              Enter Stadium
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-2xl mx-auto bg-slate-950 border-x border-white/5 relative shadow-[0_0_100px_rgba(0,0,0,1)]">
      {/* HUD Header */}
      <header className="px-6 py-5 glass sticky top-0 z-30 flex justify-between items-center border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30">
              <i className="fas fa-satellite-dish text-emerald-500 animate-pulse"></i>
            </div>
          </div>
          <div>
            <h2 className="font-orbitron font-black italic text-lg tracking-tight text-white flex items-center gap-2">
              SBLIX <span className="text-emerald-500">LIVE</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${connectionMode === 'Live' ? 'bg-emerald-500' : 'bg-orange-500'} animate-pulse`}></span>
              <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">{connectionMode} LINK ACTIVE</p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
           <button 
            onClick={() => { localStorage.removeItem('chat_user'); setUser(null); }}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors"
          >
            <i className="fas fa-power-off text-sm"></i>
          </button>
        </div>
      </header>

      {/* Field / Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar chat-height">
        <div className="text-center mb-8">
          <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-emerald-500/20">
            Game Start: Pending Kickoff
          </span>
        </div>

        {messages.map((msg) => {
          const isMe = msg.senderId === user.id;
          const isCoach = msg.senderId === 'coach_ai';
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-all`}>
              <div className="flex items-center gap-2 mb-1.5 px-2">
                <span className={`text-[9px] font-black uppercase tracking-tighter ${isCoach ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {msg.senderName}
                </span>
              </div>
              <div 
                className={`max-w-[85%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${
                  isMe 
                    ? 'bg-emerald-500 text-slate-950 font-bold rounded-tr-none shadow-lg shadow-emerald-500/10' 
                    : isCoach 
                    ? 'bg-slate-800 border-2 border-emerald-500/40 text-emerald-50 rounded-tl-none font-medium italic'
                    : 'bg-slate-900 text-slate-200 rounded-tl-none border border-white/5'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        {isTyping && (
          <div className="flex items-center gap-2 text-emerald-500/50 text-[10px] font-black uppercase italic tracking-widest animate-pulse">
            <i className="fas fa-football-ball fa-spin"></i> Coach is calling a play...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Control Panel */}
      <div className="p-6 glass border-t border-white/10 sticky bottom-0 z-30">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <div className="relative flex-1">
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Send message... (try /coach)"
              className="w-full bg-slate-900/80 border border-white/5 rounded-2xl pl-6 pr-12 py-4 outline-none focus:border-emerald-500/50 transition-all text-white placeholder:text-slate-700 font-medium"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-800">
              <i className="fas fa-bolt"></i>
            </div>
          </div>
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 hover:bg-emerald-400 active:scale-90 transition-all disabled:opacity-30 shadow-lg shadow-emerald-500/20"
          >
            <i className="fas fa-paper-plane text-xl"></i>
          </button>
        </form>
      </div>
    </div>
  );
}