export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderTeam?: string;
  text: string;
  reactions?: Record<string, number>;
  timestamp: any;
}

export interface User {
  id: string;
  name: string;
  team?: string;
}

export interface TriviaQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  points: number;
}

export interface ScoreEntry {
  userId: string;
  userName: string;
  team: string;
  points: number;
  trophies: number;
}