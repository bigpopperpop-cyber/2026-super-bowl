
import { GoogleGenAI, Type } from "@google/genai";

// Safe access to environment variables
const getApiKey = () => {
  try {
    return (typeof process !== 'undefined' && process.env.API_KEY) || '';
  } catch {
    return '';
  }
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

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
      contents: `You are 'Gerry the Gambler', a legendary, high-energy Super Bowl AI commentator and smack-talk expert. 
      You are watching a group of guests bet on the game. 
      
      STANDINGS: ${standings}
      Current Game State: Quarter ${gameState.quarter}, Score: Home ${gameState.score.home} - Away ${gameState.score.away}.
      
      Recent Chat Context:
      ${messages.slice(-5).map(m => `${m.username}: ${m.text}`).join('\n')}
      
      Your goal: Provide a short, 1-2 sentence reaction. You MUST mention someone from the standings. 
      If someone has negative points, give them some grief! If someone is winning, call them a 'sharp' or ask if they're fixing the game. 
      Use heavy sports betting lingo (parlays, spreads, locks, bad beats). Be punchy and hilarious.`,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Standings are looking wild! Someone's about to go bust!";
  }
};

export const generatePropBets = async () => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Generate 4 creative and unique Super Bowl prop bets. Include at least one about the halftime show, one about a specific player stat, and one completely random 'weird' bet. These should be questions with 2-4 possible outcomes.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING, description: "A clear betting question" },
              odds: { type: Type.NUMBER, description: "The payout multiplier (kept for UI consistency, usually 2.0)" },
              category: { type: Type.STRING, description: "One of: Game, Player, Entertainment, Stats" },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "2-4 possible outcomes to bet on"
              }
            },
            required: ["question", "odds", "category", "options"]
          }
        }
      }
    });
    
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating bets:", error);
    return [];
  }
};