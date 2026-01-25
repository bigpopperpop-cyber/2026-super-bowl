import { GoogleGenAI } from "@google/genai";

/**
 * Generates a response from Coach SBLIX using the Gemini API.
 * The API key is retrieved exclusively from process.env.API_KEY.
 */
export async function getCoachResponse(prompt: string) {
  let apiKey: string | undefined;
  
  // Safe check for process.env.API_KEY
  try {
    if (typeof process !== 'undefined' && process.env) {
      apiKey = process.env.API_KEY;
    }
  } catch (e) {
    // Fallback or ignore
  }
  
  if (!apiKey) {
    console.error("Gemini API Key missing.");
    return "Coach is looking for his glasses... (API Key missing).";
  }

  // Create a new GoogleGenAI instance right before the call to ensure the latest key is used.
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
    // Extract text using the .text property (not a method call).
    return response.text || "Coach is speechless!";
  } catch (err) {
    console.error("Gemini Error:", err);
    return "The stadium signal is weak, but the fans are loud! Touchdown! 🏈";
  }
}