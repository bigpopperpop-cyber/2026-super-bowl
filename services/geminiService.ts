
import { GoogleGenAI } from "@google/genai";

// Fix: Always use the required structure to initialize the GoogleGenAI client with the API key from process.env.API_KEY exclusively.
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

    // Fix: Use the standard generateContent call as per the updated SDK guidelines.
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

    // Fix: Access .text property directly (not as a method) on the response object.
    return response.text || "Leaderboard is moving! Someone's about to jump the standings!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The atmosphere is heating up! Keep those picks coming!";
  }
};
