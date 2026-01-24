export interface User {
  id: string;
  name: string;
  handle: string;
  team: string;
  deviceType: 'mobile' | 'desktop';
  score: number;
  lastPulse: number;
  isVerified: boolean;
  pingCount: number;
}

export interface GameState {
  quarter: string;
  time: string;
  scoreHome: number;
  scoreAway: number;
  isActive: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  isAI?: boolean;
}

export interface PropBet {
  id: string;
  question: string;
  category: string;
  options: string[];
  resolved: boolean;
  winner?: string;
}

export interface UserBet {
  id: string;
  userId: string;
  betId: string;
  selection: string;
  timestamp: number;
}