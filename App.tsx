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
  const [status, setStatus] = useState<'Live' | 'Party Link'>(db ? 'Live' : 'Party Link');
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    if (db) {
      try {
        const q = query(
          collection(db, 'party_hub'),
          orderBy('timestamp', 'asc'),
          limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ChatMessage[];
          setMessages(msgs);
          setStatus('Live');
        }, (err) => {
          console.error("Firestore sync error:", err);
          setStatus('Party Link');
        });

        return () => unsubscribe();
      } catch (e) {
        setStatus('Party Link');
      }
    } else {
      // Local recovery
      const saved = JSON.parse(localStorage.getItem('local_chat_history') || '[]');
      setMessages(saved);
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const newUser = { id: 'usr_' + Math.random().toString(36).substr(2, 5), name: inputName.trim() };
    setUser(newUser);
    localStorage.setItem('chat_user', JSON.stringify(newUser));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !user) return;

    setInputText('');
    const isCoach = text.toLowerCase().startsWith('/coach');

    const newMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      senderId: user.id,
      senderName: user.name,
      text: text,
      timestamp: new Date()
    };

    // If Firestore fails or isn't available, handle locally for the guest
    if (db && status === 'Live') {
      try {
        await addDoc(collection(db, 'party_hub'), {
          ...newMsg,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        setMessages(prev => [...prev, newMsg]);
      }
    } else {
      const updated = [...messages, newMsg].slice(-50);
      setMessages(updated);
      localStorage.setItem('local_chat_history', JSON.stringify(updated));
    }

    if (isCoach) {
      setIsCoachThinking(true);
      const response = await getCoachResponse(text.replace('/coach', ''));
      const coachMsg: ChatMessage = {
        id: 'coach_' + Date.now(),
        senderId: 'coach_ai',
        senderName: 'COACH SBLIX 🏈',
        text: response,
        timestamp: new Date()
      };
      
      if (db && status === 'Live') {
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
        <div className="w-full max-w-md p-10 glass rounded-[3rem] shadow-2xl relative z-10 border-t border-white/10 text-center">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 neon-border">
            <i className="fas fa-trophy text-3xl text-emerald-400"></i>
          </div>
          <h1 className="font-orbitron text-4xl font-black italic text-white mb-2">SBLIX</h1>
          <p className="text-slate-500 text-sm mb-10 font-bold uppercase tracking-widest">Party Connect</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input 
              autoFocus
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="ENTER YOUR HANDLE"
              className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500/50 transition-all text-white text-center font-bold"
            />
            <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/20">
              JOIN STADIUM
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-2xl mx-auto bg-slate-950 border-x border-white/5 relative shadow-2xl">
      <header className="px-6 py-5 glass sticky top-0 z-30 flex justify-between items-center border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <i className="fas fa-signal text-emerald-500 animate-pulse"></i>
          </div>
          <div>
            <h2 className="font-orbitron font-black italic text-lg tracking-tight text-white">SBLIX <span className="text-emerald-500">PRO</span></h2>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${status === 'Live' ? 'bg-emerald-500' : 'bg-orange-500'} animate-pulse`}></span>
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{status} CONNECTION</p>
            </div>
          </div>
        </div>
        <button 
          onClick={() => { localStorage.removeItem('chat_user'); setUser(null); }}
          className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-600 hover:text-red-400"
        >
          <i className="fas fa-times"></i>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar chat-height">
        <div className="text-center py-4 border-b border-white/5 mb-6">
          <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.3em]">Game Channel 01 / Kickoff Countdown</span>
        </div>

        {messages.map((msg) => {
          const isMe = msg.senderId === user.id;
          const isCoach = msg.senderId === 'coach_ai';
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in duration-300`}>
              <span className={`text-[9px] font-black uppercase tracking-tighter mb-1.5 px-2 ${isCoach ? 'text-emerald-400' : 'text-slate-500'}`}>
                {msg.senderName}
              </span>
              <div className={`max-w-[85%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-lg ${
                isMe ? 'bg-emerald-500 text-slate-950 font-bold rounded-tr-none' : 
                isCoach ? 'bg-slate-800 border border-emerald-500/30 text-emerald-50 rounded-tl-none italic font-medium' :
                'bg-slate-900 text-slate-200 rounded-tl-none border border-white/5'
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        {isCoachThinking && (
          <div className="flex items-center gap-2 text-emerald-500/40 text-[9px] font-black uppercase tracking-widest animate-pulse">
            <i className="fas fa-football-ball fa-spin"></i> Coach is adjusting the play...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-6 glass border-t border-white/5 sticky bottom-0 z-30">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Shout to the party... (type /coach for AI)"
            className="flex-1 bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500/50 transition-all text-white font-medium"
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 hover:bg-emerald-400 disabled:opacity-30 shadow-lg shadow-emerald-500/10 active:scale-95 transition-all"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </form>
      </div>
    </div>
  );
}