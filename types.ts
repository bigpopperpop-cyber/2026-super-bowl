
export interface User {
  id: string;
  name: string;
  handle?: string;
  team?: string;
  deviceType: 'mobile' | 'desktop';
  lastSeen: number;
}

export interface ConnectionState {
  users: User[];
  roomCode: string;
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
  betId: string;
  userId: string;
  selection: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isAI?: boolean;
}

export interface GameState {
  quarter: string;
  time: string;
  scoreHome: number;
  scoreAway: number;
}
