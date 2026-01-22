import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, User } from '../types';

interface ChatRoomProps {
  user: User;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  users: User[];
}

const COMMON_EMOJIS = [
  '🏈', '🔥', '🏆', '🙌', '👏', '😂', '👀', '💯', 
  '🏟️', '🍺', '🍕', '🌭', '📣', '💎', '💸', '🚀',
  '😎', '🤔', '😤', '😱', '👎', '👍', '🚩', '🎯'
];

const ChatRoom: React.FC<ChatRoomProps> = ({ user, messages, onSendMessage, users }) => {
  const [inputText, setInputText] = useState('');
  const [showRoster, setShowRoster] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
      setShowEmojiPicker(false);
    }
  };

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden relative">
      {/* Top Header */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-orbitron text-xs flex items-center gap-2 text-white font-black uppercase tracking-widest">
            <i className="fas fa-comments text-blue-400"></i>
            Party Chat
          </h3>
          <button 
            onClick={() => setShowRoster(true)}
            className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-700 text-slate-300 font-black flex items-center gap-1 transition-colors"
          >
            <i className="fas fa-users text-[8px]"></i>
            {users.length} ONLINE
          </button>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Live Sync</span>
           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
        </div>
      </div>

      {/* Mini Participants Bar */}
      <div className="bg-slate-900/40 border-b border-slate-800/50 py-2 px-3 flex gap-3 overflow-x-auto no-scrollbar shrink-0 items-center">
        {users.slice(0, 10).map(u => (
          <div key={u.id} className="relative shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg bg-slate-800 border-2 ${u.id === user.id ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'border-slate-700'}`}>
              {u.avatar}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-slate-900 rounded-full"></div>
          </div>
        ))}
        {users.length > 10 && (
          <button 
            onClick={() => setShowRoster(true)}
            className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-400 shrink-0"
          >
            +{users.length - 10}
          </button>
        )}
        <div className="ml-auto">
          <button onClick={() => setShowRoster(true)} className="text-[10px] font-black uppercase text-blue-500 hover:text-blue-400 transition-colors">See Roster</button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8">
            <i className="fas fa-football-ball text-4xl mb-3 animate-bounce"></i>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Game is starting...<br/>Get the chatter going!</p>
          </div>
        )}
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.userId === user.id ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div className="flex items-center gap-2 mb-1 px-1">
              {msg.isAI && <span className="text-[8px] bg-yellow-500 text-black font-black px-1 rounded uppercase tracking-tighter">AI COMMENTATOR</span>}
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">
                {msg.username} {msg.userId === 'host-user-id' && '👑'}
              </span>
            </div>
            <div className={`px-4 py-2.5 rounded-2xl text-sm max-w-[85%] shadow-md border ${
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

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="mx-3 mb-2 p-3 glass-card rounded-2xl border border-white/10 grid grid-cols-8 gap-2 animate-in slide-in-from-bottom-4 fade-in duration-200 shadow-2xl z-10">
          {COMMON_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="text-xl hover:bg-white/10 p-2 rounded-xl transition-colors active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2 pb-safe items-center">
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border border-slate-700 transition-all ${showEmojiPicker ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 text-slate-400'}`}
        >
          <i className="far fa-smile text-lg"></i>
        </button>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onFocus={() => setShowEmojiPicker(false)}
          placeholder="Trash talk here..."
          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 placeholder:text-slate-700 font-bold"
        />
        <button 
          type="submit"
          disabled={!inputText.trim()}
          className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all shadow-lg ${inputText.trim() ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>

      {/* Roster Overlay Modal */}
      {showRoster && (
        <div className="absolute inset-0 z-50 bg-black/98 backdrop-blur-2xl animate-in fade-in slide-in-from-right duration-300 flex flex-col">
          <div className="p-6 flex justify-between items-center border-b border-white/10 shrink-0">
            <div>
              <h3 className="text-xl font-black font-orbitron text-white tracking-tighter">GUEST ROSTER</h3>
              <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">Super Bowl LIX Party</p>
            </div>
            <button onClick={() => setShowRoster(false)} className="text-slate-500 hover:text-white p-3 bg-slate-900 rounded-full transition-colors">
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            <div className="px-2 text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">
              {users.length} SIGNED IN USERS
            </div>
            {users.sort((a,b) => b.credits - a.credits).map((u, i) => (
              <div key={u.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${u.id === user.id ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-2xl border border-slate-700 shrink-0 shadow-inner">
                  {u.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-white truncate">{u.username}</span>
                    {u.id === 'host-user-id' && <span className="bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase tracking-tighter flex items-center gap-1"><i className="fas fa-crown"></i> HOST</span>}
                    {u.id === user.id && <span className="bg-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase tracking-tighter">YOU</span>}
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight truncate">{u.realName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-black text-green-400 font-orbitron">{u.credits} PTS</div>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    <span className="text-[8px] font-black text-slate-600 uppercase">Live</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 border-t border-white/5">
            <button 
              onClick={() => setShowRoster(false)}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-colors"
            >
              Back to Chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRoom;