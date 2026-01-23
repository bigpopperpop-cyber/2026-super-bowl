
export interface User {
  id: string;
  username: string; // This is the chat name/handle
  realName: string; // This is the real name (e.g., John D.)
  avatar: string;   // Now stores the Team ID (e.g., 'KC', 'SF')
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
  odds: number;
  category: 'Game' | 'Player' | 'Entertainment' | 'Stats' | 'Halftime';
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
