
import { GoogleGenAI } from "@google/genai";

const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : '';
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getAICommentary = async (
  messages: any[],
  gameState: any,
  leaderboard: any[],
  retries = 2
): Promise<string> => {
  if (!apiKey) return "The atmosphere is electric! Keep those picks locked in!";
  
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

    const text = response.text?.trim();
    if (!text) throw new Error("Empty AI response");
    return text;

  } catch (error: any) {
    if (retries > 0) {
      console.warn(`[SBLIX] AI call failed, retrying in 1s... (${retries} left)`, error.message);
      await sleep(1000);
      return getAICommentary(messages, gameState, leaderboard, retries - 1);
    }
    
    console.error("[SBLIX] Gemini Service Error:", error.message);
    if (error.message?.includes('fetch')) {
      return "Network signal is weak, but the action is heating up! Keep those picks coming!";
    }
    return "Someone's making a massive play for the lead! Don't look now!";
  }
};
