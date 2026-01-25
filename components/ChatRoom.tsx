import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, User } from '../types';
import TeamHelmet from './TeamHelmet';

interface ChatRoomProps {
  user: User;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  users: User[];
}

const COMMON_EMOJIS = ['🏈', '🔥', '🏆', '🙌', '👏', '😂', '👀', '💯', '🏟️', '🍺', '🍕', '🌭', '📣', '💎', '💸', '🚀'];

const ChatRoom: React.FC<ChatRoomProps> = ({ user, messages, onSendMessage, users }) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
      onSendMessage(inputText.trim());
      setInputText('');
      setShowEmojiPicker(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden relative">
      <div className="p-2 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <h3 className="font-orbitron text-[10px] flex items-center gap-2 text-white font-black uppercase tracking-[0.2em]">
          <i className="fas fa-satellite-dish text-blue-400"></i>
          Gridiron Live Sync
        </h3>
        <div className="flex -space-x-2">
          {users.slice(0, 5).map(u => (
            <div key={u.id} className="w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-800 overflow-hidden flex items-center justify-center">
               <TeamHelmet teamId={u.team} size="sm" />
            </div>
          ))}
          {users.length > 5 && (
            <div className="w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[7px] font-black text-white">
              +{users.length - 5}
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-700">
            <div className="w-16 h-16 bg-slate-900/50 rounded-full flex items-center justify-center mb-4 border border-slate-800 animate-wifi">
               <i className="fas fa-wifi text-2xl"></i>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Syncing Grid Records...</p>
          </div>
        )}
        {messages.map((msg, idx) => {
          const isMe = msg.userId === user.id;
          const isAI = msg.isAI;
          const showName = idx === 0 || messages[idx - 1].userId !== msg.userId;
          
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {showName && !isAI && (
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  {!isMe && <span className="text-[8px] font-black uppercase text-blue-500">{msg.userName}</span>}
                  {isMe && <span className="text-[8px] font-black uppercase text-slate-500">YOU</span>}
                </div>
              )}
              {isAI && (
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[8px] font-black uppercase text-yellow-500 flex items-center gap-1">
                    <i className="fas fa-robot"></i> PRO ANALYST
                  </span>
                </div>
              )}
              <div className={`flex items-end gap-2 max-w-[90%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`px-4 py-2.5 rounded-2xl text-sm border shadow-xl ${
                  isAI ? 'bg-indigo-900/20 border-indigo-500/50 text-indigo-100 italic rounded-tl-none font-medium' :
                  isMe ? 'bg-blue-600 border-blue-500 text-white rounded-tr-none' : 
                  'bg-slate-800 border-slate-700 text-slate-200 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
                {isMe && <i className="fas fa-check-double text-[8px] text-blue-400 mb-1 opacity-50" title="Delivered to Mesh"></i>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 bg-slate-900 border-t border-slate-800">
        {showEmojiPicker && (
          <div className="p-3 border-b border-slate-800 grid grid-cols-8 gap-2 bg-slate-900/90 backdrop-blur-md">
            {COMMON_EMOJIS.map(e => (
              <button key={e} onClick={() => setInputText(p => p + e)} className="text-lg p-2 hover:bg-white/10 rounded-xl transition-all active:scale-125">
                {e}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-3 flex gap-2 pb-safe items-center">
          <button type="button" onClick={() => setInputText(p => p + '🏈')} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 border border-slate-700 transition-colors">
            🏈
          </button>
          <input 
            type="text" 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)} 
            placeholder="Type message to the squad..." 
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 font-bold placeholder:text-slate-600" 
          />
          <button type="submit" disabled={!inputText.trim()} className="w-12 h-12 bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-600">
            <i className="fas fa-paper-plane"></i>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatRoom;