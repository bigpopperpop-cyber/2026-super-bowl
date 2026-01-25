import { PropBet } from './types';

export interface NFLTeam {
  id: string;
  name: string;
  primary: string;
  secondary: string;
}

export const NFL_TEAMS: NFLTeam[] = [
  { id: 'KC', name: 'Chiefs', primary: '#E31837', secondary: '#FFB612' },
  { id: 'SF', name: '49ers', primary: '#AA0000', secondary: '#B3995D' },
  { id: 'BAL', name: 'Ravens', primary: '#241773', secondary: '#9E7C0C' },
  { id: 'DET', name: 'Lions', primary: '#0076B6', secondary: '#B0B7BC' }
];

export const INITIAL_PROPS: PropBet[] = [
  { id: 'prop-1', question: "National Anthem: Over 2m 05s?", category: 'Pre-Game', resolved: false, options: ['Over', 'Under'], points: 10 },
  { id: 'prop-2', question: "First Team to Score?", category: 'Game', resolved: false, options: ['Chiefs', '49ers'], points: 10 },
  { id: 'prop-3', question: "Gatorade Color at the end?", category: 'Entertainment', resolved: false, options: ['Orange', 'Blue', 'Purple', 'Clear', 'Red/Pink', 'Yellow/Green'], points: 20 },
  { id: 'prop-4', question: "Coin Toss Result?", category: 'Pre-Game', resolved: false, options: ['Heads', 'Tails'], points: 5 },
  { id: 'prop-5', question: "Total Touchdowns Over 5.5?", category: 'Stats', resolved: false, options: ['Over', 'Under'], points: 15 },
  { id: 'prop-6', question: "Commercial with a Dog in it first?", category: 'Ads', resolved: false, options: ['Yes', 'No'], points: 10 },
  { id: 'prop-7', question: "Will a QB throw for 300+ yards?", category: 'Player', resolved: false, options: ['Yes', 'No'], points: 15 }
];