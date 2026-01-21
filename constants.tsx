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
    question: "Which team scores the first Touchdown?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Home Team', 'Away Team', 'No TD']
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
    question: "Will there be a score in the final 2 minutes of the game?",
    odds: 2.1,
    category: 'Game',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '6',
    question: "Who wins the Super Bowl LIX Title?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Home Team', 'Away Team']
  },
  {
    id: '7',
    question: "MVP Award: Which position wins it?",
    odds: 2.5,
    category: 'Player',
    resolved: false,
    options: ['Quarterback', 'Wide Receiver', 'Defense', 'Other']
  },
  {
    id: '8',
    question: "Color of the Gatorade Shower on the winning coach?",
    odds: 4.0,
    category: 'Entertainment',
    resolved: false,
    options: ['Orange', 'Blue', 'Clear/Water', 'Yellow/Green', 'Red', 'Purple']
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