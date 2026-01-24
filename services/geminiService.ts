import { GoogleGenAI, Type } from "@google/genai";
import { PropBet, GameState } from "../types";

export const generateLiveProps = async (gameState: GameState): Promise<Partial<PropBet>[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Current Super Bowl State: ${gameState.quarter}, ${gameState.time}. Score: ${gameState.scoreHome}-${gameState.scoreAway}.
      1. Use Google Search to find exactly what just happened in the game (current drive, recent plays).
      2. Generate 3 exciting, short-term prop bets for guests.
      3. Return ONLY valid JSON.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              category: { type: Type.STRING, description: "One of: Game, Player, Stats" },
              options: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["question", "category", "options"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Prop Generation Error:", error);
    return [];
  }
};

export const resolveProps = async (props: PropBet[]): Promise<{ id: string, winner: string }[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const unresolved = props.filter(p => !p.resolved);
  if (unresolved.length === 0) return [];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Search Google for the outcomes of these Super Bowl LIX events:
      ${unresolved.map(p => `ID: ${p.id} | Question: ${p.question} | Options: ${p.options.join(', ')}`).join('\n')}
      Determine which option happened. If the event hasn't finished, do not return it.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              winner: { type: Type.STRING }
            },
            required: ["id", "winner"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Resolution Error:", error);
    return [];
  }
};

export const getGameUpdate = async (): Promise<GameState | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "What is the current score and game clock of Super Bowl LIX? (Chiefs vs 49ers/Eagles etc)",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quarter: { type: Type.STRING },
            time: { type: Type.STRING },
            scoreHome: { type: Type.NUMBER },
            scoreAway: { type: Type.NUMBER },
            isActive: { type: Type.BOOLEAN }
          },
          required: ["quarter", "time", "scoreHome", "scoreAway", "isActive"]
        }
      }
    });
    return JSON.parse(response.text || "null");
  } catch (error) {
    return null;
  }
};
