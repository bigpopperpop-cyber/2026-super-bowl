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
      <div className="px-4 pt-4 flex flex-col gap-3 mb-4 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-orbitron flex items-center gap-2 text-white">
              <i className="fas fa-ticket-alt text-yellow-400 text-sm"></i>
              Prop Pool
            </h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-1">
              Win: +10 | Loss: -3
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-tight transition-all whitespace-nowrap border ${
                categoryFilter === cat 
                  ? 'bg-white text-slate-900 border-white shadow-lg' 
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-20 space-y-4">
        {filteredBets.map((bet) => {
          const myBet = getMyBetOn(bet.id);
          const stats = getBetStats(bet.id);

          return (
            <div 
              key={bet.id} 
              className={`p-5 rounded-2xl glass-card transition-all border relative overflow-hidden flex flex-col active:scale-[0.98] ${
                bet.resolved 
                  ? 'border-slate-800 opacity-60' 
                  : myBet 
                    ? 'border-blue-500/50 bg-blue-500/5' 
                    : 'border-slate-700 cursor-pointer'
              }`}
              onClick={() => !myBet && !bet.resolved && setSelectedBet(bet)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${bet.resolved ? 'bg-slate-800 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>
                  {bet.category}
                </span>
                {bet.resolved && (
                   <span className="text-[9px] font-black text-green-500 bg-green-500/10 border border-green-500/30 px-2 rounded-full uppercase">Settled</span>
                )}
              </div>
              
              <p className={`font-bold text-base mb-4 leading-tight transition-colors ${
                bet.resolved 
                  ? 'text-slate-500' 
                  : myBet 
                    ? 'text-blue-400 font-black' 
                    : 'text-white'
              }`}>
                {bet.question}
              </p>
              
              <div className="flex-1">
                {bet.resolved ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-bold uppercase">Result:</span>
                    <span className="text-[11px] text-yellow-400 font-black uppercase">{bet.outcome}</span>
                  </div>
                ) : myBet ? (
                  <div className="flex items-center gap-2 text-[11px] font-black text-blue-400 bg-blue-500/10 py-2 px-3 rounded-xl border border-blue-500/20 w-fit shadow-sm">
                    <i className="fas fa-lock text-[10px]"></i>
                    LOCKED: {myBet.selection}
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {bet.options.map(opt => (
                      <span key={opt} className="px-3 py-1.5 bg-slate-900/80 text-[10px] rounded-lg border border-slate-700 font-bold text-slate-400">
                        {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!bet.resolved && (
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] uppercase font-black tracking-widest">
                  <div className="flex gap-4">
                    <span className="text-slate-600">Picks: <span className="text-slate-300 ml-1">{stats?.count || 0}</span></span>
                    <span className="text-slate-600">Top: <span className="text-yellow-500 ml-1">{stats?.popularPick || '-'}</span></span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setResolvingBet(bet);
                    }}
                    className="text-slate-700 hover:text-red-500 p-2 -mr-2"
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
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-slate-900 border-t sm:border border-white/10 p-8 rounded-t-[2.5rem] sm:rounded-[2rem] w-full max-w-md shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-start mb-6">
               <div>
                <h3 className="text-xl font-orbitron text-white">Make Your Pick</h3>
                <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest">{selectedBet.category} Proposition</span>
               </div>
               <button onClick={() => setSelectedBet(null)} className="text-slate-500 p-2 -mt-2 -mr-2"><i className="fas fa-times text-2xl"></i></button>
            </div>
            <p className="text-white mb-8 font-black leading-tight text-xl">{selectedBet.question}</p>
            
            <form onSubmit={handleBetSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {selectedBet.options.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelection(opt)}
                    className={`py-5 px-6 rounded-2xl text-base font-black border transition-all text-left flex justify-between items-center active:scale-95 ${
                      selection === opt 
                        ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] ring-2 ring-blue-500/20' 
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    {opt}
                    {selection === opt && <i className="fas fa-check-circle text-xl"></i>}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={!selection}
                className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black shadow-xl disabled:opacity-10 uppercase tracking-widest text-sm active:scale-95 transition-all mt-6"
              >
                LOCK IN PICK
              </button>
            </form>
            <div className="h-10"></div>
          </div>
        </div>
      )}

      {resolvingBet && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border-2 border-red-900/50 p-8 rounded-3xl w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-black font-orbitron mb-4 text-red-500 uppercase italic tracking-tighter">Host Resolution</h3>
            <p className="text-white mb-8 font-bold leading-tight text-base border-l-4 border-red-600 pl-4">{resolvingBet.question}</p>
            
            <div className="space-y-3">
              {resolvingBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onResolveBet?.(resolvingBet.id, opt);
                    setResolvingBet(null);
                  }}
                  className="w-full py-4 rounded-xl text-sm font-black border border-slate-800 bg-slate-900 text-slate-200 active:bg-green-600 active:text-white transition-all flex items-center justify-between px-5"
                >
                  {opt}
                  <i className="fas fa-check"></i>
                </button>
              ))}
              <button
                onClick={() => setResolvingBet(null)}
                className="w-full mt-6 py-3 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:text-slate-400"
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