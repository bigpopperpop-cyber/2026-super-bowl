import { GoogleGenAI } from "@google/genai";

const getApiKey = (): string | undefined => {
  if (typeof process !== 'undefined' && (process as any).env?.API_KEY) {
    return (process as any).env.API_KEY;
  }
  const metaEnv = (import.meta as any).env;
  return metaEnv?.VITE_API_KEY;
};

export async function getCoachResponse(prompt: string) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.error("Gemini API Key missing.");
    return "Coach is looking for his glasses... (API Key missing).";
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are 'Coach SBLIX', a high-energy, witty American Football commentator. You provide hype, game analysis, and fun facts about the Super Bowl. Keep responses under 50 words and use sports slang like 'Gridiron', 'Endzone', and 'Blitz'.",
        temperature: 1,
      }
    });
    return response.text;
  } catch (err) {
    console.error("Gemini Error:", err);
    return "The stadium signal is weak, but the fans are loud! Touchdown! 🏈";
  }
}