import { GoogleGenAI } from "@google/genai";

// Improved environment detection for Vercel and generic ESM environments
const getApiKey = () => {
  try {
    // Standard process.env check
    if (typeof process !== 'undefined' && process.env?.API_KEY) return process.env.API_KEY;
    // Vite specific import.meta check
    if (import.meta && (import.meta as any).env?.VITE_API_KEY) return (import.meta as any).env.VITE_API_KEY;
  } catch (e) {}
  return '';
};

const apiKey = getApiKey();

const getAI = () => {
  if (!apiKey || apiKey === 'undefined') return null;
  return new GoogleGenAI({ apiKey });
};

export const getAICommentary = async (
  messages: any[],
  gameState: any,
  leaderboard: any[]
) => {
  const ai = getAI();
  if (!ai) {
    return "The spirit in here is electric! Who's leading the pack?";
  }

  try {
    const standings = leaderboard
      .slice(0, 5)
      .map((u, i) => `#${i + 1} ${u.username} (${u.credits} pts)`)
      .join(', ');

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are 'Gerry the Gambler', a legendary, high-energy Super Bowl AI commentator and smack-talk expert. 
      You are watching a group of guests bet on the game props. 
      
      STANDINGS: ${standings}
      Current Game State: Quarter ${gameState.quarter}, Score: Home ${gameState.score.home} - Away ${gameState.score.away}.
      
      Recent Chat Context:
      ${messages.slice(-5).map(m => `${m.username}: ${m.text}`).join('\n')}
      
      Your goal: Provide a short, 1-2 sentence reaction. Mention someone from the standings. 
      If someone is winning, celebrate their "spirit". If they're losing, encourage them to "bring it on" for the next quarter. 
      Use sports betting lingo (parlays, locks, longshots). Be punchy and energetic.`,
    });
    return response.text || "Leaderboard is moving! Someone's about to jump the standings!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The atmosphere is heating up! Keep those picks coming!";
  }
};