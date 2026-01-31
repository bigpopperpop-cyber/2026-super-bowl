import { GoogleGenAI, Type } from "@google/genai";

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
        systemInstruction: "You are 'Coach SBLIX', a high-energy American Football commentator. You are covering Super Bowl LIX and the road to the championship. You provide hype, game analysis, and fun facts. Keep responses under 40 words and use sports slang like 'Gridiron', 'Endzone', and 'Lombardi Trophy'.",
        temperature: 1,
      }
    });
    
    return response.text || "Coach is speechless!";
  } catch (err) {
    console.error("Gemini Error:", err);
    return "The stadium signal is weak! The battle is heating up! 🏈";
  }
}

/**
 * Uses Google Search to verify specific game statistics for trivia settlement.
 */
export async function verifyPredictiveStats(questions: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const queries = questions.map(q => q.text).join(", ");
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Search for the current stats for Super Bowl LIX or the most recent NFL playoff game. Based on live box scores, determine the correct answer index (0 or 1) for these questions: ${queries}. Format your response as a JSON object where keys are the question text and values are the correct index (0 or 1).`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (err) {
    console.error("Verification Error:", err);
    return null;
  }
}

/**
 * Uses Google Search to find the current live score of the game.
 */
export async function getLiveScoreFromSearch() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const now = new Date().toLocaleString();
  
  try {
    // We search for Super Bowl LIX or the most current live NFL game
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Search for the live score of Super Bowl LIX (February 2025) or the most recent NFL game if that hasn't started yet. Current local time: ${now}. What is the score? Respond exactly in this format: TEAM1: [Name], SCORE1: [score], TEAM2: [Name], SCORE2: [score], STATUS: [Live/Scheduled/Final/Halftime]`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    // Flexible regex to catch names and scores
    const t1Match = text.match(/TEAM1:?\s*([\w\s]+),/i);
    const s1Match = text.match(/SCORE1:?\s*(\d+)/i);
    const t2Match = text.match(/TEAM2:?\s*([\w\s]+),/i);
    const s2Match = text.match(/SCORE2:?\s*(\d+)/i);
    const statusMatch = text.match(/STATUS:?\s*(\w+)/i);

    if (!s1Match || !s2Match) {
        return {
            rams: 0,
            seahawks: 0,
            isHalftime: false,
            status: 'Searching...',
            sources: []
        };
    }

    return {
      team1: t1Match ? t1Match[1].trim() : "TEAM A",
      rams: parseInt(s1Match[1]),
      team2: t2Match ? t2Match[1].trim() : "TEAM B",
      seahawks: parseInt(s2Match[1]),
      isHalftime: statusMatch ? statusMatch[1].toLowerCase() === 'halftime' : false,
      status: statusMatch ? statusMatch[1].toUpperCase() : 'LIVE',
      sources: sources.map((c: any) => c.web?.uri).filter(Boolean)
    };
  } catch (err) {
    console.error("Search Error:", err);
    return null;
  }
}

/**
 * Generates a deep-cut historical or statistical fact about the Super Bowl.
 */
export async function getSidelineFact() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Give me one legendary Super Bowl history fact or an obscure stat about Super Bowl LIX. Keep it under 30 words and very hype!",
      config: {
        systemInstruction: "You are 'SBLIX SIDELINE BOT'. You provide automated nuggets of football wisdom. Use 📊, 📉, 🤖.",
        temperature: 0.9,
      }
    });
    return response.text || "Super Bowl LIX is the ultimate stage! 🏟️";
  } catch (err) {
    return "NFL Fact: The Super Bowl is the most watched single-day sporting event in the US! 🏟️";
  }
}

/**
 * Generates a post-game summary.
 */
export async function getPostGameAnalysis(scoreData: any, leaderboard: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Game Finished. Score: ${scoreData.rams} to ${scoreData.seahawks}. Write a 60-word hype recap.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are Coach SBLIX. Recap the Super Bowl win with maximum energy.",
        temperature: 0.8,
      }
    });
    return response.text;
  } catch (err) {
    return "What a game! History was made tonight! 🏈🔥";
  }
}