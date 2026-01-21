import { PropBet } from './types';

export const INITIAL_PROP_BETS: PropBet[] = [
  {
    id: '1',
    question: "Coin Toss: Which side will land up?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Heads', 'Tails']
  },
  {
    id: '2',
    question: "First Team to record a 1st Down?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Home Team', 'Away Team']
  },
  {
    id: '3',
    question: "Halftime Show: Will there be a Guest Performer?",
    odds: 1.5,
    category: 'Entertainment',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '4',
    question: "Total Points at end of 3rd Quarter: Over or Under 34.5?",
    odds: 1.9,
    category: 'Stats',
    resolved: false,
    options: ['Over 34.5', 'Under 34.5']
  },
  {
    id: '5',
    question: "Will there be a Replay Challenge in the 4th Quarter?",
    odds: 2.2,
    category: 'Game',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '6',
    question: "Will the game go into Overtime?",
    odds: 5.0,
    category: 'Game',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '7',
    question: "Will any player finish with 100+ Receiving Yards?",
    odds: 1.8,
    category: 'Player',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '8',
    question: "Will there be a successful 4th Down Conversion in the 2nd Half?",
    odds: 1.6,
    category: 'Stats',
    resolved: false,
    options: ['Yes', 'No']
  }
];

export const AVATARS = [
  '🦅', // Eagles/Seahawks
  '🦁', // Lions
  '🐯', // Bengals
  '🐆', // Jaguars
  '🐎', // Broncos/Colts
  '🐃', // Bills/Texans
  '🐻', // Bears
  '🐏', // Rams
  '🐬', // Dolphins
  '⚔️', // Vikings/Raiders
  '🏹', // Chiefs
  '⛏️', // 49ers
  '🐦', // Falcons/Cardinals/Ravens
  '🧀', // Packers
  '⚜️'  // Saints
];