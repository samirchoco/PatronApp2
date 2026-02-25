
export interface Draw {
  digits: number[]; 
  full: string;     
}

export interface PairInfo {
  pair: string;
  positions: string;
  frequency: number;
}

export interface DigitDelay {
  digit: number;
  delay: number;
  racha: number; 
}

export interface AuditEntry {
  step: number;
  status: 'Verificado' | 'Auditando';
  value: string;
}

export interface PatternSummary {
  pachas: { percent: number; prediction: string };
  rep2: { percent: number; prediction: string };
  posOrigin: { best: string; percent: number };
  posTarget: { best: string; percent: number };
  groups: { A: number; B: number; C: number; prediction: string };
}
