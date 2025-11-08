export type Side = 'BUY' | 'SELL';
export type ActionType = 'BUY' | 'SELL' | 'HOLD';

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  side: 'LONG' | 'SHORT' | 'NONE';
}

export interface ExecutionContext {
  symbol: string;
  currentPrice: number;
  position: Position;
  cash: number;
  equity: number;
}

export interface ExecutionResult {
  success: boolean;
  action: ActionType;
  qty: number;
  price: number;
  cash: number;
  position: Position;
  equity: number;
  pnl?: number;
  error?: string;
}

export interface Executor {
  execute(action: ActionType, qty: number, context: ExecutionContext): Promise<ExecutionResult>;
}
