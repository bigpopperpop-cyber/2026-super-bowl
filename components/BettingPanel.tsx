import React, { useState, useMemo } from 'react';
import { PropBet, User, UserBet, BetStatus } from '../types';

interface BettingPanelProps {
  propBets: PropBet[];
  user: User;
  onPlaceBet: (betId: string, amount: number, selection: string) => void;
  allBets: UserBet[];
  onResolveBet?: (betId: string, winningOption: string) => void;
}

type CategoryFilter = 'All' | 'Game' | 'Player' | 'Entertainment' | 'Stats';

const BettingPanel: React.FC<BettingPanelProps> = ({ 
  propBets, 
  user, 
  onPlaceBet, 
  allBets,
  onResolveBet
}) => {
  const [selectedBet, setSelectedBet] = useState<PropBet | null>(null);
  const [selection, setSelection] = useState<string>('');
  const [resolvingBet, setResolvingBet] = useState<PropBet | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');

  const categories: CategoryFilter[] = ['All', 'Game', 'Player', 'Entertainment', 'Stats'];

  const filteredBets = useMemo(() => {
    let bets = [...propBets]; // No longer reversing as it's a fixed list
    if (categoryFilter !== 'All') {
      bets = bets.filter(b => b.category === categoryFilter);
    }
    return bets;
  }, [propBets, categoryFilter]);

  const handleBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBet && selection) {
      onPlaceBet(selectedBet.id, 0, selection);
      setSelectedBet(null);
      setSelection('');
    }
  };

  const getMyBetOn = (betId: string) => allBets.find(b => b.betId === betId && b.userId === user.id);

  const getBetStats = (betId: string) => {
    const betsOnThis = allBets.filter(b => b.betId === betId);
    if (betsOnThis.length === 0) return null;

    const totalCount = betsOnThis.length;
    const counts: Record<string, number> = {};
    betsOnThis.forEach(b => counts[b.selection] = (counts[b.selection] || 0) + 1);
    const popularPick = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    return { popularPick: popularPick[0], count: totalCount };
  };

  return (
    <div className="p-4 flex flex-col h-full overflow-hidden">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-orbitron flex items-center gap-2 text-white">
              <i className="fas fa-ticket-alt text-yellow-400"></i>
              Party Prop Pool
            </h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">
              Correct: +10 Points | Wrong: -3 Points
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter transition-all whitespace-nowrap border ${
                categoryFilter === cat 
                  ? 'bg-white text-slate-900 border-white shadow-lg' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {filteredBets.map((bet) => {
          const myBet = getMyBetOn(bet.id);
          const stats = getBetStats(bet.id);

          return (
            <div 
              key={bet.id} 
              className={`p-5 rounded-2xl glass-card transition-all border relative overflow-hidden flex flex-col group ${
                bet.resolved 
                  ? 'border-slate-800 opacity-60' 
                  : myBet 
                    ? 'border-blue-500/50 bg-blue-500/5 shadow-inner shadow-blue-500/10' 
                    : 'border-slate-700 hover:border-blue-500/50 cursor-pointer'
              }`}
              onClick={() => !myBet && !bet.resolved && setSelectedBet(bet)}
            >
              <div className="flex justify-between items-start mb-3">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${bet.resolved ? 'bg-slate-800 text-slate-500' : 'bg-slate-800 text-slate-400'}`}>
                  {bet.category}
                </span>
                {bet.resolved && (
                   <span className="text-[9px] font-black text-green-500 bg-green-500/10 border border-green-500/30 px-2 rounded-full uppercase">Settled</span>
                )}
              </div>
              
              <p className="font-bold text-base mb-4 text-white leading-tight">{bet.question}</p>
              
              <div className="flex-1">
                {bet.resolved ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-400 uppercase font-black">Winner: <span className="text-yellow-400 ml-1">{bet.outcome}</span></div>
                    {myBet && (
                       <div className={`text-[10px] font-black py-1 px-3 rounded-lg inline-block ${myBet.status === BetStatus.WON ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                         {myBet.status === BetStatus.WON ? 'WIN (+10)' : 'LOSS (-3)'}
                       </div>
                    )}
                  </div>
                ) : myBet ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 mt-2 bg-blue-500/10 p-3 rounded-xl border border-blue-500/20">
                    <i className="fas fa-check-circle"></i>
                    Your Pick: {myBet.selection}
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {bet.options.map(opt => (
                      <span key={opt} className="px-3 py-1.5 bg-slate-800/80 text-[10px] rounded-lg border border-slate-700 font-bold text-slate-300">
                        {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!bet.resolved && (
                <div className="mt-5 pt-4 border-t border-slate-800/50 flex justify-between items-center text-[9px] uppercase font-black tracking-widest">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-600">Total Bets</span>
                    <span className="text-white font-orbitron">{stats?.count || 0}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <span className="text-slate-600">Top Pick</span>
                    <span className="text-yellow-500 truncate max-w-[100px]">{stats?.popularPick || 'TBD'}</span>
                  </div>
                </div>
              )}

              {!bet.resolved && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setResolvingBet(bet);
                  }}
                  className="mt-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-red-500 transition-colors flex items-center justify-center gap-2 border border-slate-800 rounded-lg hover:border-red-500/30"
                >
                  <i className="fas fa-gavel"></i>
                  Settle Result
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedBet && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-start mb-6">
               <div>
                <h3 className="text-xl font-orbitron text-white">Make Your Choice</h3>
                <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest">{selectedBet.category} Prop</span>
               </div>
               <button onClick={() => setSelectedBet(null)} className="text-slate-500 hover:text-white p-2"><i className="fas fa-times text-xl"></i></button>
            </div>
            <p className="text-white mb-8 font-bold leading-tight text-xl">{selectedBet.question}</p>
            
            <form onSubmit={handleBetSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-3">
                {selectedBet.options.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelection(opt)}
                    className={`py-4 px-5 rounded-2xl text-sm font-black border transition-all text-left flex justify-between items-center ${
                      selection === opt 
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30 ring-2 ring-white/20' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {opt}
                    {selection === opt && <i className="fas fa-check-circle"></i>}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={!selection}
                className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black shadow-xl disabled:opacity-30 uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                LOCK IN PICK
              </button>
            </form>
          </div>
        </div>
      )}

      {resolvingBet && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border-2 border-red-500/30 p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
            <h3 className="text-xl font-black font-orbitron mb-4 text-red-500 tracking-tighter uppercase italic">Host Control: Settle Prop</h3>
            <p className="text-white mb-8 font-bold leading-relaxed border-l-4 border-slate-700 pl-4 text-lg">{resolvingBet.question}</p>
            
            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Select the actual outcome:</p>
              {resolvingBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onResolveBet?.(resolvingBet.id, opt);
                    setResolvingBet(null);
                  }}
                  className="w-full py-4 rounded-xl text-sm font-black border border-slate-800 bg-slate-900 text-white hover:bg-green-600 hover:text-white hover:border-green-400 transition-all transform active:scale-95 flex items-center justify-between px-6"
                >
                  {opt}
                  <i className="fas fa-check"></i>
                </button>
              ))}
              <button
                onClick={() => setResolvingBet(null)}
                className="w-full mt-6 py-2 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Close Without Settling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BettingPanel;