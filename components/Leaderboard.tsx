
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
  const usersWithPoints = useMemo(() => {
    return users.map(user => {
      let credits = 0;
      const myBets = userBets.filter(b => b.userId === user.id);
      
      myBets.forEach(bet => {
        const prop = propBets.find(p => p.id === bet.betId);
        if (prop?.resolved) {
          if (prop.outcome === bet.selection) {
            credits += 10; 
          } else {
            credits -= 5;
          }
        }
      });

      return { ...user, credits };
    }).sort((a, b) => b.credits - a.credits);
  }, [users, userBets, propBets]);

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0 shadow-lg">
        <h3 className="font-orbitron text-xs flex items-center gap-2 text-white font-black uppercase tracking-widest">
          <i className="fas fa-trophy text-yellow-500"></i>
          Gridiron Standings
        </h3>
        <span className="text-[10px] text-slate-500 uppercase font-black px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800">
          {users.length} In Huddle
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 pb-24">
        {usersWithPoints.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
             <i className="fas fa-users text-4xl mb-4"></i>
             <p className="text-[10px] font-black uppercase tracking-widest">No Active Players</p>
          </div>
        )}
        {usersWithPoints.map((user, idx) => {
          const isWinner = idx === 0 && user.credits > 0;
          const isMe = user.id === currentUser.id;

          return (
            <div key={user.id} className={`flex flex-col p-4 rounded-2xl border transition-all duration-500 ${
                isWinner ? 'bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.1)]' : 
                isMe ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(37,99,235,0.1)]' : 
                'bg-slate-900/50 border-slate-800'
              }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-lg font-black text-xs ${
                    isWinner ? 'bg-yellow-500 text-black' : 
                    idx === 1 ? 'bg-slate-300 text-black' :
                    idx === 2 ? 'bg-amber-700 text-white' :
                    'bg-slate-800 text-slate-500'
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="relative">
                    <TeamHelmet teamId={user.avatar} size="lg" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-slate-950"></div>
                  </div>
                  <div>
                    <div className="text-sm font-black flex items-center gap-1.5 text-white">
                      {user.username}
                      {isMe && <span className="text-[7px] bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase font-black tracking-tighter">You</span>}
                    </div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">{user.realName}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-orbitron font-black leading-tight ${
                    user.credits > 0 ? 'text-green-400' : user.credits < 0 ? 'text-red-500' : 'text-slate-600'
                  }`}>
                    {user.credits > 0 ? `+${user.credits}` : user.credits}
                  </div>
                  <div className="text-[7px] text-slate-500 uppercase font-black tracking-widest">Score</div>
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
