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
    let bets = [...propBets];
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-2 flex flex-col gap-3 mb-4 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-orbitron flex items-center gap-2 text-white">
              <i className="fas fa-ticket-alt text-yellow-400 text-sm"></i>
              Prop Pool
            </h2>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black mt-0.5">
              Winner: +10 | Loser: -3
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-tight transition-all whitespace-nowrap border ${
                categoryFilter === cat 
                  ? 'bg-white text-slate-900 border-white shadow-lg scale-105' 
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-20 space-y-3">
        {filteredBets.map((bet) => {
          const myBet = getMyBetOn(bet.id);
          const stats = getBetStats(bet.id);

          return (
            <div 
              key={bet.id} 
              className={`p-4 rounded-2xl glass-card transition-all border relative overflow-hidden flex flex-col active:scale-[0.98] ${
                bet.resolved 
                  ? 'border-slate-800 opacity-60' 
                  : myBet 
                    ? 'border-blue-500/40 bg-blue-500/5' 
                    : 'border-slate-700 cursor-pointer'
              }`}
              onClick={() => !myBet && !bet.resolved && setSelectedBet(bet)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${bet.resolved ? 'bg-slate-800 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>
                  {bet.category}
                </span>
                {bet.resolved && (
                   <span className="text-[8px] font-black text-green-500 bg-green-500/10 border border-green-500/30 px-1.5 rounded-full uppercase">Settled</span>
                )}
              </div>
              
              <p className={`font-bold text-sm mb-3 leading-tight transition-colors ${
                bet.resolved 
                  ? 'text-slate-500' 
                  : myBet 
                    ? 'text-blue-400' 
                    : 'text-white'
              }`}>
                {bet.question}
              </p>
              
              <div className="flex-1">
                {bet.resolved ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Result:</span>
                    <span className="text-[10px] text-yellow-400 font-black uppercase">{bet.outcome}</span>
                  </div>
                ) : myBet ? (
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-400 bg-blue-500/10 py-1.5 px-2.5 rounded-lg border border-blue-500/20 w-fit">
                    <i className="fas fa-check-circle text-[8px]"></i>
                    LOCKED: {myBet.selection}
                  </div>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {bet.options.map(opt => (
                      <span key={opt} className="px-2 py-1 bg-slate-900/50 text-[9px] rounded-md border border-slate-800 font-bold text-slate-400">
                        {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!bet.resolved && (
                <div className="mt-3 pt-3 border-t border-slate-800/50 flex justify-between items-center text-[8px] uppercase font-black tracking-widest">
                  <div className="flex gap-3">
                    <span className="text-slate-600">Bets: <span className="text-white ml-0.5">{stats?.count || 0}</span></span>
                    <span className="text-slate-600">Top: <span className="text-yellow-500 ml-0.5">{stats?.popularPick || '-'}</span></span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setResolvingBet(bet);
                    }}
                    className="text-slate-600 hover:text-red-500 p-1"
                  >
                    <i className="fas fa-gavel"></i>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedBet && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-slate-900 border-t sm:border border-slate-700 p-6 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-start mb-4">
               <div>
                <h3 className="text-lg font-orbitron text-white">Make Your Pick</h3>
                <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">{selectedBet.category} Prop</span>
               </div>
               <button onClick={() => setSelectedBet(null)} className="text-slate-500 p-2"><i className="fas fa-times text-xl"></i></button>
            </div>
            <p className="text-white mb-6 font-bold leading-tight text-lg">{selectedBet.question}</p>
            
            <form onSubmit={handleBetSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                {selectedBet.options.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelection(opt)}
                    className={`py-4 px-5 rounded-xl text-sm font-black border transition-all text-left flex justify-between items-center active:scale-95 ${
                      selection === opt 
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg ring-1 ring-white/20' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
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
                className="w-full py-4 bg-white text-slate-950 rounded-xl font-black shadow-xl disabled:opacity-20 uppercase tracking-widest text-xs active:scale-95 transition-all mt-2"
              >
                LOCK IN PICK
              </button>
            </form>
            <div className="h-safe"></div>
          </div>
        </div>
      )}

      {resolvingBet && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border-2 border-red-900/50 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-black font-orbitron mb-3 text-red-500 uppercase italic">Host Settle</h3>
            <p className="text-white mb-6 font-bold leading-tight text-sm border-l-2 border-red-500 pl-3">{resolvingBet.question}</p>
            
            <div className="space-y-2">
              {resolvingBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onResolveBet?.(resolvingBet.id, opt);
                    setResolvingBet(null);
                  }}
                  className="w-full py-3 rounded-lg text-[11px] font-black border border-slate-800 bg-slate-900 text-slate-300 active:bg-green-600 active:text-white transition-all flex items-center justify-between px-4"
                >
                  {opt}
                  <i className="fas fa-check text-[10px]"></i>
                </button>
              ))}
              <button
                onClick={() => setResolvingBet(null)}
                className="w-full mt-4 py-2 text-slate-600 text-[10px] font-black uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BettingPanel;