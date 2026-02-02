
import { GoogleGenAI } from "@google/genai";

/**
 * Safely initialize the AI client.
 */
function getAI() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("SBLIX INTEL ERROR: API_KEY not found in environment.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Generates high-energy, tactical responses from the Live Combat Controller.
 */
export async function getCoachResponse(prompt: string) {
  const ai = getAI();
  if (!ai) return "Signal lost. 📡";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are the 'SBLIX COMBAT CONTROLLER'. Mission: Tactical Super Bowl LIX updates. Use military jargon: 'Red Zone Breach', 'Tango Down', 'Air Raid'. Keep it under 25 words.",
        temperature: 0.9,
      }
    });
    return response.text || "Eyes on the objective. 🏈";
  } catch (err) {
    return "Signal interference detected. 📡";
  }
}

/**
 * Uses Search Grounding to analyze game intensity and momentum.
 */
export async function analyzeMomentum(scoreData: any) {
  const ai = getAI();
  if (!ai) return { momentum: 50, isBigPlay: false, intel: "Interference.", sources: [] };
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Tactical Assessment: SB LIX (${now}). Score (${scoreData.rams}-${scoreData.seahawks}). Determine Momentum (0-100). 0=Rams, 100=Seahawks. Format: MOMENTUM: [num], BIG_PLAY: [bool], INTEL: [text]`,
      config: { tools: [{ googleSearch: {} }] },
    });
    
    const text = response.text || "";
    const momentum = parseInt(text.match(/MOMENTUM:?\s*(\d+)/i)?.[1] || "50");
    const isBigPlay = /BIG_PLAY:?\s*true/i.test(text);
    const intel = text.match(/INTEL:?\s*(.+)/i)?.[1] || "Scanning...";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { momentum, isBigPlay, intel, sources };
  } catch (err) {
    return { momentum: 50, isBigPlay: false, intel: "Objective Status: Uncertain.", sources: [] };
  }
}

export async function getLiveScoreFromSearch() {
  const ai = getAI();
  if (!ai) return null;
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Intelligence Retrieval: SB LIX. Time: ${now}. Format: T1: [Name], S1: [Score], T2: [Name], S2: [Score], STATUS: [Live/Final]`,
      config: { tools: [{ googleSearch: {} }] },
    });

    const text = response.text || "";
    const t1 = text.match(/T1:?\s*([\w\s]+),/i)?.[1] || "RAMS";
    const s1 = parseInt(text.match(/S1:?\s*(\d+)/i)?.[1] || "0");
    const t2 = text.match(/T2:?\s*([\w\s]+),/i)?.[1] || "SEAHAWKS";
    const s2 = parseInt(text.match(/S2:?\s*(\d+)/i)?.[1] || "0");
    const status = text.match(/STATUS:?\s*(\w+)/i)?.[1] || "LIVE";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { team1: t1, score1: s1, team2: t2, score2: s2, status: status.toUpperCase(), sources };
  } catch (err) {
    return null;
  }
}

export async function getSidelineFact() {
  const ai = getAI();
  if (!ai) return "Objective: Win the Lombardi.";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Super Bowl historical tactical play or legend fact. 15 words max.",
    });
    return response.text || "Every yard counts. 📊";
  } catch (err) {
    return "Status: Operational. 📊";
  }
}
