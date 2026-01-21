import React, { useMemo } from 'react';
import { User, UserBet, PropBet, BetStatus } from '../types';

interface LeaderboardProps {
  users: User[];
  currentUser: User;
  propBets: PropBet[];
  userBets: UserBet[];
}

interface Award {
  id: string;
  icon: string;
  label: string;
  description: string;
  type: 'good' | 'bad' | 'major';
}

const Leaderboard: React.FC<LeaderboardProps> = ({ users, currentUser, propBets, userBets }) => {
  const sortedUsers = useMemo(() => [...users].sort((a, b) => b.credits - a.credits), [users]);

  const userAwards = useMemo(() => {
    const awardsMap: Record<string, Award[]> = {};
    users.forEach(u => awardsMap[u.id] = []);

    if (users.length === 0) return awardsMap;

    // Helper to calculate category points
    const getCategoryPoints = (userId: string, category: string) => {
      return userBets
        .filter(ub => ub.userId === userId)
        .reduce((acc, ub) => {
          const bet = propBets.find(p => p.id === ub.betId);
          if (bet && bet.category === category) {
            if (ub.status === BetStatus.WON) return acc + 10;
            if (ub.status === BetStatus.LOST) return acc - 3;
          }
          return acc;
        }, 0);
    };

    // 1. Overall Major Winner
    if (sortedUsers[0] && sortedUsers[0].credits > 0) {
      awardsMap[sortedUsers[0].id].push({
        id: 'big-winner',
        icon: '🏆',
        label: 'MVP',
        description: 'Highest overall score!',
        type: 'major'
      });
    }

    // 2. Lowest Score (Wooden Spoon)
    const lowestScore = sortedUsers[sortedUsers.length - 1]?.credits;
    if (lowestScore !== undefined && users.length > 1) {
      sortedUsers.forEach(u => {
        if (u.credits === lowestScore) {
          awardsMap[u.id].push({
            id: 'wooden-spoon',
            icon: '🥄',
            label: 'Wooden Spoon',
            description: 'Lowest overall score. Yikes.',
            type: 'bad'
          });
        }
      });
    }

    // 3. Category Specifics
    const categories = ['Stats', 'Game', 'Player', 'Entertainment'];
    categories.forEach(cat => {
      const catPoints = users.map(u => ({ id: u.id, points: getCategoryPoints(u.id, cat) }));
      const maxVal = Math.max(...catPoints.map(p => p.points));
      const minVal = Math.min(...catPoints.map(p => p.points));

      // Award best in category
      if (maxVal > 0) {
        catPoints.filter(p => p.points === maxVal).forEach(p => {
          awardsMap[p.id].push({
            id: `best-${cat}`,
            icon: cat === 'Stats' ? '📊' : cat === 'Game' ? '🏈' : cat === 'Player' ? '🏃' : '🎬',
            label: `${cat} Specialist`,
            description: `Highest points in ${cat} category`,
            type: 'good'
          });
        });
      }

      // Award least in stats (as requested)
      if (cat === 'Stats' && minVal < 0) {
        catPoints.filter(p => p.points === minVal).forEach(p => {
          awardsMap[p.id].push({
            id: `least-${cat}`,
            icon: '📉',
            label: 'Stats Fumble',
            description: `Least points earned in Stats`,
            type: 'bad'
          });
        });
      }
    });

    return awardsMap;
  }, [users, userBets, propBets, sortedUsers]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <h3 className="font-orbitron text-sm flex items-center gap-2">
          <i className="fas fa-trophy text-yellow-500"></i>
          Party Rankings
        </h3>
        <span className="text-[10px] text-slate-500 uppercase font-black px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800">
          {users.length} Guests
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 pb-24">
        {sortedUsers.map((user, idx) => {
          const isNegative = user.credits < 0;
          const awards = userAwards[user.id] || [];
          const isWinner = idx === 0 && user.credits > 0;

          return (
            <div 
              key={user.id} 
              className={`flex flex-col p-4 rounded-2xl border transition-all ${
                isWinner 
                  ? 'bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.1)] ring-1 ring-yellow-500/20' 
                  : user.id === currentUser.id 
                    ? 'bg-blue-600/10 border-blue-500/50' 
                    : isNegative 
                      ? 'bg-red-900/5 border-red-900/20'
                      : 'glass-card border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className={`w-8 h-8 flex items-center justify-center rounded-lg font-black text-xs ${
                      isWinner ? 'bg-yellow-500 text-black shadow-lg' : 
                      isNegative ? 'bg-red-900 text-red-100' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {idx + 1}
                    </span>
                    {isWinner && (
                      <div className="absolute -top-3 -left-1 text-lg drop-shadow-md">👑</div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{user.avatar}</span>
                    <div>
                      <div className="text-sm font-black flex items-center gap-1.5 flex-wrap">
                        {user.username}
                        {user.id === currentUser.id && (
                          <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">You</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight leading-none mt-1">
                        {user.realName}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-lg font-orbitron font-black leading-tight ${isNegative ? 'text-red-500' : isWinner ? 'text-yellow-400' : 'text-green-400'}`}>
                    {user.credits}
                  </div>
                  <div className="text-[8px] text-slate-500 uppercase font-black tracking-tighter">Points</div>
                </div>
              </div>

              {awards.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-2">
                  {awards.map((award) => (
                    <div 
                      key={award.id}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all border ${
                        award.type === 'major' 
                          ? 'bg-yellow-500 text-black border-white/20' 
                          : award.type === 'good' 
                            ? 'bg-slate-800 text-green-400 border-green-500/20' 
                            : 'bg-slate-800 text-red-400 border-red-500/20'
                      }`}
                      title={award.description}
                    >
                      <span>{award.icon}</span>
                      <span>{award.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;