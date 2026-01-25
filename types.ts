
export interface User {
  id: string;
  name: string;
  team: string;
  score: number;
}

export interface PropBet {
  id: string;
  question: string;
  category: string;
  options: string[];
  resolved: boolean;
  winner?: string;
  points?: number;
}

export interface UserBet {
  id: string;
  userId: string;
  betId: string;
  selection: string;
}

// Added GameState interface for tracking live sports data (resolves import error in geminiService.ts)
export interface GameState {
  quarter: string;
  time: string;
  scoreHome: number;
  scoreAway: number;
  isActive: boolean;
}

// Added ChatMessage interface for tactical communication features (resolves import error in ChatRoom.tsx)
export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userTeam: string;
  text: string;
  timestamp: any;
}
