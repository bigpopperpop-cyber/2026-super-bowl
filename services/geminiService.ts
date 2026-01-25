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
        systemInstruction: "You are 'Coach SBLIX', a high-energy American Football commentator. Tonight's game is the NFC West clash: Los Angeles Rams vs. Seattle Seahawks. You provide hype, game analysis, and fun facts about these two teams. Keep responses under 40 words and use sports slang like 'Gridiron', 'Endzone', 'The 12th Man', and 'Sack City'.",
        temperature: 1,
      }
    });
    
    return response.text || "Coach is speechless!";
  } catch (err) {
    console.error("Gemini Error:", err);
    return "The stadium signal is weak! Rams and Seahawks are battling hard! 🏈";
  }
}