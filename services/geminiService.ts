import { GoogleGenAI } from "@google/genai";

export async function getCoachResponse(prompt: string) {
  // Guidelines require using process.env.API_KEY
  const apiKey = (process.env as any).API_KEY || (import.meta as any).env?.VITE_API_KEY;
  
  if (!apiKey) {
    console.error("Gemini API Key missing.");
    return "Coach is currently reviewing the playbook (API Key missing).";
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
    return "The signal is fuzzy, but the hype is real! Touchdown! 🏈";
  }
}