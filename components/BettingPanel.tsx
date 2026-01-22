import React, { useState, useMemo } from 'react';
import { PropBet, User, UserBet, BetStatus } from '../types';

interface BettingPanelProps {
  propBets: PropBet[];
  user: User;
  onPlaceBet: (betId: string, amount: number, selection: string) => void;
  allBets: UserBet[];
  hideFilters?: boolean;
}

type CategoryFilter = 'All' | 'Game' | 'Player' | 'Entertainment' | 'Stats' | 'Halftime';

const BettingPanel: React.FC<BettingPanelProps> = ({ 
  propBets, 
  user, 
  onPlaceBet, 
  allBets,
  hideFilters = false
}) => {
  const [selectedBet, setSelectedBet] = useState<PropBet | null>(null);
  const [selection, setSelection] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');

  const categories: CategoryFilter[] = ['All', 'Game', 'Player', 'Entertainment', 'Stats', 'Halftime'];

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
    const counts: Record<string, number> = {};
    betsOnThis.forEach(b => counts[b.selection] = (counts[b.selection] || 0) + 1);
    const popularPick = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { popularPick: popularPick[0], count: betsOnThis.length };
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!hideFilters && (
        <div className="px-4 pt-4 flex flex-col gap-3 mb-4 shrink-0">
          <h2 className="text-xl font-orbitron flex items-center gap-2 text-white">
            <i className="fas fa-ticket-alt text-yellow-400 text-sm"></i>
            Prop Pool
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {categories.filter(c => c !== 'Halftime').map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-5 py-2.5 rounded-full text-[11px] font-black uppercase border transition-all whitespace-nowrap ${
                  categoryFilter === cat ? 'bg-white text-slate-900 border-white' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto custom-scrollbar px-4 pb-20 space-y-4 ${hideFilters ? 'pt-4' : ''}`}>
        {filteredBets.length === 0 && (
          <div className="py-10 text-center text-slate-600 uppercase font-black text-[10px] tracking-widest">
            No props available in this category
          </div>
        )}
        {filteredBets.map((bet) => {
          const myBet = getMyBetOn(bet.id);
          const stats = getBetStats(bet.id);

          return (
            <div 
              key={bet.id} 
              className={`p-5 rounded-2xl glass-card transition-all border relative overflow-hidden flex flex-col active:scale-[0.98] ${
                bet.resolved ? 'border-slate-800 opacity-60' : myBet ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700 cursor-pointer'
              }`}
              onClick={() => !myBet && !bet.resolved && setSelectedBet(bet)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                  bet.category === 'Halftime' ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}>
                  {bet.category}
                </span>
                {bet.resolved && (
                   <span className="text-[9px] font-black text-green-500 bg-green-500/10 border border-green-500/30 px-2 rounded-full uppercase">Settled</span>
                )}
              </div>
              
              <p className={`font-bold text-base mb-4 leading-tight ${bet.resolved ? 'text-slate-500' : myBet ? 'text-blue-400 font-black' : 'text-white'}`}>
                {bet.question}
              </p>
              
              <div className="flex-1">
                {bet.resolved ? (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-400 font-bold uppercase">Outcome:</span>
                    <span className="text-yellow-400 font-black uppercase">{bet.outcome}</span>
                  </div>
                ) : myBet ? (
                  <div className="flex items-center gap-2 text-[11px] font-black text-blue-400 bg-blue-500/10 py-2 px-3 rounded-xl border border-blue-500/20 w-fit">
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
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] uppercase font-black tracking-widest text-slate-600">
                  <div className="flex gap-4">
                    <span>Picks: <span className="text-slate-300">{stats?.count || 0}</span></span>
                    <span>Top: <span className="text-yellow-500">{stats?.popularPick || '-'}</span></span>
                  </div>
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
               <h3 className="text-xl font-orbitron text-white">Make Your Pick</h3>
               <button onClick={() => setSelectedBet(null)} className="text-slate-500 p-2"><i className="fas fa-times text-2xl"></i></button>
            </div>
            <p className="text-white mb-8 font-black leading-tight text-xl">{selectedBet.question}</p>
            <div className="grid grid-cols-1 gap-3">
              {selectedBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onPlaceBet(selectedBet.id, 0, opt);
                    setSelectedBet(null);
                  }}
                  className="py-5 px-6 rounded-2xl text-base font-black border bg-slate-800 border-slate-700 text-slate-300 hover:bg-blue-600 hover:border-blue-400 hover:text-white transition-all text-left flex justify-between items-center active:scale-95"
                >
                  {opt}
                  <i className="fas fa-chevron-right opacity-30"></i>
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
