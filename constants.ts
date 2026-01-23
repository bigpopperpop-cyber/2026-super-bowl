
export const NFL_TEAMS = [
  { id: 'KC', name: 'Chiefs', city: 'Kansas City', primary: '#E31837', secondary: '#FFB612' },
  { id: 'PHI', name: 'Eagles', city: 'Philadelphia', primary: '#004C54', secondary: '#A5ACAF' },
  { id: 'SF', name: '49ers', city: 'San Francisco', primary: '#AA0000', secondary: '#B3995D' },
  { id: 'BAL', name: 'Ravens', city: 'Baltimore', primary: '#241773', secondary: '#9E7C0C' },
  { id: 'DET', name: 'Lions', city: 'Detroit', primary: '#0076B6', secondary: '#B0B7BC' },
  { id: 'DAL', name: 'Cowboys', city: 'Dallas', primary: '#003594', secondary: '#869397' },
  { id: 'BUF', name: 'Bills', city: 'Buffalo', primary: '#00338D', secondary: '#C60C30' },
  { id: 'CIN', name: 'Bengals', city: 'Cincinnati', primary: '#FB4F14', secondary: '#000000' }
];

export const INITIAL_PROPS = [
  { id: 'p1', category: 'PRE-GAME', question: 'Coin Toss Result?', options: ['Heads', 'Tails'], resolved: false },
  { id: 'p2', category: 'GAME', question: 'First Team to Score?', options: ['Home', 'Away'], resolved: false },
  { id: 'p3', category: 'PLAYER', question: 'Any QB Rushing TD?', options: ['Yes', 'No'], resolved: false },
  { id: 'p4', category: 'HALFTIME', question: 'First Song Performed?', options: ['Option A', 'Option B', 'Option C'], resolved: false },
  { id: 'p5', category: 'STATS', question: 'Total Sacks Over 4.5?', options: ['Over', 'Under'], resolved: false }
];
