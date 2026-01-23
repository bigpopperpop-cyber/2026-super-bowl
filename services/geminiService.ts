
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getAICommentary = async (
  messages: any[],
  gameState: any,
  leaderboard: any[]
) => {
  try {
    const standings = leaderboard
      .slice(0, 5)
      .map((u, i) => `#${i + 1} ${u.username} (${u.credits} pts)`)
      .join(', ');

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are 'Gerry the Gambler', a high-energy Super Bowl AI commentator. 
      STANDINGS: ${standings || 'Nobody yet'}
      Current Game State: Quarter ${gameState.quarter}, Score: Home ${gameState.score.home} - Away ${gameState.score.away}.
      Recent Chat Context:
      ${messages.slice(-5).map(m => `${m.username}: ${m.text}`).join('\n')}
      
      Provide a sharp 1-2 sentence reaction. Talk like a sports betting pro. If standings exist, mention a leader. Use bold energy.`,
    });

    return response.text?.trim() || "The atmosphere is electric! Keep those picks locked in!";
  } catch (error) {
    console.warn("[GeminiService] AI commentary failed, falling back.", error);
    return "Someone's making a move on the leaderboards! Don't look now!";
  }
};
