
import { GoogleGenAI } from "@google/genai";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getAICommentary = async (
  messages: any[],
  gameState: any,
  leaderboard: any[],
  retries = 1
): Promise<string> => {
  // Always initialize with process.env.API_KEY directly as per guidelines.
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const standings = leaderboard
      .slice(0, 3)
      .map((u, i) => `#${i + 1} ${u.username}`)
      .join(', ');

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Gerry the Gambler here. 
      LEADERS: ${standings || 'None'}
      SCORE: ${gameState.score.home}-${gameState.score.away}, Q${gameState.quarter}.
      CHAT: ${messages.slice(-3).map(m => m.text).join(' | ')}
      Give a 1-sentence pro reaction. SNAPPY.`,
    });

    // Directly access .text property as it is a getter, not a method.
    return response.text?.trim() || "The huddle is heated! Keep playing!";

  } catch (error: any) {
    if (retries > 0) {
      await sleep(1000);
      return getAICommentary(messages, gameState, leaderboard, retries - 1);
    }
    return "Massive play coming up! Watch the clock!";
  }
};