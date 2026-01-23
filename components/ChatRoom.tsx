
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

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden relative">
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <h3 className="font-orbitron text-xs flex items-center gap-2 text-white font-black uppercase tracking-widest">
          <i className="fas fa-comments text-blue-400"></i>
          Gridiron Chat
        </h3>
        <button onClick={() => setShowRoster(true)} className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 text-slate-300 font-black">
          {users.length} ONLINE
        </button>
      </div>

      <div className="bg-slate-900/40 border-b border-slate-800/50 py-2 px-3 flex gap-3 overflow-x-auto no-scrollbar shrink-0 items-center">
        {users.slice(0, 10).map(u => (
          <div key={u.id} className="relative shrink-0">
            <TeamHelmet teamId={u.avatar} size="sm" className={u.id === user.id ? 'ring-2 ring-blue-500 rounded-full' : ''} />
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border border-slate-900 rounded-full"></div>
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.userId === user.id ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-[9px] font-black uppercase text-slate-500">{msg.username}</span>
            </div>
            <div className="flex items-end gap-2 max-w-[85%]">
              {msg.userId !== user.id && <TeamHelmet teamId={users.find(u => u.id === msg.userId)?.avatar || 'ARI'} size="sm" />}
              <div className={`px-4 py-2.5 rounded-2xl text-sm border shadow-md ${
                msg.userId === user.id ? 'bg-blue-600 border-blue-500 text-white rounded-tr-none' : 'bg-slate-800 border-slate-700 text-slate-200 rounded-tl-none'
              }`}>
                {msg.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showEmojiPicker && (
        <div className="mx-3 mb-2 p-3 glass-card rounded-2xl border border-white/10 grid grid-cols-8 gap-2 z-10">
          {COMMON_EMOJIS.map(e => <button key={e} onClick={() => setInputText(p => p + e)} className="text-xl p-2 hover:bg-white/10 rounded-xl">{e}</button>)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2 pb-safe items-center">
        <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 border border-slate-700">
          <i className="far fa-smile text-lg"></i>
        </button>
        <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 font-bold" />
        <button type="submit" disabled={!inputText.trim()} className="w-12 h-12 bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50">
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>

      {showRoster && (
        <div className="absolute inset-0 z-50 bg-black/98 backdrop-blur-2xl p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black font-orbitron">ROSTER</h3>
            <button onClick={() => setShowRoster(false)} className="text-slate-500 p-3 bg-slate-900 rounded-full"><i className="fas fa-times"></i></button>
          </div>
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-slate-900/50">
                <TeamHelmet teamId={u.avatar} size="lg" />
                <div className="flex-1">
                  <div className="text-sm font-black">{u.username}</div>
                  <div className="text-[10px] text-slate-500 uppercase">{u.realName}</div>
                </div>
                <div className="text-right text-green-400 font-orbitron text-xs">{u.credits} PTS</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRoom;
