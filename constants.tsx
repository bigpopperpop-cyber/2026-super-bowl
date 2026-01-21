
import { PropBet } from './types';

export const INITIAL_PROP_BETS: PropBet[] = [
  {
    id: '1',
    question: "Who will win the coin toss?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Heads', 'Tails']
  },
  {
    id: '2',
    question: "National Anthem length (Over/Under 122.5 seconds)?",
    odds: 1.85,
    category: 'Entertainment',
    resolved: false,
    options: ['Over', 'Under']
  },
  {
    id: '3',
    question: "Total passing yards for the winning QB?",
    odds: 2.5,
    category: 'Stats',
    resolved: false,
    options: ['Under 250', '250-300', 'Over 300']
  },
  {
    id: '4',
    question: "Which color Gatorade will be poured on the winning coach?",
    odds: 4.0,
    category: 'Entertainment',
    resolved: false,
    options: ['Orange', 'Blue', 'Clear', 'Yellow', 'Purple', 'Red']
  },
  {
    id: '5',
    question: "Will there be a defensive or special teams touchdown?",
    odds: 3.5,
    category: 'Game',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '6',
    question: "Total points scored in the first half?",
    odds: 1.9,
    category: 'Stats',
    resolved: false,
    options: ['Over 24.5', 'Under 24.5']
  }
];

export const AVATARS = [
  '🏈', // Football
  '🏟️', // Stadium
  '🏆', // Trophy
  '👕', // Jersey
  '🧤', // Receiver Gloves
  '👟', // Cleats
  '🚩', // Penalty Flag
  '🧢', // Coach Cap
  '🧊', // Ice Bucket (Gatorade Shower)
  '📣'  // Megaphone
];
