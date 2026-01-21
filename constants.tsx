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
    question: "National Anthem Length: Over or Under 121.5 seconds?",
    odds: 1.85,
    category: 'Entertainment',
    resolved: false,
    options: ['Over (Longer)', 'Under (Shorter)']
  },
  {
    id: '3',
    question: "Which team will score the first Touchdown?",
    odds: 1.9,
    category: 'Game',
    resolved: false,
    options: ['Home Team', 'Away Team', 'No TD Scored']
  },
  {
    id: '4',
    question: "Color of the Gatorade Shower on the winning coach?",
    odds: 4.0,
    category: 'Entertainment',
    resolved: false,
    options: ['Orange', 'Blue', 'Clear/Water', 'Yellow/Green', 'Purple', 'Red']
  },
  {
    id: '5',
    question: "Halftime Show: Will the headliner wear a hat at any point?",
    odds: 2.1,
    category: 'Entertainment',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '6',
    question: "Total Game Points: Over or Under 47.5?",
    odds: 1.9,
    category: 'Stats',
    resolved: false,
    options: ['Over 47.5', 'Under 47.5']
  },
  {
    id: '7',
    question: "Will there be a missed Field Goal or Extra Point?",
    odds: 2.4,
    category: 'Game',
    resolved: false,
    options: ['Yes', 'No']
  },
  {
    id: '8',
    question: "MVP Award: Which position wins it?",
    odds: 2.8,
    category: 'Player',
    resolved: false,
    options: ['Quarterback', 'Wide Receiver', 'Running Back', 'Defense/Other']
  }
];

export const AVATARS = [
  '👯‍♀️', // Cheerleaders
  '🤸‍♀️', // Cartwheel
  '💃', // Dancing
  '📣', // Megaphone
  '🎀', // Hair Ribbon
  '🙌', // Spirit Fingers
  '✨', // Sparkle
  '👟', // Cheer Shoes
  '🙋‍♀️', // Hand Raise
  '🙆‍♀️'  // Performance Pose
];