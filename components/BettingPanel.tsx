import React, { useState } from 'react';
import { PropBet, User, UserBet } from '../types';

interface BettingPanelProps {
  propBets: PropBet[];
  user: User;
  onPlaceBet: (betId: string, selection: string) => void;
  allBets: UserBet[];
}

const BettingPanel: React.FC<BettingPanelProps> = ({ propBets, user, onPlaceBet, allBets }) => {
  const [selectedBet, setSelectedBet] = useState<PropBet | null>(null);

  const getMyPick = (betId: string) => allBets.find(b => b.betId === betId && b.userId === user.id)?.selection;

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-y-auto no-scrollbar pb-24">
      {propBets.map(bet => {
        const myPick = getMyPick(bet.id);
        const isResolved = bet.resolved;

        return (
          <div 
            key={bet.id}
            onClick={() => !isResolved && !myPick && setSelectedBet(bet)}
            className={`p-5 rounded-2xl glass-card border transition-all relative overflow-hidden flex flex-col ${
              isResolved ? 'border-slate-800 opacity-60' : 
              myPick ? 'border-emerald-500/40 bg-emerald-500/5' : 
              'border-white/5 active:scale-[0.98]'
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <span className="text-[9px] font-black uppercase tracking-tighter bg-slate-800 px-2 py-0.5 rounded border border-white/5 text-slate-400">
                {bet.category}
              </span>
              <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {bet.points} PTS
              </span>
            </div>
            
            <h3 className={`text-lg font-bold leading-tight mb-4 ${myPick ? 'text-emerald-400' : 'text-white'}`}>
              {bet.question}
            </h3>

            {isResolved ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Winner:</span>
                <span className="text-xs font-black text-yellow-500 uppercase">{bet.winner}</span>
              </div>
            ) : myPick ? (
              <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                <i className="fas fa-check-circle"></i>
                Pick: {myPick}
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {bet.options.map(opt => (
                  <span key={opt} className="px-3 py-1 bg-slate-800/80 rounded-lg text-[10px] font-bold text-slate-400 border border-white/5">
                    {opt}
                  </span>
                ))}
              </div>
            )}

            {isResolved && myPick && (
              <div className="absolute top-2 right-2">
                {myPick === bet.winner ? (
                  <i className="fas fa-check-circle text-emerald-500"></i>
                ) : (
                  <i className="fas fa-times-circle text-red-500"></i>
                )}
              </div>
            )}
          </div>
        );
      })}

      {selectedBet && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-slate-900 rounded-t-[2rem] sm:rounded-3xl p-8 space-y-8 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-start">
              <h4 className="text-xl font-orbitron font-black italic uppercase">Lock In</h4>
              <button onClick={() => setSelectedBet(null)} className="text-slate-500 p-2"><i className="fas fa-times"></i></button>
            </div>
            
            <p className="text-2xl font-black leading-tight">{selectedBet.question}</p>
            
            <div className="grid grid-cols-1 gap-3">
              {selectedBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onPlaceBet(selectedBet.id, opt);
                    setSelectedBet(null);
                  }}
                  className="w-full py-5 px-6 rounded-2xl bg-slate-800 border border-white/5 text-left font-black text-lg hover:bg-emerald-600 hover:text-black transition-all active:scale-95"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BettingPanel;