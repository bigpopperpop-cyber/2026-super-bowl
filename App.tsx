import React, { useState, useEffect } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary, generatePropBets } from './services/geminiService';
import BettingPanel from './components/BettingPanel';
import ChatRoom from './components/ChatRoom';
import Leaderboard from './components/Leaderboard';

type TabType = 'bets' | 'chat' | 'leaderboard';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [propBets, setPropBets] = useState<PropBet[]>(INITIAL_PROP_BETS);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('bets');
  const [isGeneratingBets, setIsGeneratingBets] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1,
    timeRemaining: "15:00",
    score: { home: 0, away: 0 },
    possession: 'home'
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);

  useEffect(() => {
    const savedUsers = localStorage.getItem('sb_users');
    const savedBets = localStorage.getItem('sb_bets');
    const savedMessages = localStorage.getItem('sb_messages');
    const savedProps = localStorage.getItem('sb_props');
    
    if (savedUsers) setUsers(JSON.parse(savedUsers));
    if (savedBets) setUserBets(JSON.parse(savedBets));
    if (savedMessages) setMessages(JSON.parse(savedMessages));
    if (savedProps) setPropBets(JSON.parse(savedProps));
  }, []);

  useEffect(() => {
    localStorage.setItem('sb_users', JSON.stringify(users));
    localStorage.setItem('sb_bets', JSON.stringify(userBets));
    localStorage.setItem('sb_messages', JSON.stringify(messages));
    localStorage.setItem('sb_props', JSON.stringify(propBets));
  }, [users, userBets, messages, propBets]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) return;

    const existingUser = users.find(u => u.username.toLowerCase() === loginUsername.toLowerCase());
    if (existingUser) {
      setCurrentUser(existingUser);
    } else {
      const newUser: User = {
        id: crypto.randomUUID(),
        username: loginUsername.trim(),
        avatar: selectedAvatar,
        credits: 0 
      };
      setUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
    }
  };

  const handleGenerateBets = async () => {
    setIsGeneratingBets(true);
    const newBetsData = await generatePropBets();
    if (newBetsData && newBetsData.length > 0) {
      const formattedBets: PropBet[] = newBetsData.map((b: any) => ({
        ...b,
        id: crypto.randomUUID(),
        resolved: false
      }));
      setPropBets(prev => [...prev, ...formattedBets]);
      
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        userId: 'ai-bot',
        username: 'Gerry the Gambler',
        text: `The Prop Lab is cooking! Just dropped ${newBetsData.length} fresh lines. Don't go broke on these!`,
        timestamp: Date.now(),
        isAI: true
      };
      setMessages(prev => [...prev, aiMsg]);
    }
    setIsGeneratingBets(false);
  };

  const placeBet = (betId: string, amount: number, selection: string) => {
    if (!currentUser) return;
    
    const newBet: UserBet = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      betId,
      amount: 0,
      selection,
      status: BetStatus.PENDING,
      placedAt: Date.now()
    };

    setUserBets(prev => [...prev, newBet]);
    triggerAICommentary(`I just picked ${selection}! Let's see if I actually know football.`);
  };

  const resolveBet = (betId: string, winningOption: string) => {
    setPropBets(prev => prev.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome: winningOption } : pb));
    const updatedUsers = [...users];
    const updatedUserBets = userBets.map(ub => {
      if (ub.betId === betId && ub.status === BetStatus.PENDING) {
        const isWin = ub.selection === winningOption;
        const points = isWin ? 10 : -3;
        const uIdx = updatedUsers.findIndex(u => u.id === ub.userId);
        if (uIdx !== -1) {
          updatedUsers[uIdx] = { 
            ...updatedUsers[uIdx], 
            credits: updatedUsers[uIdx].credits + points 
          };
        }
        return { ...ub, status: isWin ? BetStatus.WON : BetStatus.LOST };
      }
      return ub;
    });
    setUsers(updatedUsers);
    setUserBets(updatedUserBets);
    if (currentUser) {
       const freshUser = updatedUsers.find(u => u.id === currentUser.id);
       if (freshUser) setCurrentUser(freshUser);
    }
    triggerAICommentary(`Bet resolved! Check the leaderboard to see who's crying.`);
  };

  const sendMessage = (text: string) => {
    if (!currentUser) return;
    const newMsg: ChatMessage = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      username: currentUser.username,
      text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newMsg]);
    if (Math.random() > 0.4) {
      setTimeout(() => triggerAICommentary(text), 1500);
    }
  };

  const triggerAICommentary = async (context: string) => {
    const sortedUsers = [...users].sort((a, b) => b.credits - a.credits);
    const commentary = await getAICommentary(messages, gameState, sortedUsers);
    const aiMsg: ChatMessage = {
      id: crypto.randomUUID(),
      userId: 'ai-bot',
      username: 'Gerry the Gambler',
      text: commentary,
      timestamp: Date.now(),
      isAI: true
    };
    setMessages(prev => [...prev, aiMsg]);
  };

  if (!currentUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 nfl-gradient">
        <div className="max-w-md w-full glass-card p-8 rounded-3xl shadow-2xl border-white/20">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-white rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-xl rotate-3">
              <i className="fas fa-football-ball text-red-600 text-4xl"></i>
            </div>
            <h1 className="text-3xl font-black font-orbitron tracking-tighter">SUPER BOWL <span className="text-red-500">LIX</span></h1>
            <p className="text-slate-300 font-semibold mt-2 uppercase tracking-widest text-xs">Prop Betting & Party Hub</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Pick an Avatar</label>
              <div className="flex flex-wrap gap-2 justify-center">
                {AVATARS.map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setSelectedAvatar(a)}
                    className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl transition-all ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg' : 'bg-slate-800 hover:bg-slate-700'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Guest Name</label>
              <input
                autoFocus
                type="text"
                placeholder="Ex: TouchdownTom"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 font-semibold"
              />
            </div>

            <div className="space-y-3">
              <button
                type="submit"
                className="w-full py-4 bg-white text-slate-900 rounded-xl font-black font-orbitron hover:bg-red-50 transition-all shadow-xl"
              >
                JOIN THE PARTY
              </button>
              
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-3 bg-slate-800/50 text-slate-300 border border-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                {copied ? <><i className="fas fa-check text-green-400"></i> Copied!</> : <><i className="fas fa-link"></i> Copy Invite Link</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      <header className="bg-slate-900 border-b border-slate-800 p-4 shrink-0 z-40">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black font-orbitron"><span className="text-red-600">SBLIX</span></h1>
            <div className="flex bg-slate-800 rounded-lg px-2 py-1 items-center gap-2 border border-slate-700 text-[11px]">
              <span className="font-orbitron font-bold">{gameState.score.home}-{gameState.score.away}</span>
              <div className="w-px h-3 bg-slate-600"></div>
              <span className="text-red-500 font-black uppercase animate-pulse">Q{gameState.quarter}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <button 
              onClick={handleCopyLink}
              className={`p-2 rounded-lg border transition-all ${copied ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
            >
              <i className={copied ? "fas fa-check" : "fas fa-share-nodes"}></i>
            </button>

            <div className="text-right hidden xs:block">
              <div className={`text-sm font-orbitron font-bold ${currentUser.credits >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentUser.credits}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
              <span className="text-lg">{currentUser.avatar}</span>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="container mx-auto flex">
          {[
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 py-3 text-[10px] font-orbitron font-bold tracking-widest uppercase transition-all border-b-2 flex flex-col items-center gap-1 ${activeTab === tab.id ? 'border-red-600 text-white bg-red-600/5' : 'border-transparent text-slate-500'}`}
            >
              <i className={`fas ${tab.icon} text-base`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 overflow-hidden p-3 pb-safe">
        <div className="h-full container mx-auto">
           {activeTab === 'bets' && (
             <BettingPanel 
                propBets={propBets} 
                user={currentUser} 
                onPlaceBet={placeBet}
                allBets={userBets}
                onGenerateBets={handleGenerateBets}
                isGenerating={isGeneratingBets}
                onResolveBet={resolveBet}
             />
           )}

           {activeTab === 'chat' && (
             <ChatRoom 
              user={currentUser} 
              messages={messages} 
              onSendMessage={sendMessage} 
             />
           )}

           {activeTab === 'leaderboard' && (
             <Leaderboard users={users} currentUser={currentUser} />
           )}
        </div>
      </main>
    </div>
  );
};

export default App;