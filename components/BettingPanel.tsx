import React, { useState } from 'react';
import { PropBet, User, UserBet } from '../types';

interface BettingPanelProps {
  propBets: PropBet[];
  user: User;
  onPlaceBet: (betId: string, selection: string) => void;
  onResolveProp: (propId: string, winner: string) => void;
  allBets: UserBet[];
}

const BettingPanel: React.FC<BettingPanelProps> = ({ propBets, user, onPlaceBet, onResolveProp, allBets }) => {
  const [selectedBet, setSelectedBet] = useState<PropBet | null>(null);
  const [resolvingBet, setResolvingBet] = useState<PropBet | null>(null);

  const getMyPick = (betId: string) => allBets.find(b => b.betId === betId && b.userId === user.id)?.selection;

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-y-auto no-scrollbar pb-24">
      {propBets.map(bet => {
        const myPick = getMyPick(bet.id);
        const isResolved = bet.resolved;

        return (
          <div 
            key={bet.id}
            className={`p-5 rounded-2xl glass-card border transition-all relative overflow-hidden flex flex-col ${
              isResolved ? 'border-slate-800 bg-slate-900/20' : 
              myPick ? 'border-emerald-500/40 bg-emerald-500/5' : 
              'border-white/5'
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <span className="text-[9px] font-black uppercase tracking-tighter bg-slate-800 px-2 py-0.5 rounded border border-white/5 text-slate-400">
                {bet.category}
              </span>
              <div className="flex items-center gap-2">
                 {!isResolved && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setResolvingBet(bet); }}
                    className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded transition-colors"
                  >
                    RESOLVE
                  </button>
                )}
                <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {bet.points} PTS
                </span>
              </div>
            </div>
            
            <h3 className={`text-lg font-bold leading-tight mb-4 ${myPick ? 'text-emerald-400' : 'text-white'}`}>
              {bet.question}
            </h3>

            {isResolved ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Winner:</span>
                  <span className="text-xs font-black text-yellow-500 uppercase">{bet.winner}</span>
                </div>
                {myPick && (
                   <div className="flex items-center gap-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase">You: {myPick}</span>
                    {myPick === bet.winner ? (
                      <i className="fas fa-check-circle text-emerald-500 text-xs"></i>
                    ) : (
                      <i className="fas fa-times-circle text-red-500 text-xs"></i>
                    )}
                  </div>
                )}
              </div>
            ) : myPick ? (
              <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                <i className="fas fa-lock text-[8px]"></i>
                Locked Pick: {myPick}
              </div>
            ) : (
              <button 
                onClick={() => setSelectedBet(bet)}
                className="w-full py-3 bg-white/10 hover:bg-emerald-500 hover:text-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-white/5"
              >
                Place Bet
              </button>
            )}
          </div>
        );
      })}

      {/* Placing Bet Modal */}
      {selectedBet && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-slate-900 rounded-t-[2rem] sm:rounded-3xl p-8 space-y-8 animate-in slide-in-from-bottom duration-300 border-t border-white/10 shadow-2xl">
            <div className="flex justify-between items-start">
              <h4 className="text-xl font-orbitron font-black italic uppercase text-white">Lock In Pick</h4>
              <button onClick={() => setSelectedBet(null)} className="text-slate-500 p-2"><i className="fas fa-times"></i></button>
            </div>
            
            <p className="text-2xl font-black leading-tight text-white">{selectedBet.question}</p>
            
            <div className="grid grid-cols-1 gap-3">
              {selectedBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onPlaceBet(selectedBet.id, opt);
                    setSelectedBet(null);
                  }}
                  className="w-full py-5 px-6 rounded-2xl bg-slate-800 border border-white/5 text-left font-black text-lg text-white hover:bg-emerald-600 hover:text-black transition-all active:scale-95"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Resolving Prop Modal */}
      {resolvingBet && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-slate-900 rounded-t-[2rem] sm:rounded-3xl p-8 space-y-8 animate-in slide-in-from-bottom duration-300 border-t border-yellow-500/20 shadow-2xl">
            <div className="flex justify-between items-start">
              <h4 className="text-xl font-orbitron font-black italic uppercase text-yellow-500">Official Result</h4>
              <button onClick={() => setResolvingBet(null)} className="text-slate-500 p-2"><i className="fas fa-times"></i></button>
            </div>
            
            <p className="text-xl font-black leading-tight text-white">What was the actual outcome for:<br/><span className="text-slate-400">"{resolvingBet.question}"</span></p>
            
            <div className="grid grid-cols-1 gap-3">
              {resolvingBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onResolveProp(resolvingBet.id, opt);
                    setResolvingBet(null);
                  }}
                  className="w-full py-5 px-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-left font-black text-lg text-yellow-500 hover:bg-yellow-500 hover:text-black transition-all active:scale-95"
                >
                  {opt} (Set Winner)
                </button>
              ))}
            </div>
            <p className="text-[10px] font-bold text-slate-500 text-center uppercase tracking-widest italic">Note: This settles the score for all guests instantly.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BettingPanel;