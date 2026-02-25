
import { Draw, DigitDelay, PatternSummary } from '../types';

export const parseDraws = (text: string): Draw[] => {
  return text
    .split(/\n|,/)
    .map(line => line.trim())
    .filter(line => line.length >= 4)
    .map(line => {
      const digits = line.slice(0, 4).split('').map(Number);
      return { digits, full: line.slice(0, 4) };
    });
};

export const getFrequencies = (history: Draw[]) => {
  const digitFreq: Record<number, number> = {};
  history.forEach(draw => {
    draw.digits.forEach(d => {
      digitFreq[d] = (digitFreq[d] || 0) + 1;
    });
  });
  return digitFreq;
};

export const calculateDelays = (history: Draw[]): DigitDelay[] => {
  const delays: DigitDelay[] = [];
  for (let i = 0; i <= 9; i++) {
    let delay = 0;
    for (let j = 0; j < history.length; j++) {
      if (history[j].digits.includes(i)) {
        break;
      }
      delay++;
    }
    delays.push({ digit: i, delay: delay, racha: delay });
  }
  return delays;
};

export const checkPacha = (digits: number[]): boolean => {
  return new Set(digits).size < digits.length;
};

const POS_INDICES: Record<string, [number, number]> = {
  '12': [0, 1], '13': [0, 2], '14': [0, 3],
  '23': [1, 2], '24': [1, 3], '34': [2, 3]
};

export const getGrupoA = (history: Draw[], digitFreq: Record<number, number>) => {
  const positions = ['12', '13', '14', '23', '24', '34'];
  const latest = history[0];
  const hasPacha = checkPacha(latest.digits);
  const topDigit = Number(Object.entries(digitFreq).sort((a, b) => b[1] - a[1])[0][0]);

  // Pre-calculate pair counts for all positions in one pass
  const pairCountsInHistory: Record<string, number> = {};
  history.forEach(h => {
    positions.forEach(pos => {
      const [idx1, idx2] = POS_INDICES[pos];
      const p = `${h.digits[idx1]}${h.digits[idx2]}`;
      pairCountsInHistory[p] = (pairCountsInHistory[p] || 0) + 1;
    });
  });

  const latestPairs = positions.map(pos => {
    const [idx1, idx2] = POS_INDICES[pos];
    const pairStr = `${latest.digits[idx1]}${latest.digits[idx2]}`;
    const d1 = Number(pairStr[0]);
    const d2 = Number(pairStr[1]);
    const accumulatedFreq = (digitFreq[d1] || 0) + (digitFreq[d2] || 0);
    const pairCount = pairCountsInHistory[pairStr] || 0;

    return { 
      pair: pairStr, 
      freq: accumulatedFreq, 
      pairCount,
      bestPos: pos, 
      originalPos: pos 
    };
  });

  let sorted = latestPairs.sort((a, b) => b.freq - a.freq);

  if (hasPacha) {
    // Find the repeated digit in latest
    const counts: Record<number, number> = {};
    latest.digits.forEach(d => counts[d] = (counts[d] || 0) + 1);
    const pachaDigit = Object.entries(counts).find(([_, c]) => c >= 2)?.[0] || topDigit.toString();
    const pachaPair = `${pachaDigit}${pachaDigit}`;
    
    if (!sorted.some(s => s.pair === pachaPair)) {
      sorted.unshift({ 
        pair: pachaPair, 
        freq: (digitFreq[Number(pachaDigit)] || 0) * 2, 
        pairCount: history.filter(h => h.digits.filter(d => d === Number(pachaDigit)).length >= 2).length,
        bestPos: '12', 
        originalPos: '12' 
      });
    }
  }

  return sorted.slice(0, 6);
};

export const getGrupoB = (history: Draw[], digitFreq: Record<number, number>) => {
  if (history.length < 3) return { b1: 0, b2: 1 };
  const latest = new Set(history[0].digits);
  const prev2 = history[1].digits;
  const prev3 = history[2].digits;
  
  const candidates = Array.from(new Set([...prev2, ...prev3]))
    .filter(d => !latest.has(d))
    .map(d => ({ d, f: digitFreq[d] || 0 }))
    .sort((a, b) => b.f - a.f);

  return {
    b1: candidates[0]?.d ?? 0,
    b2: candidates[1]?.d ?? 1
  };
};

export const getGrupoC = (history: Draw[], digitFreq: Record<number, number>) => {
  const allDigits = [];
  for (let d = 0; d <= 9; d++) {
    let delay = 0;
    for (let i = 0; i < history.length; i++) {
      if (history[i].digits.includes(d)) {
        delay = i + 1;
        break;
      }
      if (i === history.length - 1) delay = history.length + 1;
    }
    allDigits.push({ 
      digit: d, 
      racha: delay, 
      freq: digitFreq[d] || 0 
    });
  }

  const sortedByRacha = [...allDigits].sort((a, b) => b.racha - a.racha);

  return {
    c1: sortedByRacha[0].digit,
    c2: sortedByRacha[1].digit,
    enFuego: sortedByRacha[0].digit,
    all: allDigits, // Keep 0-9 order for the table
    sortedByRacha
  };
};

