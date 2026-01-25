import { PropBet } from './types';

export interface NFLTeam {
  id: string;
  name: string;
  primary: string;
  secondary: string;
}

export const NFL_TEAMS: NFLTeam[] = [
  { id: 'KC', name: 'Chiefs', primary: '#E31837', secondary: '#FFB612' },
  { id: 'PHI', name: 'Eagles', primary: '#004C54', secondary: '#A5ACAF' },
  { id: 'SF', name: '49ers', primary: '#AA0000', secondary: '#B3995D' },
  { id: 'DET', name: 'Lions', primary: '#0076B6', secondary: '#B0B7BC' }
];

export const INITIAL_PROPS: PropBet[] = [
  { id: 'prop-1', question: "National Anthem: Over 2m 05s?", category: 'Pre-Game', resolved: false, options: ['Over', 'Under'], points: 10 },
  { id: 'prop-2', question: "Coin Toss Result?", category: 'Pre-Game', resolved: false, options: ['Heads', 'Tails'], points: 5 },
  { id: 'prop-3', question: "First Team to Score?", category: 'Game', resolved: false, options: ['Chiefs', 'Opponent'], points: 10 },
  { id: 'prop-4', question: "Will there be a Defensive TD?", category: 'Game', resolved: false, options: ['Yes', 'No'], points: 30 },
  { id: 'prop-5', question: "Gatorade Color poured on Coach?", category: 'Tradition', resolved: false, options: ['Orange', 'Blue', 'Clear', 'Red', 'Yellow/Green'], points: 20 },
  { id: 'prop-6', question: "Commercial with a Dog appearing first?", category: 'Ads', resolved: false, options: ['Yes', 'No'], points: 15 },
  { id: 'prop-7', question: "Total Points: Over 47.5?", category: 'Stats', resolved: false, options: ['Over', 'Under'], points: 10 }
];