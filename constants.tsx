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
    question: "Will any player have 60+ Receiving Yards by Halftime?",
    odds: 1.8,
    category: 'Player',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '13',
    question: "Will a Quarterback have 150+ Passing Yards by Halftime?",
    odds: 2.0,
    category: 'Player',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '14',
    question: "Will any player have 40+ Rushing Yards by Halftime?",
    odds: 1.9,
    category: 'Player',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '15',
    question: "Will there be a 1st Half Rushing Touchdown?",
    odds: 1.7,
    category: 'Player',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '8',
    question: "Which Movie Trailer airs first?",
    odds: 2.5,
    category: 'Entertainment',
    resolved: false,
    options: ['Marvel/Disney', 'DC/Warner Bros', 'Other/None']
  },
  {
    id: '9',
    question: "Will a commercial feature a QR Code?",
    odds: 1.7,
    category: 'Entertainment',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '10',
    question: "First Snack Brand to air a commercial?",
    odds: 2.1,
    category: 'Entertainment',
    resolved: false,
    options: ['Doritos', 'Pringles', 'Lay\'s', 'Other']
  },
  {
    id: '11',
    question: "Will a commercial feature a real or animated dog?",
    odds: 1.4,
    category: 'Entertainment',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '12',
    question: "Will there be a successful 4th Down Conversion in the 2nd Half?",
    odds: 1.6,
    category: 'Stats',
    resolved: false,
    options: ['Yes', 'No']
  }
];

export const AVATARS = [
  '🦅', '🦁', '🐯', '🐆', '🐎', '🐃', '🐻', '🐏', '🐬', '⚔️', '🏹', '⛏️', '🐦', '🧀', '⚜️'
];