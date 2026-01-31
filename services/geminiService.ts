
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Generates high-energy, tactical responses from the Live Combat Controller.
 */
export async function getCoachResponse(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are the 'SBLIX COMBAT CONTROLLER'. Your mission is to provide tactical, high-octane updates on Super Bowl LIX. Treat the game like a mission. Use military and sports jargon: 'Red Zone Breach', 'Tango Down', 'Air Raid', 'Gridiron Intelligence'. Keep it short, under 30 words.",
        temperature: 1,
      }
    });
    // Use .text property directly
    return response.text || "Eyes on the objective. 🏈";
  } catch (err) {
    return "Signal interference detected. Maintain visual on the gridiron. 📡";
  }
}

/**
 * Uses Search Grounding to analyze game intensity and momentum.
 */
export async function analyzeMomentum(scoreData: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const now = new Date().toLocaleString();
  try {
    // Note: guidelines suggest avoiding JSON parsing with googleSearch results as output may not be strictly JSON
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Tactical Assessment Request: Super Bowl LIX (Time: ${now}). Based on score (${scoreData.rams}-${scoreData.seahawks}), determine the Momentum Quotient (0-100). 0 is heavy Rams dominance, 100 is heavy Seahawks dominance. Detect 'Big Play' status. Respond in format: MOMENTUM: [number], BIG_PLAY: [true/false], INTEL: [text]`,
      config: { 
        tools: [{ googleSearch: {} }]
      },
    });
    
    const text = response.text || "";
    const momentum = parseInt(text.match(/MOMENTUM:?\s*(\d+)/i)?.[1] || "50");
    const isBigPlay = /BIG_PLAY:?\s*true/i.test(text);
    const intel = text.match(/INTEL:?\s*(.+)/i)?.[1] || "Scanning...";
    // MUST extract grounding chunks if Google Search is used
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { momentum, isBigPlay, intel, sources };
  } catch (err) {
    return { momentum: 50, isBigPlay: false, intel: "Objective Status: Uncertain.", sources: [] };
  }
}

/**
 * Enhanced score search for the Command Center.
 */
export async function getLiveScoreFromSearch() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Broadcast Intelligence Retrieval: Super Bowl LIX. Current time: ${now}. Fetch real-time status. Respond in format: T1: [Name], S1: [Score], T2: [Name], S2: [Score], STATUS: [Scheduled/Live/Halftime/Final]`,
      config: { tools: [{ googleSearch: {} }] },
    });

    const text = response.text || "";
    const t1 = text.match(/T1:?\s*([\w\s]+),/i)?.[1] || "RAMS";
    const s1 = parseInt(text.match(/S1:?\s*(\d+)/i)?.[1] || "0");
    const t2 = text.match(/T2:?\s*([\w\s]+),/i)?.[1] || "SEAHAWKS";
    const s2 = parseInt(text.match(/S2:?\s*(\d+)/i)?.[1] || "0");
    const status = text.match(/STATUS:?\s*(\w+)/i)?.[1] || "LIVE";
    // MUST extract grounding chunks if Google Search is used
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { team1: t1, score1: s1, team2: t2, score2: s2, status: status.toUpperCase(), sources };
  } catch (err) {
    return null;
  }
}

export async function getSidelineFact() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Intelligence Snippet: Super Bowl historical tactical error or legendary play. Max 15 words.",
      config: { systemInstruction: "You are the SBLIX Intel Officer." }
    });
    return response.text || "Objective: Win the Lombardi Trophy.";
  } catch (err) {
    return "Every yard counts. 📊";
  }
}
