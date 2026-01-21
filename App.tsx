
import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types.ts';
import { INITIAL_PROP_BETS, AVATARS } from './constants.tsx';
import { getAICommentary, generatePropBets } from './services/geminiService.ts';
import BettingPanel from './components/BettingPanel.tsx';
import ChatRoom from './components/ChatRoom.tsx';
import Leaderboard from './components/Leaderboard.tsx';

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
    timeRemaining: "12:45",
    score: { home: 7, away: 3 },
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
        id: uuidv4(),
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
    if (newBetsData.length > 0) {
      const formattedBets: PropBet[] = newBetsData.map((b: any) => ({
        ...b,
        id: uuidv4(),
        resolved: false
      }));
      setPropBets(prev => [...prev, ...formattedBets]);
      
      const aiMsg: ChatMessage = {
        id: uuidv4(),
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
      id: uuidv4(),
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
       setCurrentUser(updatedUsers.find(u => u.id === currentUser.id) || null);
    }
    triggerAICommentary(`Bet resolved! Check the leaderboard to see who's crying.`);
  };

  const sendMessage = (text: string) => {
    if (!currentUser) return;
    const newMsg: ChatMessage = {
      id: uuidv4(),
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
      id: uuidv4(),
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
      <div className="min-h-screen flex items-center justify-center p-4 nfl-gradient">
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
              <div className="flex flex-wrap gap-3 justify-center">
                {AVATARS.map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setSelectedAvatar(a)}
                    className={`w-12 h-12 text-2xl flex items-center justify-center rounded-xl transition-all ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg' : 'bg-slate-800 hover:bg-slate-700'}`}
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
          
          <div className="mt-8 text-center">
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Starts at 0: +10 Win | -3 Loss</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col h-screen overflow-hidden">
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black font-orbitron"><span className="text-red-600">SBLIX</span> HUB</h1>
            <div className="hidden md:flex bg-slate-800 rounded-lg px-3 py-1 items-center gap-4 border border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Home</span>
                <span className="font-orbitron text-lg">{gameState.score.home}</span>
              </div>
              <div className="w-px h-4 bg-slate-600"></div>
              <div className="flex items-center gap-2">
                <span className="font-orbitron text-lg">{gameState.score.away}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Away</span>
              </div>
              <div className="ml-4 px-2 py-0.5 bg-red-600 rounded text-[10px] font-bold animate-pulse">
                Q{gameState.quarter} - {gameState.timeRemaining}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
             <button 
              onClick={handleCopyLink}
              className={`hidden xs:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              {copied ? <i className="fas fa-check"></i> : <i className="fas fa-share-nodes"></i>}
              {copied ? 'Copied' : 'Invite'}
            </button>

            <div className="text-right hidden sm:block">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Score</div>
              <div className={`text-lg font-orbitron flex items-center gap-1 ${currentUser.credits >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentUser.credits} pts
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
              <span className="text-xl">{currentUser.avatar}</span>
              <div className="hidden sm:block">
                <div className="text-sm font-bold truncate max-w-[80px]">{currentUser.username}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-slate-900 border-b border-slate-800">
        <div className="container mx-auto flex">
          <button 
            onClick={() => setActiveTab('bets')}
            className={`flex-1 py-4 text-xs font-orbitron font-bold tracking-widest uppercase transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'bets' ? 'border-red-600 text-white bg-red-600/5' : 'border-transparent text-slate-500'}`}
          >
            <i className="fas fa-ticket-alt"></i>
            <span className="hidden sm:inline">Prop Bets</span>
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-4 text-xs font-orbitron font-bold tracking-widest uppercase transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'border-blue-600 text-white bg-blue-600/5' : 'border-transparent text-slate-500'}`}
          >
            <i className="fas fa-comments"></i>
            <span className="hidden sm:inline">Party Chat</span>
          </button>
          <button 
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-4 text-xs font-orbitron font-bold tracking-widest uppercase transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'leaderboard' ? 'border-yellow-500 text-white bg-yellow-500/5' : 'border-transparent text-slate-500'}`}
          >
            <i className="fas fa-trophy"></i>
            <span className="hidden sm:inline">Standings</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 container mx-auto p-4 overflow-hidden relative">
        <div className="h-full">
           {activeTab === 'bets' && (
             <div className="h-full bg-slate-900/30 rounded-2xl border border-slate-800/50">
               <BettingPanel 
                  propBets={propBets} 
                  user={currentUser} 
                  onPlaceBet={placeBet}
                  allBets={userBets}
                  onGenerateBets={handleGenerateBets}
                  isGenerating={isGeneratingBets}
                  onResolveBet={resolveBet}
               />
             </div>
           )}

           {activeTab === 'chat' && (
             <div className="h-full">
               <ChatRoom 
                user={currentUser} 
                messages={messages} 
                onSendMessage={sendMessage} 
               />
             </div>
           )}

           {activeTab === 'leaderboard' && (
             <div className="h-full">
               <Leaderboard users={users} currentUser={currentUser} />
             </div>
           )}
        </div>
      </main>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default App;