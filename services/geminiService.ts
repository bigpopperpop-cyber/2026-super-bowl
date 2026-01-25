import { GoogleGenAI } from "@google/genai";

/**
 * Generates a response from Coach SBLIX using the Gemini API.
 */
export async function getCoachResponse(prompt: string) {
  // Use the mandatory initialization pattern
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are 'Coach SBLIX', a high-energy, witty American Football commentator. You provide hype, game analysis, and fun facts about the Super Bowl. Keep responses under 40 words and use sports slang like 'Gridiron', 'Endzone', and 'Blitz'.",
        temperature: 1,
      }
    });
    
    return response.text || "Coach is speechless!";
  } catch (err) {
    console.error("Gemini Error:", err);
    return "The stadium signal is weak, but the fans are loud! Touchdown! 🏈";
  }
}