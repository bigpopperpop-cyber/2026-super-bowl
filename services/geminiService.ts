import { GoogleGenAI, Type } from "@google/genai";
import { PropBet, GameState } from "../types";

export const generateLiveProps = async (gameState: GameState): Promise<Partial<PropBet>[]> => {
  // Always create a fresh instance of GoogleGenAI before making an API call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Current Super Bowl State: ${gameState.quarter}, ${gameState.time}. Score: ${gameState.scoreHome}-${gameState.scoreAway}.
      Use Google Search to find exactly what is happening in the game right now (drive details, player stats). 
      Generate 3 new, exciting LIVE prop bets that will be decided within the next 10-15 minutes of play.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              category: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["question", "category", "options"]
          }
        }
      }
    });

    // Safely extract text from the response property (not method)
    const text = response.text;
    return JSON.parse(text || "[]");
  } catch (error) {
    console.error("Prop Generation Error:", error);
    return [];
  }
};

export const resolveProps = async (props: PropBet[]): Promise<{ id: string, winner: string }[]> => {
  // Always create a fresh instance of GoogleGenAI before making an API call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const unresolved = props.filter(p => !p.resolved);
  if (unresolved.length === 0) return [];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Use Google Search to find the outcome of these Super Bowl prop bets:
      ${unresolved.map(p => `ID: ${p.id} - Question: ${p.question} (Options: ${p.options.join(', ')})`).join('\n')}
      Only return a winner if the event is definitively finished.`,
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

    const text = response.text;
    return JSON.parse(text || "[]");
  } catch (error) {
    console.error("Prop Resolution Error:", error);
    return [];
  }
};

export const checkGameEnd = async (): Promise<{ is3rdQuarterOver: boolean, homeScore: number, awayScore: number }> => {
  // Always create a fresh instance of GoogleGenAI before making an API call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: "Use Google Search to check the current score and quarter of Super Bowl LIX. Is the 3rd quarter finished yet?",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is3rdQuarterOver: { type: Type.BOOLEAN },
            homeScore: { type: Type.NUMBER },
            awayScore: { type: Type.NUMBER }
          },
          required: ["is3rdQuarterOver", "homeScore", "awayScore"]
        }
      }
    });
    
    const text = response.text;
    return JSON.parse(text || '{"is3rdQuarterOver": false, "homeScore": 0, "awayScore": 0}');
  } catch (error) {
    return { is3rdQuarterOver: false, homeScore: 0, awayScore: 0 };
  }
};