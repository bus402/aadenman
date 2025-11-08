import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  mode: 'paper' | 'live';
  symbol: string;
  startBalance: number;

  orderly: {
    baseUrl: string;
    wsUrl: string;
    accountId: string;
    publicKey: string;
    secretKey: string;
  };

  anthropic: {
    apiKey: string;
  };
}

export function loadConfig(): Config {
  const mode = (process.env.MODE || 'paper') as 'paper' | 'live';
  const symbol = process.env.SYMBOL || 'PERP_BTC_USDC';
  const startBalance = parseFloat(process.env.START_BAL || '10000');

  const orderly = {
    baseUrl: process.env.ORDERLY_BASE || 'https://api-evm.orderly.org',
    wsUrl: process.env.ORDERLY_WS_PUBLIC || 'wss://ws-evm.orderly.org/ws/stream',
    accountId: process.env.ORDERLY_ACCOUNT_ID || '',
    publicKey: process.env.ORDERLY_PUBLIC_KEY || '',
    secretKey: process.env.ORDERLY_SECRET_KEY || '',
  };

  const anthropic = {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  };

  // Validate required fields
  if (!anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  if (mode === 'live') {
    if (!orderly.accountId || !orderly.publicKey || !orderly.secretKey) {
      throw new Error('Orderly credentials required for live mode');
    }
  }

  return {
    mode,
    symbol,
    startBalance,
    orderly,
    anthropic,
  };
}
