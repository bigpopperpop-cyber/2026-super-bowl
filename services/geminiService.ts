import { GoogleGenAI } from "@google/genai";

/**
 * Generates a response from Coach SBLIX using the Gemini API.
 */
export async function getCoachResponse(prompt: string) {
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

/**
 * Generates a post-game summary based on the final scores and player rankings.
 */
export async function getPostGameAnalysis(scoreData: any, leaderboard: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const leaderboardSummary = leaderboard.map((u, i) => `${i+1}. ${u.userName} (${u.points} pts)`).join(", ");
  const prompt = `Tonight's Final: Rams ${scoreData.rams} - Seahawks ${scoreData.seahawks}. 
  The top fans in the SBLIX Hub were: ${leaderboardSummary}. 
  Write a 60-word post-game 'Locker Room Recap' in your Coach SBLIX voice. 
  Praise the winner of the game, shout out the MVP fan (the #1 ranked user), and mention the intense battle on the field.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are Coach SBLIX. You are doing a post-game radio broadcast. You are energetic, professional, but definitely a bit of a football fanatic. Use lots of emojis.",
        temperature: 0.8,
      }
    });
    return response.text;
  } catch (err) {
    return "What a game! Technical difficulties prevent the full breakdown, but the energy in the stadium was ELECTRIC! 🏈🔥";
  }
}