export const getGrupoD = (b1: number, b2: number, c1: number, c2: number, history: Draw[]) => {
  const rachaMap: Record<number, number> = {};
  [b1, b2, c1, c2].forEach(d => {
    let racha = history.length + 1;
    for (let i = 0; i < history.length; i++) {
      if (history[i].digits.includes(d)) {
        racha = i + 1;
        break;
      }
    }
    rachaMap[d] = racha;
  });

  const combinations = [
    { p: `${b1}${c1}`, sum: rachaMap[b1] + rachaMap[c1] },
    { p: `${b1}${c2}`, sum: rachaMap[b1] + rachaMap[c2] },
    { p: `${b2}${c1}`, sum: rachaMap[b2] + rachaMap[c1] },
    { p: `${b2}${c2}`, sum: rachaMap[b2] + rachaMap[c2] },
    { p: `${b1}${b2}`, sum: rachaMap[b1] + rachaMap[b2] },
    { p: `${c1}${c2}`, sum: rachaMap[c1] + rachaMap[c2] },
  ].sort((a, b) => b.sum - a.sum);

  const pairs = ['12', '13', '14', '23', '24', '34'];
  
  // Pre-calculate pair frequencies in one pass
  const pairFreqInHistory: Record<string, number> = {};
  const posFreqInHistory: Record<string, Record<string, number>> = {};
  
  history.forEach(h => {
    pairs.forEach(posKey => {
      const [h1, h2] = POS_INDICES[posKey];
      const p = `${h.digits[h1]}${h.digits[h2]}`;
      pairFreqInHistory[p] = (pairFreqInHistory[p] || 0) + 1;
      if (!posFreqInHistory[p]) posFreqInHistory[p] = {};
      posFreqInHistory[p][posKey] = (posFreqInHistory[p][posKey] || 0) + 1;
    });
  });

  return combinations.map(item => {
    const pFreqs = posFreqInHistory[item.p] || {};
    const bestPos = Object.entries(pFreqs).sort((a,b) => b[1] - a[1])[0]?.[0] || '12';
    const pairCount = pairFreqInHistory[item.p] || 0;

    return { ...item, bestPos, delay: item.sum, pairCount };
  });
};

export const combinePairs = (p1: string, pos1: string, p2: string, pos2: string) => {
  const res = [null, null, null, null] as (string | null)[];
  
  // Place p1 at pos1
  const idx1 = POS_INDICES[pos1];
  res[idx1[0]] = p1[0];
  res[idx1[1]] = p1[1];

  // Place p2 at pos2 or remaining
  const idx2 = POS_INDICES[pos2];
  let p2DigitIdx = 0;
  
  idx2.forEach(idx => {
    if (res[idx] === null && p2DigitIdx < 2) {
      res[idx] = p2[idx2.indexOf(idx)]; // use the digit at the same relative index
      p2DigitIdx++;
    }
  });
  
  // If digits left, fill remaining
  const p2Digits = p2.split('');
  for (let i = 0; i < 4; i++) {
    if (res[i] === null) {
      // find a digit from p2 that wasn't placed? 
      // Actually, let's just use the remaining digits of p2 in order
      const usedDigits = res.filter(x => x !== null);
      const remainingP2 = p2Digits.filter(d => !usedDigits.includes(d) || p2Digits.filter(x => x === d).length > usedDigits.filter(x => x === d).length);
      if (remainingP2.length > 0) {
        res[i] = remainingP2[0];
        // remove one instance of that digit
        p2Digits.splice(p2Digits.indexOf(remainingP2[0]), 1);
      }
    }
  }

  return res.map(v => v === null ? '0' : v).join('');
};

export const generateMatrix = (grupoA: any[], grupoD: any[]) => {
  // Rows: Grupo A, Cols: Grupo D (as per user request)
  const matrix: string[][] = [];
  
  grupoA.forEach(a => {
    const row: string[] = [];
    grupoD.forEach(d => {
      row.push(combinePairs(a.pair, a.bestPos, d.p, d.bestPos));
    });
    matrix.push(row);
  });

  return matrix;
};

export const checkPredictions = (matrix: string[][], history: Draw[]) => {
  const last15 = history.slice(0, 15);
  const flatMatrix = matrix.flat();
  let hits4 = 0;
  let hits3 = 0;

  last15.forEach(draw => {
    const full = draw.full;
    if (flatMatrix.includes(full)) {
      hits4++;
    } else {
      // Check 3 digits
      const has3 = flatMatrix.some(m => {
        let matchCount = 0;
        for (let i = 0; i < 4; i++) {
          if (m[i] === full[i]) matchCount++;
        }
        return matchCount >= 3;
      });
      if (has3) hits3++;
    }
  });

  return { hits4, hits3, total: last15.length };
};

