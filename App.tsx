
import React, { useState, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { 
  parseDraws, 
  getFrequencies, 
  calculateDelays, 
  checkPacha, 
  getGrupoA, 
  getGrupoB, 
  getGrupoC, 
  getGrupoD, 
  generateMatrix, 
  combinePairs,
  analyzePatterns,
  checkPredictions,
  getDiagonal,
  filterFinalChoice
} from './utils/logic';
import { LOTTERY_CATEGORIES } from './utils/lotteries';
import { Draw } from './types';

export default function App() {
  const [inputText, setInputText] = useState("");
  const [selectedLottery, setSelectedLottery] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<{uri: string, title?: string}[]>([]);

  const fetchLotteryResults = async (lotteryName: string) => {
    setIsFetching(true);
    setError(null);
    setSources([]);
    setSelectedLottery(lotteryName);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Resultados de 4 cifras para "${lotteryName}" hasta ${selectedDate}. 
      Busca en astroluna.co o similares. Responde SOLO los 15 números más recientes separados por comas.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { 
          tools: [{ googleSearch: {} }],
          temperature: 0.1 
        },
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
        const foundSources = groundingChunks
          .map((chunk: any) => chunk.web)
          .filter((web: any) => web && web.uri);
        setSources(foundSources);
      }

      const text = response.text || "";
      const extracted = text.match(/\d{4}/g);
      
      if (extracted && extracted.length >= 5) {
        setInputText(extracted.slice(0, 15).join("\n"));
      } else {
        throw new Error("No se obtuvieron suficientes resultados.");
      }
    } catch (err: any) {
      setError(err.message || "Error al conectar con la fuente.");
    } finally {
      setIsFetching(false);
    }
  };

  const allHistory = useMemo(() => parseDraws(inputText), [inputText]);
  
  const stats = useMemo(() => {
    if (allHistory.length < 5) return null;

    const history15 = allHistory.slice(0, 15);
    const digitFreq = getFrequencies(history15);
    
    const grupoA = getGrupoA(history15, digitFreq);
    const grupoB = getGrupoB(history15, digitFreq);
    const grupoC = getGrupoC(history15, digitFreq);
    const grupoD = getGrupoD(grupoB.b1, grupoB.b2, grupoC.c1, grupoC.c2, history15);
    
    // Matrix size: 6x6
    const matrix = generateMatrix(grupoA, grupoD);
    const patterns = analyzePatterns(history15, grupoA, grupoB.b1, grupoB.b2, grupoC.c1, grupoC.c2);
    const predictionHits = checkPredictions(matrix, allHistory);
    const diagonal = getDiagonal(matrix);

    // Master Choice Logic: Score all matrix candidates
    const flatMatrix = Array.from(new Set(matrix.flat()));
    const topFreq = Number(Object.entries(digitFreq).sort((a,b) => b[1] - a[1])[0][0]);
    const topRacha = grupoC.c1;
    
    // Calculate position frequency for each digit
    const posFreqs: Record<number, number>[] = [{}, {}, {}, {}];
    history15.forEach(d => {
      d.digits.forEach((digit, idx) => {
        posFreqs[idx][digit] = (posFreqs[idx][digit] || 0) + 1;
      });
    });

    const scoredPool = flatMatrix.map(num => {
      const dArr = num.split('').map(Number);
      const latestDigits = allHistory[0].digits;
      let score = 0;
      
      // 1. Freq & Racha (Base)
      const avgFreq = dArr.reduce((acc, d) => acc + (digitFreq[d] || 0), 0) / 4;
      const avgDelay = dArr.reduce((acc, d) => {
        const delayObj = grupoC.all.find((g: any) => g.digit === d);
        return acc + (delayObj?.racha || 0);
      }, 0) / 4;
      score += (avgFreq * 5) + (avgDelay * 10);

      // Pattern 1: Pachas
      const isPacha = checkPacha(dArr);
      if (isPacha === (patterns.pachas.percent > 40)) score += 30;

      // Pattern 2: Repetition (2+ digits from latest)
      const repCount = dArr.filter(d => latestDigits.includes(d)).length;
      if (repCount >= 2) score += 25;

      // Pattern 3 & 4: Position (Check if pairs match predicted positions)
      const p12 = `${dArr[0]}${dArr[1]}`;
      const p34 = `${dArr[2]}${dArr[3]}`;
      if (patterns.posTarget.best === '12' && grupoA.some(a => a.pair === p12)) score += 15;
      if (patterns.posTarget.best === '34' && grupoD.some(d => d.p === p34)) score += 15;

      // Pattern 5: Group Strength
      const inA = dArr.some(d => grupoA.some(ga => ga.pair.includes(d.toString())));
      const inC = dArr.includes(grupoC.c1) || dArr.includes(grupoC.c2);
      if (patterns.groups.prediction.includes("A") && inA) score += 20;
      if (patterns.groups.prediction.includes("C") && inC) score += 20;

      return { num, score };
    });

    const sortedPool = scoredPool.sort((a, b) => b.score - a.score);
    const pachaChoice = sortedPool.find(c => checkPacha(c.num.split('').map(Number)));
    const nonPachaChoices = sortedPool.filter(c => !checkPacha(c.num.split('').map(Number))).slice(0, 2);
    
    const masterChoices = [];
    if (pachaChoice) masterChoices.push(pachaChoice);
    masterChoices.push(...nonPachaChoices);
    
    // Fill if missing
    if (masterChoices.length < 3) {
      const used = new Set(masterChoices.map(m => m.num));
      const extra = sortedPool.filter(c => !used.has(c.num)).slice(0, 3 - masterChoices.length);
      masterChoices.push(...extra);
    }
    
    masterChoices.sort((a, b) => b.score - a.score);

    const finalChoice = masterChoices[0].num; // Use top scored as final choice
    const pairA = grupoA[0].pair;
    const pairB = `${grupoB.b1}${grupoB.b2}`;
    const pairC = `${grupoC.c1}${grupoC.c2}`;

    return {
      grupoA,
      grupoB,
      grupoC,
      grupoD,
      matrix,
      patterns,
      masterChoices,
      pairA,
      pairB,
      pairC,
      topFreqDigit: topFreq,
      topRachaDigit: topRacha,
      predictionHits,
      diagonal,
      finalChoice
    };
  }, [allHistory]);

  return (
    <div className="min-h-screen bg-black text-[#bf953f] p-2 md:p-4 relative overflow-hidden selection:bg-[#bf953f]/30 selection:text-white">
      {/* Decorative Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-900/10 blur-[180px] rounded-full -z-10"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-900/10 blur-[180px] rounded-full -z-10"></div>

      <header className="max-w-4xl mx-auto mb-4 md:mb-6 text-center space-y-1">
        <div className="inline-block px-3 py-1 bg-black/40 border border-[#bf953f]/30 rounded-full mb-1 shadow-sm">
          <p className="text-[7px] md:text-[8px] font-black gold-text uppercase tracking-[0.3em]">Algoritmo de Prosperidad Suprema</p>
        </div>
        <h1 className="text-3xl md:text-5xl font-luxury font-black tracking-tighter mb-1 gold-gradient drop-shadow-2xl text-balance leading-tight">
          MÉTODO PATRÓN INTELIGENTE
        </h1>
        
        <div className="flex flex-col items-center gap-3 mt-2">
          <div className="flex items-center gap-2 bg-black/40 border border-[#bf953f]/30 px-3 py-1.5 rounded-xl">
            <i className="fa-solid fa-calendar-day gold-text text-[10px]"></i>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent gold-text text-[10px] font-black outline-none border-none [color-scheme:dark]"
            />
          </div>
          
          {stats && (
            <button 
              onClick={() => { setInputText(""); setSources([]); }} 
              className="px-6 py-1.5 bg-black/40 border border-[#bf953f]/40 hover:bg-[#bf953f]/10 rounded-full text-[9px] font-luxury font-black uppercase tracking-widest transition-all duration-500 gold-text shadow-sm hover:shadow-[#bf953f]/50 transform hover:-translate-y-0.5"
            >
              Nueva Consulta
            </button>
          )}
        </div>
      </header>

      {!stats && !isFetching && (
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="glass-panel p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] soft-shadow container-glow border-[#bf953f]/20">
            <h2 className="text-lg md:text-xl font-luxury font-black mb-4 flex items-center gap-3 gold-text justify-center">
              <i className="fa-solid fa-crown gold-text"></i> NACIONALES
            </h2>
            <div className="space-y-6">
              {LOTTERY_CATEGORIES.traditional.map(cat => (
                <div key={cat.day} className="space-y-3">
                  <p className="text-[9px] md:text-[10px] font-black gold-text opacity-60 uppercase tracking-[0.3em] border-b border-[#bf953f]/20 pb-1 text-center">
                    {cat.day}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {cat.items.map(l => (
                      <button 
                        key={l} 
                        onClick={() => fetchLotteryResults(l)} 
                        className="px-2 py-2 bg-black/40 border border-[#bf953f]/20 hover:border-[#bf953f] hover:bg-[#bf953f]/10 rounded-xl text-[9px] md:text-[10px] uppercase font-black transition-all duration-300 gold-text shadow-sm hover:shadow-md text-center"
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] soft-shadow container-glow border-[#bf953f]/20">
            <h2 className="text-lg md:text-xl font-luxury font-black mb-4 flex items-center gap-3 gold-text justify-center">
              <i className="fa-solid fa-bolt gold-text"></i> DIARIAS
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {LOTTERY_CATEGORIES.daily.map(l => (
                <button 
                  key={l} 
                  onClick={() => fetchLotteryResults(l)} 
                  className="px-2 py-2 bg-black/40 border border-[#bf953f]/20 hover:border-[#bf953f] hover:bg-[#bf953f]/10 rounded-xl text-[9px] md:text-[10px] uppercase font-black transition-all duration-300 gold-text shadow-sm hover:shadow-md text-center"
                >
                  {l}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {isFetching && (
        <div className="max-w-md mx-auto text-center py-16 md:py-20 space-y-6">
          <div className="relative inline-block">
            <div className="w-20 h-20 md:w-24 md:h-24 border-4 border-[#bf953f]/20 border-t-[#bf953f] rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <i className="fa-solid fa-brain gold-text text-xl md:text-2xl animate-pulse"></i>
            </div>
          </div>
          <p className="gold-text font-luxury font-bold text-base md:text-lg tracking-widest animate-pulse uppercase">Analizando historial...</p>
          <p className="gold-text opacity-40 text-[10px] uppercase tracking-widest">Consultando fuentes oficiales</p>
        </div>
      )}

      {error && (
        <div className="max-w-md mx-auto bg-red-900/20 border border-red-500/50 p-6 rounded-2xl text-center">
          <i className="fa-solid fa-circle-exclamation text-red-500 text-2xl mb-4"></i>
          <p className="text-red-200 font-bold mb-4 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="px-6 py-2 bg-red-500 text-white rounded-full text-[10px] font-bold uppercase">Reintentar</button>
        </div>
      )}

      {stats && (
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          {/* Header Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-panel p-3 md:p-4 rounded-2xl border-l-4 border-l-amber-600">
              <p className="text-[8px] md:text-[9px] font-black gold-text opacity-70 uppercase tracking-widest mb-1">Par A</p>
              <p className="text-xl md:text-3xl font-luxury font-black gold-text">{stats.pairA}</p>
            </div>
            <div className="glass-panel p-3 md:p-4 rounded-2xl border-l-4 border-l-amber-500">
              <p className="text-[8px] md:text-[9px] font-black gold-text opacity-70 uppercase tracking-widest mb-1">Par B</p>
              <p className="text-xl md:text-3xl font-luxury font-black gold-text">{stats.pairB}</p>
            </div>
            <div className="glass-panel p-3 md:p-4 rounded-2xl border-l-4 border-l-amber-700">
              <p className="text-[8px] md:text-[9px] font-black gold-text opacity-70 uppercase tracking-widest mb-1">Par C</p>
              <p className="text-xl md:text-3xl font-luxury font-black gold-text">{stats.pairC}</p>
            </div>
          </div>

          {/* Últimos 3 Resultados */}
          <div className="glass-panel p-3 md:p-4 rounded-xl soft-shadow max-w-2xl mx-auto">
            <h3 className="text-[10px] md:text-xs font-luxury font-bold mb-2 flex items-center gap-2 gold-text justify-center">
              <i className="fa-solid fa-history gold-text"></i> Últimos 3: {selectedLottery}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {allHistory.slice(0, 3).map((draw, i) => (
                <div key={i} className="bg-black/40 p-1.5 md:p-2 rounded-lg border border-[#bf953f]/10 text-center">
                  <p className="text-[6px] md:text-[7px] font-black gold-text opacity-50 uppercase tracking-widest mb-0.5">
                    {i === 0 ? "Actual" : i === 1 ? "Previo" : "Anterior"}
                  </p>
                  <p className="text-sm md:text-lg font-mono font-black gold-text tracking-widest">{draw.full}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Matrix Section */}
            <div className="lg:col-span-3 space-y-4">
              <div className="glass-panel p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] soft-shadow overflow-hidden w-full">
                <h3 className="text-sm md:text-base font-luxury font-bold mb-3 flex items-center gap-2 gold-text">
                  <i className="fa-solid fa-table-cells gold-text"></i> Matriz 6x6
                </h3>
                <div className="overflow-x-auto -mx-2 px-2 pb-1">
                  <table className="w-full border-collapse min-w-[500px]">
                    <thead>
                      <tr>
                        <th className="p-1"></th>
                        {stats.grupoD.map((d, i) => (
                          <th key={i} className="p-1 text-[7px] md:text-[8px] font-black gold-text uppercase tracking-tighter">
                            D{i+1} ({d.p}) <br/> 
                            <span className="opacity-50">Frec: {d.pairCount} | Dem: {d.delay}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.matrix.map((row, i) => (
                        <tr key={i} className="border-t border-[#bf953f]/10">
                          <td className="p-1 text-[7px] md:text-[8px] font-black gold-text uppercase tracking-tighter">
                            A{i+1} ({stats.grupoA[i].pair}) <br/>
                            <span className="opacity-50">Frec: {stats.grupoA[i].pairCount}</span>
                          </td>
                          {row.map((cell, j) => {
                            const isDiagonal = i === j;
                            const hasTopDigit = cell.includes(stats.topFreqDigit.toString());
                            return (
                              <td key={j} className="p-0.5 md:p-1 text-center">
                                <span className={`text-[10px] md:text-sm font-mono font-bold tracking-widest px-1.5 py-0.5 rounded border ${
                                  isDiagonal ? 'bg-[#bf953f]/20 border-[#bf953f] gold-text' : 
                                  hasTopDigit ? 'bg-white/10 border-white/20 text-white' : 
                                  'bg-black/40 border-[#bf953f]/10 gold-text'
                                }`}>
                                  {cell}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Final Choice */}
              <div className="space-y-4">
                <div className="glass-panel p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] soft-shadow border-2 border-[#bf953f]/20">
                  <h3 className="text-base md:text-xl font-luxury font-bold mb-5 flex items-center gap-2 gold-text justify-center uppercase">
                    <i className="fa-solid fa-crown gold-text"></i> 3 ELECCIONES MAESTRAS - {selectedLottery}
                  </h3>
                  <div className="flex justify-center">
                    <div className="bg-black/40 p-6 md:p-10 rounded-[1.5rem] md:rounded-[2rem] text-center border border-[#bf953f]/30 shadow-2xl w-full relative overflow-hidden">
                      <div className="grid grid-cols-3 gap-4 divide-x divide-[#bf953f]/20">
                        {stats.masterChoices.map((choice, idx) => (
                          <div key={idx} className="px-2 transform hover:scale-110 transition-transform">
                            <p className="text-[10px] md:text-xs font-luxury font-black gold-gradient uppercase tracking-widest mb-2">
                              #{idx + 1}
                            </p>
                            <p className="text-3xl md:text-5xl font-luxury font-black gold-gradient tracking-[0.1em] drop-shadow-lg">
                              {choice.num}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-8 md:p-12 rounded-[1.5rem] md:rounded-[2rem] soft-shadow border-4 border-orange-500/40 bg-orange-950/20">
                  <h3 className="text-lg md:text-2xl font-luxury font-bold mb-6 flex items-center gap-3 text-orange-500 justify-center uppercase">
                    <i className="fa-solid fa-fire text-orange-500 animate-bounce text-2xl"></i> ELECCIÓN FINAL MAESTRA - {selectedLottery}
                  </h3>
                  <div className="flex justify-center">
                    <div className="bg-orange-900/30 p-10 md:p-16 rounded-[1.5rem] md:rounded-[2rem] text-center border border-orange-500/60 shadow-[0_0_60px_rgba(249,115,22,0.4)] w-full relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-t from-orange-500/20 to-transparent"></div>
                      <p className="text-xs md:text-sm font-luxury font-black text-orange-400 uppercase tracking-[0.4em] mb-4">Máximo Cumplimiento de Patrones</p>
                      <p className="text-7xl md:text-9xl font-luxury font-black text-orange-500 tracking-[0.2em] drop-shadow-[0_0_30px_rgba(249,115,22,0.7)] animate-pulse">
                        {stats.finalChoice}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Patterns Section */}
            <div className="space-y-4">
              <div className="glass-panel p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] soft-shadow">
                <h3 className="text-xs md:text-sm font-luxury font-bold mb-3 flex items-center gap-2 gold-text">
                  <i className="fa-solid fa-calculator gold-text"></i> Estadísticas de Dígitos
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] md:text-xs">
                    <thead>
                      <tr className="gold-text opacity-60 border-b border-[#bf953f]/20">
                        <th className="p-1 text-left">D</th>
                        <th className="p-1 text-center">Frec</th>
                        <th className="p-1 text-right">Dem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.grupoC.all.map((item: any) => {
                        const isTopFreq = item.freq === Math.max(...stats.grupoC.all.map((d: any) => d.freq));
                        const isTopDelay = item.racha === Math.max(...stats.grupoC.all.map((d: any) => d.racha));
                        return (
                          <tr key={item.digit} className="border-b border-[#bf953f]/5">
                            <td className="p-1 font-bold gold-text">{item.digit}</td>
                            <td className={`p-1 text-center ${isTopFreq ? 'bg-green-500/20 text-green-400 rounded px-1 font-black' : 'gold-text'}`}>
                              {item.freq}
                            </td>
                            <td className={`p-1 text-right ${isTopDelay ? 'bg-red-500/20 text-red-400 rounded px-1 font-black' : 'gold-text opacity-70'}`}>
                              {item.racha}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-panel p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] soft-shadow border-l-4 border-l-green-500">
                <h3 className="text-xs md:text-sm font-luxury font-bold mb-2 flex items-center gap-2 gold-text">
                  <i className="fa-solid fa-bullseye gold-text"></i> Patrón Aciertos
                </h3>
                <p className="text-[9px] gold-text opacity-60 uppercase mb-3">Historial 15 Sorteos</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-black/40 p-2 rounded-xl border border-green-500/20 text-center">
                    <p className="text-[10px] font-black text-green-400">{stats.predictionHits.hits4}</p>
                    <p className="text-[7px] font-bold gold-text opacity-40 uppercase">4 Cifras</p>
                  </div>
                  <div className="bg-black/40 p-2 rounded-xl border border-green-500/20 text-center">
                    <p className="text-[10px] font-black text-green-400">{stats.predictionHits.hits3}</p>
                    <p className="text-[7px] font-bold gold-text opacity-40 uppercase">3 Cifras</p>
                  </div>
                </div>
              </div>
              <div className="glass-panel p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] soft-shadow">
                <h3 className="text-xs md:text-sm font-luxury font-bold mb-4 flex items-center gap-2 gold-text">
                  <i className="fa-solid fa-chart-line gold-text"></i> Auditoría
                </h3>
                
                <div className="space-y-4">
                  {/* Pattern 1 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[7px] md:text-[8px] font-black uppercase tracking-widest gold-text opacity-40">
                      <span>Pachas</span>
                      <span className="gold-text">{stats.patterns.pachas.percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-1 bg-[#bf953f]/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#bf953f]" style={{ width: `${stats.patterns.pachas.percent}%` }}></div>
                    </div>
                  </div>

                  {/* Pattern 2 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[7px] md:text-[8px] font-black uppercase tracking-widest gold-text opacity-40">
                      <span>Repetición</span>
                      <span className="gold-text">{stats.patterns.rep2.percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-1 bg-[#bf953f]/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#bf953f]" style={{ width: `${stats.patterns.rep2.percent}%` }}></div>
                    </div>
                  </div>

                  {/* Pattern 3 & 4 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/40 p-2 rounded-xl border border-[#bf953f]/10 text-center">
                      <p className="text-[6px] font-black gold-text opacity-40 uppercase">Origen</p>
                      <p className="text-xs md:text-sm font-luxury font-black gold-text">{stats.patterns.posOrigin.best}</p>
                    </div>
                    <div className="bg-black/40 p-2 rounded-xl border border-[#bf953f]/10 text-center">
                      <p className="text-[6px] font-black gold-text opacity-40 uppercase">Destino</p>
                      <p className="text-xs md:text-sm font-luxury font-black gold-text">{stats.patterns.posTarget.best}</p>
                    </div>
                  </div>

                  {/* Pattern 5 */}
                  <div className="space-y-2 pt-2 border-t border-[#bf953f]/10">
                    <p className="text-[7px] font-black gold-text opacity-40 uppercase mb-1">Fuerza de Grupos</p>
                    <div className="flex justify-between gap-1">
                      <div className="text-center flex-1">
                        <p className="text-[6px] font-bold gold-text opacity-60">A (Recientes)</p>
                        <p className="text-[9px] font-black gold-text">{stats.patterns.groups.A.toFixed(0)}%</p>
                      </div>
                      <div className="text-center flex-1">
                        <p className="text-[6px] font-bold gold-text opacity-60">B (Rescate)</p>
                        <p className="text-[9px] font-black gold-text">{stats.patterns.groups.B.toFixed(0)}%</p>
                      </div>
                      <div className="text-center flex-1">
                        <p className="text-[6px] font-bold gold-text opacity-60">C (Atrasados)</p>
                        <p className="text-[9px] font-black gold-text">{stats.patterns.groups.C.toFixed(0)}%</p>
                      </div>
                    </div>
                    <p className="text-[8px] font-black gold-text text-center mt-1">{stats.patterns.groups.prediction}</p>
                  </div>
                </div>
              </div>

              {/* Sources */}
              {sources.length > 0 && (
                <div className="glass-panel p-3 rounded-xl soft-shadow">
                  <div className="space-y-1">
                    {sources.slice(0, 2).map((s, i) => (
                      <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="block text-[7px] gold-text hover:opacity-70 truncate underline">
                        {s.title || s.uri}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-4xl mx-auto mt-4 md:mt-6 pt-4 border-t border-[#bf953f]/10 text-center">
        <p className="text-[7px] md:text-[8px] font-black gold-text opacity-40 uppercase tracking-[0.4em]">Patrón Inteligente • 2026</p>
      </footer>
    </div>
  );
}
