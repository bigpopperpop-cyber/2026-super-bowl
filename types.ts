
export interface User {
  id: string;
  username: string;
  avatar: string;
  credits: number;
}

export enum BetStatus {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST'
}

export interface PropBet {
  id: string;
  question: string;
  odds: number; // Decimal odds: 2.0 = 100 profit on 100 bet
  category: 'Game' | 'Player' | 'Entertainment' | 'Stats';
  resolved: boolean;
  outcome?: string;
  options: string[];
}

export interface UserBet {
  id: string;
  userId: string;
  betId: string;
  amount: number;
  selection: string;
  status: BetStatus;
  placedAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  isAI?: boolean;
}

export interface GameState {
  quarter: number;
  timeRemaining: string;
  score: {
    home: number;
    away: number;
  };
  possession: 'home' | 'away';
}
