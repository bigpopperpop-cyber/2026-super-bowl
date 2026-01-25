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
 * Uses Google Search to find the current live score of the game.
 */
export async function getLiveScoreFromSearch() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "What is the current score of the NFL game between the Los Angeles Rams and the Seattle Seahawks right now? Also tell me if it is currently halftime. Format your response exactly like this: RAMS: [score], SEAHAWKS: [score], HALFTIME: [true/false]",
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    // Simple parsing logic
    const ramsMatch = text.match(/RAMS:?\s*(\d+)/i);
    const seaMatch = text.match(/SEAHAWKS:?\s*(\d+)/i);
    const halfMatch = text.match(/HALFTIME:?\s*(true|false)/i);

    return {
      rams: ramsMatch ? parseInt(ramsMatch[1]) : null,
      seahawks: seaMatch ? parseInt(seaMatch[1]) : null,
      isHalftime: halfMatch ? halfMatch[1].toLowerCase() === 'true' : false,
      sources: sources.map((c: any) => c.web?.uri).filter(Boolean)
    };
  } catch (err) {
    console.error("Search Error:", err);
    return null;
  }
}

/**
 * Generates a deep-cut historical or statistical fact about the Rams/Seahawks matchup.
 */
export async function getSidelineFact() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Give me one interesting, high-energy historical fact or obscure stat about the Rams vs Seahawks rivalry. It could be about a specific player (like Aaron Donald or Marshawn Lynch), a legendary game, or a weird stat. Keep it under 30 words and very hype!",
      config: {
        systemInstruction: "You are 'SBLIX SIDELINE BOT'. You provide automated, data-driven nuggets of wisdom during the broadcast. You are punchy, professional, and use lots of tech/data emojis like 📊, 📉, 🤖.",
        temperature: 0.9,
      }
    });
    return response.text || "Did you know? These two teams always play it close! 🏈";
  } catch (err) {
    return "NFC West Fact: The rivalry between these two is one of the most physical in the NFL! 🏟️";
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