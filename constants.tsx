
import { PropBet } from './types';

export interface NFLTeam {
  id: string;
  name: string;
  city: string;
  primary: string;
  secondary: string;
}

export const NFL_TEAMS: NFLTeam[] = [
  { id: 'ARI', city: 'Arizona', name: 'Cardinals', primary: '#97233F', secondary: '#000000' },
  { id: 'ATL', city: 'Atlanta', name: 'Falcons', primary: '#A71930', secondary: '#000000' },
  { id: 'BAL', city: 'Baltimore', name: 'Ravens', primary: '#241773', secondary: '#9E7C0C' },
  { id: 'BUF', city: 'Buffalo', name: 'Bills', primary: '#00338D', secondary: '#C60C30' },
  { id: 'CAR', city: 'Carolina', name: 'Panthers', primary: '#0085CA', secondary: '#101820' },
  { id: 'CHI', city: 'Chicago', name: 'Bears', primary: '#0B162A', secondary: '#C83803' },
  { id: 'CIN', city: 'Cincinnati', name: 'Bengals', primary: '#FB4F14', secondary: '#000000' },
  { id: 'CLE', city: 'Cleveland', name: 'Browns', primary: '#311D00', secondary: '#FF3C00' },
  { id: 'DAL', city: 'Dallas', name: 'Cowboys', primary: '#003594', secondary: '#869397' },
  { id: 'DEN', city: 'Denver', name: 'Broncos', primary: '#FB4F14', secondary: '#002244' },
  { id: 'DET', city: 'Detroit', name: 'Lions', primary: '#0076B6', secondary: '#B0B7BC' },
  { id: 'GB', city: 'Green Bay', name: 'Packers', primary: '#203731', secondary: '#FFB612' },
  { id: 'HOU', city: 'Houston', name: 'Texans', primary: '#03202F', secondary: '#A71930' },
  { id: 'IND', city: 'Indianapolis', name: 'Colts', primary: '#002C5F', secondary: '#A2AAAD' },
  { id: 'JAX', city: 'Jacksonville', name: 'Jaguars', primary: '#006778', secondary: '#D7A22A' },
  { id: 'KC', city: 'Kansas City', name: 'Chiefs', primary: '#E31837', secondary: '#FFB612' },
  { id: 'LV', city: 'Las Vegas', name: 'Raiders', primary: '#000000', secondary: '#A5ACAF' },
  { id: 'LAC', city: 'LA', name: 'Chargers', primary: '#0080C6', secondary: '#FFC20E' },
  { id: 'LAR', city: 'LA', name: 'Rams', primary: '#003594', secondary: '#FFA300' },
  { id: 'MIA', city: 'Miami', name: 'Dolphins', primary: '#008E97', secondary: '#FC4C02' },
  { id: 'MIN', city: 'Minnesota', name: 'Vikings', primary: '#4F2683', secondary: '#FFC62F' },
  { id: 'NE', city: 'New England', name: 'Patriots', primary: '#002244', secondary: '#C60C30' },
  { id: 'NO', city: 'New Orleans', name: 'Saints', primary: '#D3BC8D', secondary: '#101820' },
  { id: 'NYG', city: 'New York', name: 'Giants', primary: '#0B2265', secondary: '#A71930' },
  { id: 'NYJ', city: 'New York', name: 'Jets', primary: '#125740', secondary: '#000000' },
  { id: 'PHI', city: 'Philadelphia', name: 'Eagles', primary: '#004C54', secondary: '#A5ACAF' },
  { id: 'PIT', city: 'Pittsburgh', name: 'Steelers', primary: '#FFB612', secondary: '#101820' },
  { id: 'SF', city: 'San Francisco', name: '49ers', primary: '#AA0000', secondary: '#B3995D' },
  { id: 'SEA', city: 'Seattle', name: 'Seahawks', primary: '#002244', secondary: '#69BE28' },
  { id: 'TB', city: 'Tampa Bay', name: 'Buccaneers', primary: '#D50A0A', secondary: '#34302B' },
  { id: 'TEN', city: 'Tennessee', name: 'Titans', primary: '#0C2340', secondary: '#4B92DB' },
  { id: 'WAS', city: 'Washington', name: 'Commanders', primary: '#5A1414', secondary: '#FFB612' }
];

// Removed 'odds' property as it is not defined in the PropBet type
export const INITIAL_PROP_BETS: PropBet[] = [
  { id: '1', question: "Coin Toss: Which side will land up?", category: 'Game', resolved: false, options: ['Heads', 'Tails'] },
  { id: '2', question: "First Team to record a 1st Down?", category: 'Game', resolved: false, options: ['Home Team', 'Away Team'] },
  { id: '3', question: "Halftime Show: Will there be a Guest Performer?", category: 'Entertainment', resolved: false, options: ['Yes', 'No'] },
  { id: '4', question: "Total Points: Over or Under 44.5?", category: 'Stats', resolved: false, options: ['Over 44.5', 'Under 44.5'] },
  { id: '5', question: "Will there be a Replay Challenge?", category: 'Game', resolved: false, options: ['Yes', 'No'] }
];

export const AVATARS = NFL_TEAMS.map(t => t.id);
