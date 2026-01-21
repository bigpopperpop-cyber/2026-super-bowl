
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, User } from '../types.ts';

interface ChatRoomProps {
  user: User;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ user, messages, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
        <h3 className="font-orbitron text-sm flex items-center gap-2">
          <i className="fas fa-comments text-blue-400"></i>
          Party Chat
        </h3>
        <span className="text-[10px] text-slate-500 uppercase font-bold px-2 py-0.5 rounded-full bg-slate-900">Live</span>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.userId === user.id ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {msg.isAI && <span className="text-[9px] bg-yellow-500 text-black font-black px-1 rounded">BOT</span>}
              <span className="text-xs font-bold text-slate-400">{msg.username}</span>
            </div>
            <div className={`px-3 py-2 rounded-2xl text-sm max-w-[85%] ${
              msg.isAI 
                ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-100' 
                : msg.userId === user.id 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-slate-700 text-white rounded-tl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Talk trash here..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
        <button 
          type="submit"
          className="w-10 h-10 flex items-center justify-center bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
};

export default ChatRoom;