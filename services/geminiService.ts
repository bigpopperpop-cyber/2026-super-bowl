import { GoogleGenAI, Type } from "@google/genai";

/**
 * Generates high-energy responses from Coach SBLIX.
 */
export async function getCoachResponse(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are 'Coach SBLIX', a legendary NFL broadcast personality. You are watching Super Bowl LIX. Your goal is to keep the energy at 11/10. React to scores, chat vibes, and game shifts with maximum hype.",
        temperature: 1,
      }
    });
    return response.text || "Keep your head in the game! 🏈";
  } catch (err) {
    return "The broadcast signal is jumping, but the energy is ELECTRIC! ⚡";
  }
}

/**
 * Uses Search Grounding to determine which team has the current 'Momentum'.
 * Returns a value from 0 (Team 1) to 100 (Team 2).
 */
export async function analyzeMomentum(scoreData: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Search for the current momentum of Super Bowl LIX or the latest NFL game (Time: ${now}). Based on the score (${scoreData.rams}-${scoreData.seahawks}) and recent plays, who is winning the 'Vibe' right now? Respond with a single number from 0 to 100. 0 means Team 1 is dominating, 100 means Team 2 is dominating. Respond ONLY with the number.`,
      config: { tools: [{ googleSearch: {} }] },
    });
    const val = parseInt(response.text?.trim() || "50");
    return isNaN(val) ? 50 : val;
  } catch (err) {
    return 50;
  }
}

/**
 * Enhanced score search with better formatting and error recovery.
 */
export async function getLiveScoreFromSearch() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Search for the real-time score of Super Bowl LIX (February 2025). Current time: ${now}. If the game hasn't started, find the most recent matchup details. Respond in this EXACT format: T1: [Name], S1: [Score], T2: [Name], S2: [Score], STATUS: [Scheduled/Live/Halftime/Final]`,
      config: { tools: [{ googleSearch: {} }] },
    });

    const text = response.text || "";
    const t1 = text.match(/T1:?\s*([\w\s]+),/i)?.[1] || "RAMS";
    const s1 = parseInt(text.match(/S1:?\s*(\d+)/i)?.[1] || "0");
    const t2 = text.match(/T2:?\s*([\w\s]+),/i)?.[1] || "SEAHAWKS";
    const s2 = parseInt(text.match(/S2:?\s*(\d+)/i)?.[1] || "0");
    const status = text.match(/STATUS:?\s*(\w+)/i)?.[1] || "LIVE";

    return { team1: t1, score1: s1, team2: t2, score2: s2, status: status.toUpperCase() };
  } catch (err) {
    console.error("Score Search Error:", err);
    return null;
  }
}

export async function getSidelineFact() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Give me one insane Super Bowl stat that will blow people's minds. Under 20 words.",
      config: { systemInstruction: "You are a data-obsessed NFL robot. Be punchy." }
    });
    return response.text || "Did you know? The Lombardi Trophy is made of sterling silver! 🏆";
  } catch (err) {
    return "Football is a game of inches! 📈";
  }
}
