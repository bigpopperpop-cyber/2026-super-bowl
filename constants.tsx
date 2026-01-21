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
    question: "National Anthem: Will the singer wear a hat?",
    odds: 2.1,
    category: 'Entertainment',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '3',
    question: "First Team to record a 1st Down?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Home Team', 'Away Team']
  },
  {
    id: '4',
    question: "Will there be a Touchdown scored in the 1st Quarter?",
    odds: 2.2,
    category: 'Stats',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '5',
    question: "Leading team at Halftime?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Home Team', 'Away Team', 'Tie']
  },
  {
    id: '6',
    question: "Halftime Show: Will there be a Guest Performer?",
    odds: 1.5,
    category: 'Entertainment',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '7',
    question: "Total Points at end of 3rd Quarter: Over or Under 34.5?",
    odds: 1.9,
    category: 'Stats',
    resolved: false,
    options: ['Over 34.5', 'Under 34.5']
  },
  {
    id: '8',
    question: "Which team will be leading at the end of the 3rd Quarter?",
    odds: 1.8,
    category: 'Game',
    resolved: false,
    options: ['Home Team', 'Away Team', 'Tie']
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