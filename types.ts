
export interface User {
  id: string;
  name: string;
  // Added handle property for leaderboard display
  handle: string;
  team?: string;
  deviceType: 'mobile' | 'desktop';
  lastSeen: number;
  score: number;
  isOnline: boolean;
}

// Added ChatMessage interface to resolve missing export error
export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  isAI?: boolean;
}

export interface ConnectionEvent {
  type: 'ping';
  fromId: string;
  targetId: string;
  timestamp: number;
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
  betId: string;
  userId: string;
  selection: string;
  timestamp: number;
}

export interface GameState {
  scoreHome: number;
  scoreAway: number;
  quarter: string;
  time: string;
  possession: string;
  isGameOver: boolean;
}