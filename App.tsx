import React, { useState, useEffect, useRef } from 'react';
import { db, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from './services/firebaseService';
import { ChatMessage, User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('chat_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [inputName, setInputName] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'error'>(db ? 'online' : 'offline');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync messages from Firestore or local fallback
  useEffect(() => {
    if (!user) return;

    if (db) {
      try {
        const q = query(
          collection(db, 'party_messages'),
          orderBy('timestamp', 'asc'),
          limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ChatMessage[];
          setMessages(msgs);
          setConnectionStatus('online');
        }, (err) => {
          console.error("Sync error:", err);
          setConnectionStatus('error');
        });

        return () => unsubscribe();
      } catch (e) {
        setConnectionStatus('error');
      }
    } else {
      // Local fallback for simulation when Firebase project ID is missing
      const localMsgs = JSON.parse(localStorage.getItem('local_messages') || '[]');
      setMessages(localMsgs);
      setConnectionStatus('offline');
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const newUser = { id: Math.random().toString(36).substr(2, 9), name: inputName.trim() };
    setUser(newUser);
    localStorage.setItem('chat_user', JSON.stringify(newUser));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;

    const messageContent = inputText.trim();
    setInputText('');

    if (db && connectionStatus !== 'error') {
      try {
        await addDoc(collection(db, 'party_messages'), {
          senderId: user.id,
          senderName: user.name,
          text: messageContent,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("Send failed:", err);
        fallbackSend(messageContent);
      }
    } else {
      fallbackSend(messageContent);
    }
  };

  const fallbackSend = (text: string) => {
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      senderId: user!.id,
      senderName: user!.name,
      text,
      timestamp: new Date()
    };
    const updated = [...messages, newMsg];
    setMessages(updated);
    localStorage.setItem('local_messages', JSON.stringify(updated.slice(-50)));
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950">
        <div className="w-full max-w-md p-10 glass rounded-[2.5rem] shadow-2xl border-t border-white/10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>
          <div className="w-24 h-24 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 neon-border">
            <i className="fas fa-bolt text-4xl text-emerald-500"></i>
          </div>
          <h1 className="font-orbitron text-4xl font-black italic tracking-tighter mb-2">SBLIX HUB</h1>
          <p className="text-slate-400 text-sm mb-10 font-medium">Connect with friends for the big game.</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input 
              autoFocus
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="Your Party Handle"
              className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all text-white text-center font-bold placeholder:text-slate-600"
            />
            <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-[0.2em] py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98]">
              Join the Chat
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-2xl mx-auto border-x border-white/5 bg-slate-950 shadow-2xl relative">
      {/* Header */}
      <header className="px-6 py-5 border-b border-white/5 glass sticky top-0 z-20 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <i className="fas fa-comments text-emerald-500"></i>
          </div>
          <div>
            <h2 className="font-orbitron font-bold italic text-lg tracking-tight">GAME DAY</h2>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-emerald-500' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-orange-500'} animate-pulse-soft`}></span>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                {connectionStatus === 'online' ? 'Real-time Connected' : connectionStatus === 'error' ? 'Sync Error' : 'Local Only Mode'}
              </p>
            </div>
          </div>
        </div>
        <button 
          onClick={() => {
            localStorage.removeItem('chat_user');
            setUser(null);
          }}
          className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors"
        >
          <i className="fas fa-sign-out-alt"></i>
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar chat-height bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
        {messages.length === 0 && (
          <div className="text-center py-20 opacity-20">
            <i className="fas fa-ghost text-6xl mb-4"></i>
            <p className="font-bold uppercase tracking-widest text-xs">No messages yet...</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === user.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{msg.senderName}</span>
                {isMe && <i className="fas fa-check-double text-[8px] text-emerald-500"></i>}
              </div>
              <div 
                className={`max-w-[85%] px-5 py-3.5 rounded-3xl text-sm leading-relaxed shadow-lg ${
                  isMe 
                    ? 'bg-emerald-500 text-slate-950 font-semibold rounded-tr-none' 
                    : 'bg-slate-900 text-slate-100 rounded-tl-none border border-white/5'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 glass border-t border-white/5 relative z-20">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <div className="relative flex-1">
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Shout something..."
              className="w-full bg-slate-900 border border-white/5 rounded-2xl pl-6 pr-12 py-4 outline-none focus:border-emerald-500/50 transition-all text-white placeholder:text-slate-600 font-medium"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700">
              <i className="fas fa-microphone-slash"></i>
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