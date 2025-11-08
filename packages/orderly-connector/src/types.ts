export interface OrderlyConfig {
  baseUrl: string;
  wsUrl: string;
  accountId: string;
  publicKey: string;
  secretKey: string;
}

export interface TickerData {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT';
  order_quantity: number;
  order_price?: number;
  reduce_only?: boolean;
}

export interface OrderResponse {
  order_id: string;
  status: string;
  symbol: string;
  side: string;
  order_type: string;
  order_quantity: number;
  executed_quantity: number;
  order_price?: number;
  average_executed_price?: number;
}

export interface Position {
  symbol: string;
  position_qty: number;
  cost_position: number;
  average_open_price: number;
  unrealized_pnl: number;
  mark_price: number;
}

export interface AccountInfo {
  account_id: string;
  total_collateral: number;
  free_collateral: number;
  total_value: number;
  positions: Position[];
}

export interface WsMessage {
  topic: string;
  ts: number;
  data: any;
}

export type TickerCallback = (ticker: TickerData) => void;
