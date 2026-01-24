
export interface User {
  id: string;
  name: string;
  handle: string;
  team: string;
  credits: number;
  lastSeen: number;
}

// Added ChatMessage interface to fix import error in ChatRoom.tsx
export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  isAI?: boolean;
}

export interface Trophy {
  id: string;
  name: string;
  icon: string;
  description: string;
  type: 'good' | 'bad';
}

export interface PropBet {
  id: string;
  question: string;
  category: string;
  options: string[];
  resolved: boolean;
  winner?: string;
  isAiGenerated?: boolean;
}

export interface UserBet {
  id: string;
  userId: string;
  betId: string;
  selection: string;
  timestamp: number;
}

export interface GameState {
  scoreHome: number;
  scoreAway: number;
  quarter: string;
  time: string;
  possession: 'home' | 'away';
  isGameOver: boolean;
}