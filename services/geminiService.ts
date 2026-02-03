
import { GoogleGenAI } from "@google/genai";

function getAI() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export async function getCoachResponse(prompt: string) {
  const ai = getAI();
  if (!ai) return "Signal lost. 📡";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are the 'SUPER BOWL LX COMMAND CONTROLLER'. Provide high-stakes tactical updates for the New England vs Seattle matchup in 2026. Use military/football jargon. Keep it under 25 words.",
        temperature: 0.9,
      }
    });
    return response.text || "Hold the line. 🏈";
  } catch (err) { return "Interference detected. 📡"; }
}

export async function analyzeMomentum(scoreData: any) {
  const ai = getAI();
  if (!ai) return { momentum: 50, isBigPlay: false, intel: "Scanning...", sources: [], redzoneTeam: null };
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Tactical Analysis: SB LX (Patriots vs Seahawks) at Levi's Stadium. Current Score (${scoreData.t1}-${scoreData.t2}). Provide: Momentum (0-100), Big Play status (bool), Redzone status (Team/None), and 10-word Intel briefing. Format: MOMENTUM: [num], BIG_PLAY: [bool], REDZONE: [Team/None], INTEL: [text]`,
      config: { tools: [{ googleSearch: {} }] },
    });
    
    const text = response.text || "";
    const momentum = parseInt(text.match(/MOMENTUM:?\s*(\d+)/i)?.[1] || "50");
    const isBigPlay = /BIG_PLAY:?\s*true/i.test(text);
    const redzoneMatch = text.match(/REDZONE:?\s*([\w\s]+)/i);
    const redzoneTeam = (redzoneMatch?.[1]?.trim().toUpperCase() === 'NONE' || !redzoneMatch?.[1]) ? null : redzoneMatch[1].trim();
    const intel = text.match(/INTEL:?\s*(.+)/i)?.[1] || "Monitoring situation...";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { momentum, isBigPlay, intel, sources, redzoneTeam };
  } catch (err) {
    return { momentum: 50, isBigPlay: false, intel: "Analyzing feed...", sources: [], redzoneTeam: null };
  }
}

export async function getDetailedStats() {
  const ai = getAI();
  if (!ai) return null;
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Get real-time detailed box score stats for Super Bowl LX (New England vs Seattle). 
      Format exactly: 
      PATRIOTS_YDS: [num], SEAHAWKS_YDS: [num], 
      PATRIOTS_PASS: [name num YDS], SEAHAWKS_PASS: [name num YDS],
      PATRIOTS_RUSH: [name num YDS], SEAHAWKS_RUSH: [name num YDS],
      TURNOVERS: [num]`,
      config: { tools: [{ googleSearch: {} }] },
    });
    const text = response.text || "";
    return {
      pYds: text.match(/PATRIOTS_YDS:?\s*(\d+)/i)?.[1] || "0",
      sYds: text.match(/SEAHAWKS_YDS:?\s*(\d+)/i)?.[1] || "0",
      pPass: text.match(/PATRIOTS_PASS:?\s*(.+?)(?=,|$)/i)?.[1] || "N/A",
      sPass: text.match(/SEAHAWKS_PASS:?\s*(.+?)(?=,|$)/i)?.[1] || "N/A",
      pRush: text.match(/PATRIOTS_RUSH:?\s*(.+?)(?=,|$)/i)?.[1] || "N/A",
      sRush: text.match(/SEAHAWKS_RUSH:?\s*(.+?)(?=,|$)/i)?.[1] || "N/A",
      turnovers: text.match(/TURNOVERS:?\s*(\d+)/i)?.[1] || "0",
      raw: text
    };
  } catch (e) { return null; }
}

export async function getLiveScoreFromSearch() {
  const ai = getAI();
  if (!ai) return null;
  const now = new Date().toLocaleString();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Retrieval: LIVE SCORE Super Bowl LX (New England Patriots vs Seattle Seahawks). Time: ${now}. Format: T1: [New England], S1: [Score], T2: [Seattle], S2: [Score], STATUS: [Live/Pre/Final]`,
      config: { tools: [{ googleSearch: {} }] },
    });
    const text = response.text || "";
    const t1 = text.match(/T1:?\s*([\w\s]+)/i)?.[1] || "NEW ENGLAND";
    const s1 = parseInt(text.match(/S1:?\s*(\d+)/i)?.[1] || "0");
    const t2 = text.match(/T2:?\s*([\w\s]+)/i)?.[1] || "SEATTLE";
    const s2 = parseInt(text.match(/S2:?\s*(\d+)/i)?.[1] || "0");
    const status = text.match(/STATUS:?\s*(\w+)/i)?.[1] || "PRE-GAME";
    return { team1: t1, score1: s1, team2: t2, score2: s2, status: status.toUpperCase(), sources: [] };
  } catch (err) { return null; }
}

export async function getSidelineFact() {
  const ai = getAI();
  if (!ai) return "Mission: Glory.";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Super Bowl LX historical fact or 2026 matchup tidbit (Patriots/Seahawks). 15 words max.",
    });
    return response.text || "History is happening. 📊";
  } catch (err) { return "Secure line. 📊"; }
}
