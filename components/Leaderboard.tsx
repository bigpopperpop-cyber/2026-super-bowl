import React from 'react';
import { User } from '../types';

interface LeaderboardProps {
  users: User[];
  currentUser: User;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ users, currentUser }) => {
  const sortedUsers = [...users].sort((a, b) => b.credits - a.credits);

  return (
    <div className="glass-card rounded-2xl border border-slate-700 h-full overflow-hidden flex flex-col">
      <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
        <h3 className="font-orbitron text-sm flex items-center gap-2">
          <i className="fas fa-trophy text-yellow-500"></i>
          Party Leaderboard
        </h3>
        <span className="text-[10px] text-slate-500 uppercase font-bold px-2 py-0.5 rounded-full bg-slate-900">
          {users.length} Guests
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {sortedUsers.map((user, idx) => {
          const isNegative = user.credits < 0;
          return (
            <div 
              key={user.id} 
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                user.id === currentUser.id 
                  ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30' 
                  : isNegative 
                    ? 'bg-red-900/10 border-red-900/40'
                    : 'bg-slate-800/40 border-slate-700'
              } ${idx === 0 && !isNegative ? 'scale-[1.02] border-yellow-500/50 shadow-lg shadow-yellow-500/5' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-lg font-black text-xs ${
                    idx === 0 && !isNegative ? 'bg-yellow-500 text-black shadow-lg' : 
                    isNegative ? 'bg-red-900 text-red-200' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {idx + 1}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{user.avatar}</span>
                  <div>
                    <div className="text-sm font-bold truncate max-w-[150px]">
                      {user.username} {user.id === currentUser.id && <span className="text-[10px] text-blue-400 font-normal ml-1">(You)</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={`text-lg font-orbitron leading-tight ${isNegative ? 'text-red-500' : 'text-green-400'}`}>
                  {user.credits}
                </div>
                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Points</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;