export const getDiagonal = (matrix: string[][]) => {
  const diagonal: string[] = [];
  for (let i = 0; i < Math.min(matrix.length, matrix[0]?.length || 0); i++) {
    diagonal.push(matrix[i][i]);
  }
  return diagonal;
};

export const filterFinalChoice = (diagonal: string[], patterns: any, grupoA: any[], grupoC: any) => {
  if (diagonal.length === 0) return null;

  const scored = diagonal.map(num => {
    const dArr = num.split('').map(Number);
    let score = 0;

    // Pattern 1: Pachas
    const isPacha = checkPacha(dArr);
    if (isPacha === (patterns.pachas.percent > 40)) score++;

    // Pattern 2: Repetition (hard to check against future, but let's check if it has common digits)
    const hasCommon = dArr.some(d => patterns.groups.A > 50 ? grupoA.some((a: any) => a.pair.includes(d.toString())) : false);
    if (hasCommon) score++;

    // Pattern 3 & 4: Position
    const p12 = num.slice(0, 2);
    const p34 = num.slice(2, 4);
    if (patterns.posOrigin.best === '12' || patterns.posTarget.best === '12') score++;
    if (patterns.posOrigin.best === '34' || patterns.posTarget.best === '34') score++;

    // Pattern 5: Groups
    const inA = grupoA.some((a: any) => a.pair.split('').every((d: string) => num.includes(d)));
    const inC = num.includes(grupoC.c1.toString()) && num.includes(grupoC.c2.toString());
    if (patterns.groups.prediction.includes("A") && inA) score++;
    if (patterns.groups.prediction.includes("C") && inC) score++;

    return { num, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0].num;
};

export const analyzePatterns = (history: Draw[], grupoA: any[], b1: number, b2: number, c1: number, c2: number): any => {
  const total = history.length - 1;
  if (total <= 0) return null;

  // Pattern 1: Pachas
  let pachasCount = 0;
  history.forEach(d => { if (checkPacha(d.digits)) pachasCount++; });
  const pachaPercent = (pachasCount / history.length) * 100;

  // Pattern 2: Repetition 2+ digits
  let rep2Count = 0;
  for (let i = 0; i < history.length - 1; i++) {
    const intersection = history[i].digits.filter(d => history[i+1].digits.includes(d));
    if (intersection.length >= 2) rep2Count++;
  }
  const rep2Percent = (rep2Count / total) * 100;

  // Pattern 3 & 4: Position Origin and Target
  const posPairs = ['12', '13', '14', '23', '24', '34'];
  const originTracker: Record<string, number> = {};
  const targetTracker: Record<string, number> = {};

  for (let i = 0; i < history.length - 1; i++) {
    const current = history[i];
    const prev = history[i+1];
    
    posPairs.forEach(origPos => {
      const [o1, o2] = POS_INDICES[origPos];
      const pairStr = `${prev.digits[o1]}${prev.digits[o2]}`;
      
      posPairs.forEach(targetPos => {
        const [t1, t2] = POS_INDICES[targetPos];
        if (`${current.digits[t1]}${current.digits[t2]}` === pairStr) {
          originTracker[origPos] = (originTracker[origPos] || 0) + 1;
          targetTracker[targetPos] = (targetTracker[targetPos] || 0) + 1;
        }
      });
    });
  }

  const bestOrigin = Object.entries(originTracker).sort((a,b) => b[1] - a[1])[0]?.[0] || '12';
  const bestTarget = Object.entries(targetTracker).sort((a,b) => b[1] - a[1])[0]?.[0] || '34';

  // Pattern 5: Group appearance
  const groupTracker = { A: 0, B: 0, C: 0 };
  history.forEach(draw => {
    const dSet = new Set(draw.digits);
    if (grupoA.some(a => a.pair.split('').every((d: string) => dSet.has(Number(d))))) groupTracker.A++;
    if (dSet.has(b1) && dSet.has(b2)) groupTracker.B++;
    if (dSet.has(c1) && dSet.has(c2)) groupTracker.C++;
  });

  const topGroups = Object.entries(groupTracker).sort((a,b) => b[1] - a[1]);
  const predictionGroups = `${topGroups[0][0]} y ${topGroups[1][0]}`;

  return {
    pachas: { percent: pachaPercent, prediction: pachaPercent > 40 ? "Probable Pacha" : "Sin Pacha" },
    rep2: { percent: rep2Percent, prediction: rep2Percent > 30 ? "Repetición Alta" : "Baja Repetición" },
    posOrigin: { best: bestOrigin, percent: (originTracker[bestOrigin] || 0) / total * 100 },
    posTarget: { best: bestTarget, percent: (targetTracker[bestTarget] || 0) / total * 100 },
    groups: { 
      A: (groupTracker.A / history.length) * 100,
      B: (groupTracker.B / history.length) * 100,
      C: (groupTracker.C / history.length) * 100,
      prediction: "Fuerza en Grupos " + predictionGroups
    }
  };
};
