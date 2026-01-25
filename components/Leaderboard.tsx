import React, { useMemo } from 'react';
import { User, PropBet, UserBet } from '../types';
import TeamHelmet from './TeamHelmet';

interface LeaderboardProps {
  users: User[];
  currentUser: User;
  propBets: PropBet[];
  userBets: UserBet[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ users, currentUser, propBets, userBets }) => {
  const rankedUsers = useMemo(() => {
    return users.map(u => {
      let score = 0;
      const myBets = userBets.filter(b => b.userId === u.id);
      myBets.forEach(bet => {
        const prop = propBets.find(p => p.id === bet.betId);
        if (prop?.resolved && prop.winner === bet.selection) {
          score += (prop.points || 10);
        }
      });
      return { ...u, score };
    }).sort((a, b) => b.score - a.score);
  }, [users, userBets, propBets]);

  return (
    <div className="h-full flex flex-col p-4 space-y-3 overflow-y-auto no-scrollbar pb-24">
      {rankedUsers.map((user, idx) => {
        const isMe = user.id === currentUser.id;
        const rank = idx + 1;

        return (
          <div 
            key={user.id}
            className={`p-4 rounded-2xl border flex items-center justify-between relative overflow-hidden transition-all ${
              isMe ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.05)]' : 'bg-slate-900 border-white/5'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-orbitron font-black text-xs ${
                rank === 1 ? 'bg-yellow-500 text-black' : 
                rank === 2 ? 'bg-slate-300 text-black' : 
                rank === 3 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {rank}
              </div>
              <TeamHelmet teamId={user.team} size="md" />
              <div>
                <h4 className="font-black text-sm flex items-center gap-2 uppercase tracking-tight">
                  {user.name}
                  {isMe && <span className="text-[7px] bg-emerald-500/20 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/30 font-black">YOU</span>}
                </h4>
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{user.team} SQUAD</span>
              </div>
            </div>
            
            <div className="text-right">
              <span className={`text-2xl font-orbitron font-black italic ${isMe ? 'text-emerald-400' : 'text-white'}`}>
                {user.score}
              </span>
              <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest">PTS</p>
            </div>
          </div>
        );
      })}

      {rankedUsers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <i className="fas fa-users text-4xl mb-4"></i>
          <p className="text-[10px] font-black uppercase tracking-widest">Waiting for players...</p>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;