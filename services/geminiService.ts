import { GoogleGenAI } from "@google/genai";

export async function getCoachResponse(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: (process.env as any).API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are 'Coach SBLIX', a high-energy, witty American Football commentator. You provide hype, game analysis, and fun facts about the Super Bowl. Keep responses under 50 words and use sports slang.",
        temperature: 0.9,
      }
    });
    return response.text;
  } catch (err) {
    console.error("Gemini Error:", err);
    return "The signal is fuzzy, but the hype is real! Touchdown! 🏈";
  }
}