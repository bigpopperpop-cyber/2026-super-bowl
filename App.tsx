import React, { useState, useEffect } from 'react';
import { User, PropBet, UserBet, ChatMessage, GameState, BetStatus } from './types';
import { INITIAL_PROP_BETS, AVATARS } from './constants';
import { getAICommentary } from './services/geminiService';
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
  const [copied, setCopied] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    quarter: 1,
    timeRemaining: "15:00",
    score: { home: 0, away: 0 },
    possession: 'home'
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginRealName, setLoginRealName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);

  useEffect(() => {
    const savedUsers = localStorage.getItem('sb_users');
    const savedBets = localStorage.getItem('sb_bets');
    const savedMessages = localStorage.getItem('sb_messages');
    const savedProps = localStorage.getItem('sb_props');
    const savedState = localStorage.getItem('sb_gamestate');
    
    if (savedUsers) setUsers(JSON.parse(savedUsers));
    if (savedBets) setUserBets(JSON.parse(savedBets));
    if (savedMessages) setMessages(JSON.parse(savedMessages));
    if (savedProps) setPropBets(JSON.parse(savedProps));
    if (savedState) setGameState(JSON.parse(savedState));
  }, []);

  useEffect(() => {
    localStorage.setItem('sb_users', JSON.stringify(users));
    localStorage.setItem('sb_bets', JSON.stringify(userBets));
    localStorage.setItem('sb_messages', JSON.stringify(messages));
    localStorage.setItem('sb_props', JSON.stringify(propBets));
    localStorage.setItem('sb_gamestate', JSON.stringify(gameState));
  }, [users, userBets, messages, propBets, gameState]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginRealName.trim()) return;

    const existingUser = users.find(u => u.username.toLowerCase() === loginUsername.toLowerCase());
    if (existingUser) {
      setCurrentUser(existingUser);
    } else {
      const newUser: User = {
        id: crypto.randomUUID(),
        username: loginUsername.trim(),
        realName: loginRealName.trim(),
        avatar: selectedAvatar,
        credits: 0 
      };
      setUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
    }
  };

  const clearSession = () => {
    if (confirm("Clear all game data for this device?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const autoResolveAllPendingBets = () => {
    if (!confirm("The 3rd quarter has ended. Settle all pending props with simulated results?")) return;

    const newState: GameState = { ...gameState, quarter: 4, timeRemaining: "15:00" };
    setGameState(newState);

    const updatedProps = [...propBets];
    let updatedUserBets = [...userBets];
    let updatedUsers = [...users];

    updatedProps.forEach((bet) => {
      if (!bet.resolved) {
        const winningOption = bet.options[Math.floor(Math.random() * bet.options.length)];
        bet.resolved = true;
        bet.outcome = winningOption;

        updatedUserBets = updatedUserBets.map(ub => {
          if (ub.betId === bet.id && ub.status === BetStatus.PENDING) {
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
      }
    });

    setPropBets(updatedProps);
    setUserBets(updatedUserBets);
    setUsers(updatedUsers);
    if (currentUser) {
      const freshUser = updatedUsers.find(u => u.id === currentUser.id);
      if (freshUser) setCurrentUser(freshUser);
    }
    triggerAICommentary(`The 3rd Quarter is OVER! All pending props have been simulated.`);
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
    triggerAICommentary(`I just picked ${selection}! Let's go!`);
  };

  const resolveBet = (betId: string, winningOption: string) => {
    setPropBets(prev => prev.map(pb => pb.id === betId ? { ...pb, resolved: true, outcome: winningOption } : pb));
    const updatedUsers = [...users];
    const updatedUserBets = userBets.map(ub => {
      if (ub.betId === betId && ub.status === BetStatus.PENDING) {
        const isWin = ub.selection === winningOption;
        const points = isWin ? 10 : -3;
        const uIdx = updatedUsers.findIndex(u => u.id === updatedUsers[uIdx]?.id); // safer find
        const foundIdx = updatedUsers.findIndex(u => u.id === ub.userId);
        if (foundIdx !== -1) {
          updatedUsers[foundIdx] = { ...updatedUsers[foundIdx], credits: updatedUsers[foundIdx].credits + points };
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
    triggerAICommentary(`Bet result: ${winningOption}!`);
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
      <div className="fixed inset-0 flex items-center justify-center p-4 nfl-gradient overflow-y-auto">
        <div className="max-w-md w-full glass-card p-6 rounded-[2rem] shadow-2xl border-white/20 my-auto">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-xl rotate-3">
              <i className="fas fa-football-ball text-red-600 text-3xl"></i>
            </div>
            <h1 className="text-2xl font-black font-orbitron tracking-tighter">SBLIX <span className="text-red-500">MASCOTS</span></h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">Pick Mascot & Join The Board</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-3 rounded-2xl bg-black/40 custom-scrollbar border border-white/5">
              {AVATARS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setSelectedAvatar(a)}
                  className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl transition-all active:scale-90 ${selectedAvatar === a ? 'bg-red-600 scale-110 shadow-lg border-2 border-white' : 'bg-slate-800'}`}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Chat Handle</label>
                <input
                  type="text"
                  placeholder="e.g. TouchdownKing"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 font-bold text-center placeholder:text-slate-700 shadow-inner"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Real Name (1st + Last Initial)</label>
                <input
                  type="text"
                  placeholder="e.g. John D."
                  value={loginRealName}
                  onChange={(e) => setLoginRealName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 font-bold text-center placeholder:text-slate-700 shadow-inner"
                />
              </div>

              <button
                type="submit"
                disabled={!loginUsername.trim() || !loginRealName.trim()}
                className="w-full py-4 bg-white text-slate-950 rounded-xl font-black font-orbitron hover:bg-slate-200 transition-all shadow-xl active:scale-95 uppercase tracking-widest text-sm disabled:opacity-50"
              >
                JOIN THE PARTY
              </button>
              
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-2.5 bg-slate-800/50 text-slate-400 border border-slate-700 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {copied ? <><i className="fas fa-check text-green-400"></i> Copied!</> : <><i className="fas fa-link"></i> Copy Invite Link</>}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button onClick={clearSession} className="text-[9px] text-slate-600 uppercase font-black hover:text-slate-400">
              Reset Session Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
      <header className="bg-slate-900 border-b border-slate-800 p-3 shrink-0 z-40">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black font-orbitron text-red-600">SBLIX</h1>
            <div className="flex bg-slate-950 rounded-lg px-2 py-1 items-center gap-1.5 border border-slate-800 text-[10px]">
              <span className="font-orbitron font-bold text-slate-200">Q{gameState.quarter}</span>
              <span className="text-slate-500 font-bold">{gameState.score.home}-{gameState.score.away}</span>
              {gameState.quarter < 4 && (
                <button 
                  onClick={autoResolveAllPendingBets}
                  className="ml-1 bg-red-600/20 text-red-500 px-1.5 py-0.5 rounded-md font-black uppercase text-[8px] border border-red-500/20"
                >
                  End Q3
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`text-[11px] font-orbitron font-black px-2 py-1 rounded-md bg-slate-950 border border-slate-800 ${currentUser.credits >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {currentUser.credits} PTS
            </div>
            <div className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700 text-lg">
              {currentUser.avatar}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-0">
        <div className="h-full container mx-auto relative">
           {activeTab === 'bets' && (
             <BettingPanel 
                propBets={propBets} 
                user={currentUser} 
                onPlaceBet={placeBet}
                allBets={userBets}
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
             <Leaderboard users={users} currentUser={currentUser} propBets={propBets} userBets={userBets} />
           )}
        </div>
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 shrink-0 pb-safe">
        <div className="container mx-auto flex">
          {[
            { id: 'bets', icon: 'fa-ticket-alt', label: 'Props' },
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'leaderboard', icon: 'fa-trophy', label: 'Rank' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 py-3 text-[9px] font-black tracking-widest uppercase transition-all flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-red-500 bg-red-500/5' : 'text-slate-500'}`}
            >
              <i className={`fas ${tab.icon} text-lg mb-0.5 ${activeTab === tab.id ? 'text-red-500' : 'text-slate-600'}`}></i>
              {tab.label}
              {activeTab === tab.id && <div className="w-1 h-1 bg-red-500 rounded-full mt-0.5"></div>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default App;