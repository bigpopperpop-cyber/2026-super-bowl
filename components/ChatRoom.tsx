import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, User } from '../types';
import TeamHelmet from './TeamHelmet';

interface ChatRoomProps {
  messages: ChatMessage[];
  currentUser: User;
  onSendMessage: (text: string) => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ messages, currentUser, onSendMessage }) => {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] overflow-hidden">
      <div className="p-4 bg-slate-900/40 border-b border-white/5 flex justify-between items-center shrink-0">
        <h3 className="font-orbitron text-[10px] flex items-center gap-2 text-slate-400 font-black uppercase tracking-[0.2em]">
          <i className="fas fa-comment-dots text-emerald-500 text-[10px]"></i>
          Tactical Comms
        </h3>
        <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded">Real-time Encrypted</span>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
            <i className="fas fa-satellite text-4xl mb-4"></i>
            <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Transmission...</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId === currentUser.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={`max-w-[85%] flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className="shrink-0 pt-1">
                  <TeamHelmet teamId={msg.userTeam} size="sm" />
                </div>
                <div>
                  {!isMe && (
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">
                      {msg.userName} • {msg.userTeam}
                    </div>
                  )}
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    isMe 
                    ? 'bg-emerald-600 text-white rounded-tr-none font-medium' 
                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-white/5'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-slate-900/40 border-t border-white/5 pb-safe">
        <form onSubmit={handleSubmit} className="flex gap-2 relative">
          <input 
            type="text" 
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Broadcast message..."
            className="flex-1 bg-slate-950/50 border border-white/10 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-700"
          />
          <button 
            type="submit"
            disabled={!text.trim()}
            className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center active:scale-90 transition-all disabled:opacity-50 disabled:active:scale-100"
          >
            <i className="fas fa-paper-plane text-lg"></i>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatRoom;