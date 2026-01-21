
import React, { useState, useMemo } from 'react';
import { PropBet, User, UserBet, BetStatus } from '../types.ts';

interface BettingPanelProps {
  propBets: PropBet[];
  user: User;
  onPlaceBet: (betId: string, amount: number, selection: string) => void;
  allBets: UserBet[];
  onGenerateBets?: () => void;
  isGenerating?: boolean;
  onResolveBet?: (betId: string, winningOption: string) => void;
}

type CategoryFilter = 'All' | 'Game' | 'Player' | 'Entertainment' | 'Stats';

const BettingPanel: React.FC<BettingPanelProps> = ({ 
  propBets, 
  user, 
  onPlaceBet, 
  allBets,
  onGenerateBets,
  isGenerating,
  onResolveBet
}) => {
  const [selectedBet, setSelectedBet] = useState<PropBet | null>(null);
  const [selection, setSelection] = useState<string>('');
  const [resolvingBet, setResolvingBet] = useState<PropBet | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');

  const categories: CategoryFilter[] = ['All', 'Game', 'Player', 'Entertainment', 'Stats'];

  const filteredBets = useMemo(() => {
    let bets = [...propBets].reverse();
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-orbitron flex items-center gap-2 text-white">
              <i className="fas fa-ticket-alt text-yellow-400"></i>
              Prop Center
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Win: +10 | Loss: -3</p>
            </div>
          </div>
          
          <button
            onClick={onGenerateBets}
            disabled={isGenerating}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all border shadow-lg ${
              isGenerating 
                ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 border-indigo-400 text-white hover:scale-105 active:scale-95 shadow-indigo-500/20'
            }`}
          >
            {isGenerating ? (
              <><i className="fas fa-spinner animate-spin"></i> Mining...</>
            ) : (
              <><i className="fas fa-wand-magic-sparkles"></i> AI Generator</>
            )}
          </button>
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
          const isAIBet = bet.id.length > 5 && !['1','2','3','4','5','6'].includes(bet.id);

          return (
            <div 
              key={bet.id} 
              className={`p-4 rounded-xl glass-card transition-all border relative overflow-hidden flex flex-col group ${
                bet.resolved 
                  ? 'border-slate-800 opacity-60 grayscale-[0.5]' 
                  : myBet 
                    ? 'border-blue-500/50 bg-blue-500/5' 
                    : 'border-slate-700 hover:border-slate-500 cursor-pointer'
              }`}
              onClick={() => !myBet && !bet.resolved && setSelectedBet(bet)}
            >
              {isAIBet && (
                <div className="absolute -top-1 -right-1 z-10">
                  <div className="bg-indigo-600 text-[8px] font-black uppercase px-2 py-1 rounded-bl-lg shadow-sm">AI</div>
                </div>
              )}

              <div className="flex justify-between items-start mb-2">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${bet.resolved ? 'bg-slate-800 text-slate-500' : 'bg-slate-800 text-slate-400'}`}>
                  {bet.category}
                </span>
                {bet.resolved && (
                   <span className="text-[9px] font-black text-slate-500 border border-slate-800 px-2 rounded-full uppercase">Settled</span>
                )}
              </div>
              
              <p className="font-bold text-sm mb-3 text-white group-hover:text-yellow-400 transition-colors">{bet.question}</p>
              
              <div className="flex-1">
                {bet.resolved ? (
                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-500 uppercase font-black">Winning Pick: <span className="text-yellow-500 ml-1">{bet.outcome}</span></div>
                    {myBet && (
                       <div className={`text-[10px] font-black py-1 px-2 rounded inline-block ${myBet.status === BetStatus.WON ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                         {myBet.status === BetStatus.WON ? '+10 POINTS' : '-3 POINTS'}
                       </div>
                    )}
                  </div>
                ) : myBet ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 mt-2 bg-blue-950/30 p-2 rounded-lg border border-blue-500/20">
                    <i className="fas fa-lock"></i>
                    LOCKED: {myBet.selection}
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap mt-2 mb-4">
                    {bet.options.map(opt => (
                      <span key={opt} className="px-3 py-1 bg-slate-800/80 text-[10px] rounded-full border border-slate-700 font-bold text-slate-300">
                        {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!bet.resolved && (
                <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center text-[9px] uppercase font-black tracking-widest">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-600">Active Bets</span>
                    <span className="text-blue-400 font-orbitron">{stats?.count || 0}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <span className="text-slate-600">Leader Pick</span>
                    <span className="text-orange-400 truncate max-w-[80px]">{stats?.popularPick || 'None'}</span>
                  </div>
                </div>
              )}

              {!bet.resolved && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setResolvingBet(bet);
                  }}
                  className="mt-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-red-500 transition-colors flex items-center gap-1 self-start"
                >
                  <i className="fas fa-cog"></i>
                  Settle Result
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedBet && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-start mb-4">
               <div>
                <h3 className="text-lg font-orbitron text-white">Place Prop Pick</h3>
                <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Category: {selectedBet.category}</span>
               </div>
               <button onClick={() => setSelectedBet(null)} className="text-slate-500 hover:text-white"><i className="fas fa-times"></i></button>
            </div>
            <p className="text-slate-300 mb-6 font-semibold leading-relaxed text-lg">{selectedBet.question}</p>
            
            <form onSubmit={handleBetSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-3 tracking-widest">Select Outcome</label>
                <div className="grid grid-cols-1 gap-2">
                  {selectedBet.options.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSelection(opt)}
                      className={`py-3 px-4 rounded-xl text-sm font-black border transition-all text-left flex justify-between items-center ${
                        selection === opt 
                          ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/20' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {opt}
                      {selection === opt && <i className="fas fa-check-circle"></i>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={!selection}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black shadow-xl shadow-blue-500/20 disabled:opacity-30 uppercase tracking-widest text-xs"
                >
                  CONFIRM PICK
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resolvingBet && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border-2 border-red-500/30 p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
            <h3 className="text-xl font-black font-orbitron mb-2 text-red-500 tracking-tighter uppercase italic">Settle Result</h3>
            <p className="text-white mb-8 font-bold leading-relaxed border-l-4 border-slate-700 pl-4">{resolvingBet.question}</p>
            
            <div className="space-y-3">
              {resolvingBet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onResolveBet?.(resolvingBet.id, opt);
                    setResolvingBet(null);
                  }}
                  className="w-full py-4 rounded-xl text-sm font-black border border-slate-800 bg-slate-900 text-white hover:bg-white hover:text-black hover:border-white transition-all transform active:scale-95 flex items-center justify-between px-6"
                >
                  {opt}
                  <i className="fas fa-chevron-right text-[10px]"></i>
                </button>
              ))}
              <button
                onClick={() => setResolvingBet(null)}
                className="w-full mt-6 py-2 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
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