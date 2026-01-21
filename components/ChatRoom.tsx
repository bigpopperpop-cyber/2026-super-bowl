import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, User } from '../types';

interface ChatRoomProps {
  user: User;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  users: User[];
}

const ChatRoom: React.FC<ChatRoomProps> = ({ user, messages, onSendMessage, users }) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(messages.length);

  useEffect(() => {
    if (scrollRef.current && messages.length > prevMsgCount.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  return (
    <div className="flex flex-col h-full glass-card rounded-2xl border border-slate-700 overflow-hidden">
      <div className="p-3 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="font-orbitron text-sm flex items-center gap-2">
            <i className="fas fa-comments text-blue-400"></i>
            Party Chat
          </h3>
          <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded-full border border-slate-700 text-slate-400 font-black">
            {users.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[8px] text-slate-500 uppercase font-black">Multi-User Live</span>
           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
        </div>
      </div>

      {/* Participants Strip */}
      <div className="bg-slate-900/40 border-b border-slate-800/50 py-2.5 px-3 flex gap-3 overflow-x-auto no-scrollbar shrink-0">
        {users.map(u => (
          <div key={u.id} className="flex flex-col items-center gap-1 shrink-0 relative">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-slate-800 border transition-all ${u.id === user.id ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'border-slate-700'}`}>
              {u.avatar}
              {u.id === user.id && (
                <div className="absolute -top-1 -right-1 bg-blue-600 text-[6px] font-black text-white px-1 rounded-sm border border-slate-900 uppercase">You</div>
              )}
            </div>
            <span className="text-[8px] font-black uppercase text-slate-500 tracking-tighter truncate w-10 text-center">{u.username}</span>
          </div>
        ))}
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8">
            <i className="fas fa-ghost text-4xl mb-3"></i>
            <p className="text-xs font-black uppercase tracking-widest leading-tight">Room is empty.<br/>Send a message to start the sync!</p>
          </div>
        )}
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.userId === user.id ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div className="flex items-center gap-2 mb-1">
              {msg.isAI && <span className="text-[9px] bg-yellow-500 text-black font-black px-1 rounded">BOT</span>}
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">{msg.username}</span>
            </div>
            <div className={`px-4 py-2.5 rounded-2xl text-sm max-w-[85%] shadow-lg border ${
              msg.isAI 
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-100' 
                : msg.userId === user.id 
                  ? 'bg-blue-600 border-blue-500 text-white rounded-tr-none' 
                  : 'bg-slate-800 border-slate-700 text-slate-200 rounded-tl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700 bg-slate-900/50 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type something..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500 placeholder:text-slate-600 font-bold"
        />
        <button 
          type="submit"
          className="w-11 h-11 flex items-center justify-center bg-blue-600 rounded-xl hover:bg-blue-500 active:scale-90 transition-all shadow-lg"
        >
          <i className="fas fa-paper-plane text-white"></i>
        </button>
      </form>
    </div>
  );
};

export default ChatRoom;