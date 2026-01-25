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
  const [status, setStatus] = useState<'Live' | 'Syncing' | 'Party Mode'>(db ? 'Syncing' : 'Party Mode');
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Connection Handler
  useEffect(() => {
    if (!user) return;

    // Fast-fail if no DB
    if (!db) {
      setStatus('Party Mode');
      const saved = JSON.parse(localStorage.getItem('local_chat_history') || '[]');
      setMessages(saved);
      return;
    }

    let isMounted = true;
    const syncTimeout = setTimeout(() => {
      if (isMounted && status === 'Syncing') {
        console.warn("Syncing timed out. Switching to Party Mode.");
        setStatus('Party Mode');
      }
    }, 4000);

    try {
      const q = query(
        collection(db, 'party_hub'),
        orderBy('timestamp', 'asc'),
        limit(60)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
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
        if (!isMounted) return;
        console.error("Firestore error:", err);
        setStatus('Party Mode');
      });

      return () => {
        isMounted = false;
        unsubscribe();
        clearTimeout(syncTimeout);
      };
    } catch (e) {
      setStatus('Party Mode');
    }
  }, [user]); // Only run once when user logs in

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const newUser = { id: 'usr_' + Math.random().toString(36).substr(2, 5), name: inputName.trim().toUpperCase() };
    setUser(newUser);
    localStorage.setItem('chat_user', JSON.stringify(newUser));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !user) return;

    setInputText('');
    const isCoachCmd = text.toLowerCase().startsWith('/coach');

    const newMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      senderId: user.id,
      senderName: user.name,
      text: text,
      timestamp: new Date()
    };

    if (status === 'Live' && db) {
      try {
        await addDoc(collection(db, 'party_hub'), {
          ...newMsg,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        setMessages(prev => [...prev, newMsg]);
      }
    } else {
      const updated = [...messages, newMsg].slice(-100);
      setMessages(updated);
      localStorage.setItem('local_chat_history', JSON.stringify(updated));
    }

    if (isCoachCmd) {
      setIsCoachThinking(true);
      const prompt = text.replace('/coach', '').trim() || "What's the current game vibe?";
      const response = await getCoachResponse(prompt);
      const coachMsg: ChatMessage = {
        id: 'coach_' + Date.now(),
        senderId: 'coach_ai',
        senderName: 'COACH SBLIX 🏈',
        text: response,
        timestamp: new Date()
      };
      
      if (status === 'Live' && db) {
        await addDoc(collection(db, 'party_hub'), {
          ...coachMsg,
          timestamp: serverTimestamp()
        });
      } else {
        setMessages(prev => [...prev, coachMsg]);
      }
      setIsCoachThinking(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 relative overflow-hidden">
        <div className="scanline"></div>
        <div className="w-full max-w-md p-10 glass rounded-[2.5rem] shadow-2xl relative z-10 border border-white/10 text-center">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-emerald-500/30">
            <i className="fas fa-football-ball text-3xl text-emerald-400"></i>
          </div>
          <h1 className="font-orbitron text-5xl font-black italic text-white mb-2 tracking-tighter">SBLIX</h1>
          <p className="text-emerald-500/60 text-[10px] mb-10 font-black uppercase tracking-[0.4em]">Gridiron Connect</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input 
              autoFocus
              value={inputName}
              onChange={(e) => setInputName(e.target.value.slice(0, 12))}
              placeholder="YOUR HANDLE"
              className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-5 outline-none focus:border-emerald-500 transition-all text-white text-center font-black text-xl uppercase tracking-widest placeholder:text-slate-700"
            />
            <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98]">
              ENTER STADIUM
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-slate-950 border-x border-white/5 relative shadow-2xl overflow-hidden">
      <header className="px-5 py-4 glass sticky top-0 z-30 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <i className={`fas ${status === 'Syncing' ? 'fa-spinner fa-spin' : 'fa-bolt'} text-emerald-500 text-sm`}></i>
          </div>
          <div>
            <h2 className="font-orbitron font-black italic text-base tracking-tight text-white leading-none">SBLIX <span className="text-emerald-500">HUB</span></h2>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${status === 'Live' ? 'bg-emerald-500' : status === 'Syncing' ? 'bg-amber-500' : 'bg-red-500'} animate-pulse`}></span>
              <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">{status}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => { localStorage.removeItem('chat_user'); setUser(null); }}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors"
          >
            <i className="fas fa-sign-out-alt text-xs"></i>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.03),transparent_40%)]">
        {messages.map((msg) => {
          const isMe = msg.senderId === user.id;
          const isCoach = msg.senderId === 'coach_ai';
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} msg-animate`}>
              <div className="flex items-center gap-2 mb-1 px-1">
                 <span className={`text-[8px] font-black uppercase tracking-wider ${isCoach ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {msg.senderName}
                </span>
              </div>
              <div className={`max-w-[88%] px-4 py-3 rounded-2xl text-sm leading-snug shadow-sm ${
                isMe ? 'bg-emerald-500 text-slate-950 font-bold rounded-tr-none' : 
                isCoach ? 'bg-slate-900 border border-emerald-500/40 text-emerald-50 rounded-tl-none italic font-medium' :
                'bg-slate-900 text-slate-200 rounded-tl-none border border-white/5'
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        {isCoachThinking && (
          <div className="flex items-center gap-2 text-emerald-500/60 text-[8px] font-black uppercase tracking-widest animate-pulse px-1">
            <i className="fas fa-football-ball fa-spin"></i> Coach is calling a play...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 glass border-t border-white/10 pb-8">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Shout to stadium... (use /coach)"
            className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-emerald-500/50 transition-all text-white font-medium text-sm placeholder:text-slate-700"
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 hover:bg-emerald-400 disabled:opacity-20 shadow-lg shadow-emerald-500/10 active:scale-90 transition-all"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </form>
      </div>
    </div>
  );
}