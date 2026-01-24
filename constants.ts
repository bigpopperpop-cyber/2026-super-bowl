import { PropBet } from './types';

export interface NFLTeam {
  id: string;
  name: string;
  city: string;
  primary: string;
  secondary: string;
}

export const NFL_TEAMS: NFLTeam[] = [
  { id: 'KC', city: 'Kansas City', name: 'Chiefs', primary: '#E31837', secondary: '#FFB612' },
  { id: 'PHI', city: 'Philadelphia', name: 'Eagles', primary: '#004C54', secondary: '#A5ACAF' },
  { id: 'SF', city: 'San Francisco', name: '49ers', primary: '#AA0000', secondary: '#B3995D' },
  { id: 'BAL', city: 'Baltimore', name: 'Ravens', primary: '#241773', secondary: '#9E7C0C' },
  { id: 'BUF', city: 'Buffalo', name: 'Bills', primary: '#00338D', secondary: '#C60C30' },
  { id: 'DAL', city: 'Dallas', name: 'Cowboys', primary: '#003594', secondary: '#869397' }
];

export const INITIAL_PROPS: PropBet[] = [
  { id: 'start-1', category: 'PRE-GAME', question: 'Coin Toss Outcome?', options: ['Heads', 'Tails'], resolved: false },
  { id: 'start-2', category: 'PRE-GAME', question: 'Length of National Anthem?', options: ['Over 120s', 'Under 120s'], resolved: false },
  { id: 'start-3', category: 'GAME', question: 'First Team to Score?', options: ['Home', 'Away'], resolved: false }
];

export const AVATARS = NFL_TEAMS.map(t => t.id);