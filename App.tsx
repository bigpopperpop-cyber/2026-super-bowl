import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';
// @ts-ignore
import { WebrtcProvider } from 'y-webrtc';
// @ts-ignore
import { WebsocketProvider } from 'y-websocket';
// @ts-ignore
import { IndexeddbPersistence } from 'y-indexeddb';
import { GoogleGenAI, Type } from "@google/genai";
import { User, PropBet, UserBet, GameState } from './types';

const STORAGE_KEY = 'sblix_user_v1';
const ROOM_ID = 'sblix-party-v1-main'; // Shared across all 20 devices

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<'bets' | 'standings'>('bets');
  const [gameState, setGameState] = useState<GameState>({ scoreHome: 0, scoreAway: 0, quarter: '1st', time: '15:00', possession: 'home', isGameOver: false });
  const [props, setProps] = useState<PropBet[]>([]);
  const [allBets, setAllBets] = useState<UserBet[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [presenceCount, setPresenceCount] = useState(0);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);

  // Mesh Sync Setup
  const doc = useMemo(() => new Y.Doc(), []);
  const sharedGame = doc.getMap<any>('gameState');
  const sharedProps = doc.getMap<PropBet>('props');
  const sharedBets = doc.getArray<UserBet>('userBets');
  const sharedUsers = doc.getMap<User>('users');

  useEffect(() => {
    if (!user) return;

    // Connect to Mesh
    const idb = new IndexeddbPersistence(ROOM_ID, doc);
    const webrtc = new WebrtcProvider(ROOM_ID, doc, { signaling: ['wss://signaling.yjs.dev'] });
    const ws = new WebsocketProvider('wss://demos.yjs.dev', ROOM_ID, doc);

    // Sync state to UI
    const sync = () => {
      setGameState(sharedGame.toJSON() as GameState);
      setProps(Object.values(sharedProps.toJSON() as Record<string, PropBet>));
      setAllBets(sharedBets.toArray());
      setAllUsers(Object.values(sharedUsers.toJSON() as Record<string, User>));
      setPresenceCount(ws.awareness.getStates().size);
    };

    sharedGame.observe(sync);
    sharedProps.observe(sync);
    sharedBets.observe(sync);
    sharedUsers.observe(sync);
    ws.awareness.on('change', sync);

    // Register user
    sharedUsers.set(user.id, user);
    sync();

    return () => {
      webrtc.destroy();
      ws.destroy();
      idb.destroy();
    };
  }, [user, doc, sharedGame, sharedProps, sharedBets, sharedUsers]);

  // AI Oracle Logic (Only runs for the first joined user/host to save API calls)
  useEffect(() => {
    if (!user || presenceCount === 0) return;
    
    const runOracle = async () => {
      // Create a fresh instance of GoogleGenAI before making an API call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Monitor Super Bowl LIX. Current score, quarter, time. 
          Suggest 2 new live prop bets for guests. Check if current props are resolved.`,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                homeScore: { type: Type.NUMBER },
                awayScore: { type: Type.NUMBER },
                quarter: { type: Type.STRING },
                time: { type: Type.STRING },
                newProps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      question: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      category: { type: Type.STRING }
                    },
                    required: ["id", "question", "options", "category"]
                  }
                }
              },
              required: ["homeScore", "awayScore", "quarter", "time", "newProps"]
            }
          }
        });

        // Use the .text property safely and handle grounding metadata
        const text = response.text;
        if (!text) return;

        // Extract grounding chunks if they exist
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
          setGroundingSources(chunks.filter((c: any) => c.web).map((c: any) => c.web));
        }

        const data = JSON.parse(text);
        // Sync to shared state
        doc.transact(() => {
          sharedGame.set('scoreHome', data.homeScore);
          sharedGame.set('scoreAway', data.awayScore);
          sharedGame.set('quarter', data.quarter);
          sharedGame.set('time', data.time);
          if (data.newProps && Array.isArray(data.newProps)) {
            data.newProps.forEach((p: any) => {
              if (!sharedProps.has(p.id)) {
                sharedProps.set(p.id, { ...p, resolved: false, isAiGenerated: true });
              }
            });
          }
        });
      } catch (e) {
        console.error("Oracle failed to huddle", e);
      }
    };

    const interval = setInterval(runOracle, 60000);
    // Trigger initial run
    runOracle();
    return () => clearInterval(interval);
  }, [presenceCount, user, doc, sharedGame, sharedProps]);

  const handleBet = (betId: string, selection: string) => {
    if (!user) return;
    const bet: UserBet = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      betId,
      selection,
      timestamp: Date.now()
    };
    sharedBets.push([bet]);
  };

  if (!user) return <Login onLogin={(u) => { setUser(u); localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); }} />;

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-[#020617] relative overflow-hidden">
      {/* Dynamic HUD */}
      <header className="p-4 pt-8 bg-slate-900/50 backdrop-blur-2xl border-b border-white/5 shrink-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <h1 className="font-orbitron font-black text-2xl italic tracking-tighter text-white uppercase">SBLIX <span className="text-emerald-400">SYNC</span></h1>
          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{presenceCount} MESHED</span>
          </div>
        </div>
        
        <div className="flex justify-between items-center bg-black/40 rounded-3xl p-6 border border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-indigo-500/5" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-500 mb-1 tracking-widest uppercase">HOME</span>
            <span className="text-5xl font-orbitron font-black text-white">{gameState.scoreHome || 0}</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <span className="text-[11px] font-black text-emerald-400 mb-0.5 tracking-widest uppercase">{gameState.quarter || 'LIVE'}</span>
            <span className="text-[10px] font-bold text-slate-400 font-mono tracking-widest">{gameState.time || '15:00'}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-500 mb-1 tracking-widest uppercase">AWAY</span>
            <span className="text-5xl font-orbitron font-black text-white">{gameState.scoreAway || 0}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-24 p-4 space-y-4">
        {activeTab === 'bets' ? (
          <BettingHub props={props} onBet={handleBet} user={user} bets={allBets} />
        ) : (
          <div className="space-y-4">
            <Standings users={allUsers} bets={allBets} props={props} />
            {groundingSources.length > 0 && (
              <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Live Sources</h4>
                <div className="flex flex-col gap-2">
                  {groundingSources.map((s, idx) => (
                    <a key={idx} href={s.uri} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-2">
                      <i className="fas fa-external-link-alt text-[8px]"></i>
                      {s.title || s.uri}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Persistent Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-slate-900/95 backdrop-blur-xl border-t border-white/5 flex pb-safe shadow-2xl z-50">
        <NavBtn active={activeTab === 'bets'} icon="fa-ticket" label="Pool" onClick={() => setActiveTab('bets')} />
        <NavBtn active={activeTab === 'standings'} icon="fa-trophy" label="Standings" onClick={() => setActiveTab('standings')} />
      </nav>
    </div>
  );
}

function NavBtn({ active, icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-all ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
      <i className={`fas ${icon} text-lg ${active ? 'scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''}`}></i>
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
      {active && <div className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5" />}
    </button>
  );
}

function BettingHub({ props, onBet, user, bets }: any) {
  return (
    <div className="space-y-4">
      {props.length === 0 && (
        <div className="p-12 text-center flex flex-col items-center gap-4 text-slate-600 opacity-50">
          <i className="fas fa-radar-alt text-4xl animate-spin-slow"></i>
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">AI Oracle Scouting Field...</p>
        </div>
      )}
      {props.map((p: PropBet) => {
        const myBet = bets.find((b: UserBet) => b.betId === p.id && b.userId === user.id);
        return (
          <div key={p.id} className="glass-card p-6 border-l-4 border-l-emerald-500/30">
            <div className="flex justify-between items-start mb-4">
              <span className="text-[9px] font-black px-2 py-0.5 bg-slate-800 rounded border border-white/5 text-slate-400 uppercase tracking-widest">{p.category}</span>
              {myBet && <span className="text-[9px] font-black text-emerald-400 flex items-center gap-1 uppercase tracking-widest"><i className="fas fa-lock"></i> Locked In</span>}
            </div>
            <h3 className="text-lg font-bold text-white mb-6 leading-tight">{p.question}</h3>
            <div className="grid grid-cols-2 gap-3">
              {p.options.map(opt => (
                <button
                  key={opt}
                  disabled={!!myBet || p.resolved}
                  onClick={() => onBet(p.id, opt)}
                  className={`py-4 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all border ${
                    myBet?.selection === opt ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' : 
                    myBet ? 'bg-slate-900 border-white/5 text-slate-600' :
                    'bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700 active:scale-95'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Standings({ users, bets, props }: any) {
  const standings = useMemo(() => {
    return users.map((u: User) => {
      let score = 1000;
      const userBets = bets.filter((b: UserBet) => b.userId === u.id);
      userBets.forEach((b: UserBet) => {
        const p = props.find((p: PropBet) => p.id === b.betId);
        if (p?.resolved) {
          score += p.winner === b.selection ? 500 : -200;
        }
      });
      return { ...u, score };
    }).sort((a: any, b: any) => b.score - a.score);
  }, [users, bets, props]);

  return (
    <div className="space-y-3">
      {standings.map((s: any, i: number) => (
        <div key={s.id} className="glass-card p-4 flex items-center justify-between border-white/5">
          <div className="flex items-center gap-4">
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</span>
            <div>
              <div className="font-bold text-sm text-white uppercase tracking-tight">{s.handle}</div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Team {s.team}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-orbitron font-black text-emerald-400">{s.score}</div>
            <div className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">Credits</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Login({ onLogin }: any) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState('HOME');
  return (
    <div className="fixed inset-0 bg-[#020617] flex items-center justify-center p-8 text-center">
      <div className="w-full max-w-xs space-y-12">
        <div className="space-y-4">
           <div className="w-20 h-20 bg-emerald-500 mx-auto rounded-[2rem] flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.3)] rotate-12">
             <i className="fas fa-eye text-black text-4xl"></i>
           </div>
           <h1 className="text-4xl font-orbitron font-black italic tracking-tighter text-white uppercase">SBLIX</h1>
           <p className="text-[10px] font-black text-emerald-500 tracking-[0.5em] uppercase">The Mesh Huddle</p>
        </div>
        
        <div className="space-y-4">
          <input 
            placeholder="HANDLE (E.G. TURBO)" 
            value={name} 
            onChange={e => setName(e.target.value.toUpperCase())}
            className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 text-white font-black text-center focus:border-emerald-500 outline-none transition-all placeholder:text-slate-700"
          />
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setTeam('HOME')} className={`p-4 rounded-2xl font-black text-[10px] border transition-all ${team === 'HOME' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-white/10 text-slate-500'}`}>HOME TEAM</button>
            <button onClick={() => setTeam('AWAY')} className={`p-4 rounded-2xl font-black text-[10px] border transition-all ${team === 'AWAY' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-white/10 text-slate-500'}`}>AWAY TEAM</button>
          </div>
          <button 
            disabled={!name}
            onClick={() => onLogin({ id: Math.random().toString(36).substr(2,9), handle: name, team, credits: 1000 })}
            className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 disabled:opacity-30 transition-all"
          >
            Join the Mesh
          </button>
        </div>
      </div>
    </div>
  );
}