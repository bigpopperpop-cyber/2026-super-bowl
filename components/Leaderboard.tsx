
import React, { useMemo } from 'react';
import { User, UserBet, PropBet, BetStatus } from '../types';
import TeamHelmet from './TeamHelmet';

interface LeaderboardProps {
  users: User[];
  currentUser: User;
  propBets: PropBet[];
  userBets: UserBet[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ users, currentUser, propBets, userBets }) => {
  const sortedUsers = useMemo(() => [...users].sort((a, b) => b.credits - a.credits), [users]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <h3 className="font-orbitron text-sm flex items-center gap-2">
          <i className="fas fa-trophy text-yellow-500"></i>
          Gridiron Rankings
        </h3>
        <span className="text-[10px] text-slate-500 uppercase font-black px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800">
          {users.length} Active
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 pb-24">
        {sortedUsers.map((user, idx) => {
          const isWinner = idx === 0 && user.credits > 0;
          return (
            <div key={user.id} className={`flex flex-col p-4 rounded-2xl border transition-all ${
                isWinner ? 'bg-yellow-500/10 border-yellow-500/50 shadow-xl' : user.id === currentUser.id ? 'bg-blue-600/10 border-blue-500/50' : 'glass-card border-slate-800'
              }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-lg font-black text-xs ${isWinner ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400'}`}>
                    {idx + 1}
                  </span>
                  <TeamHelmet teamId={user.avatar} size="lg" />
                  <div>
                    <div className="text-sm font-black flex items-center gap-1.5">
                      {user.username}
                      {user.id === currentUser.id && <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">You</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{user.realName}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-orbitron font-black leading-tight ${user.credits < 0 ? 'text-red-500' : 'text-green-400'}`}>
                    {user.credits}
                  </div>
                  <div className="text-[8px] text-slate-500 uppercase font-black">Points</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
