import WebSocket from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import * as ed from '@noble/ed25519';
import type { OrderlyConfig, TickerData, WsMessage, TickerCallback } from './types.js';

// Setup sha512 for ed25519
ed.etc.sha512Sync = (...m) => crypto.createHash('sha512').update(Buffer.concat(m)).digest();

export class OrderlyWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private subscribedSymbols = new Set<string>();
  private tickerCallbacks = new Map<string, Set<TickerCallback>>();
  private authenticated = false;

  constructor(private config: OrderlyConfig) {
    super();
  }

  private fromBase64Url(str: string): Uint8Array {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    return Uint8Array.from(Buffer.from(b64 + '='.repeat(pad), 'base64'));
  }

  private toBase64Url(bytes: Uint8Array): string {
    const b64 = Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private async signAuth(timestamp: number): Promise<string> {
    const message = timestamp.toString();
    const secretKey = this.fromBase64Url(this.config.secretKey);
    const signature = await ed.sign(new TextEncoder().encode(message), secretKey);
    return this.toBase64Url(signature);
  }

  private async sendAuth(): Promise<void> {
    const timestamp = Date.now();
    const signature = await this.signAuth(timestamp);

    const authMsg = {
      id: `auth_${timestamp}`,
      event: 'auth',
      params: {
        orderly_key: `ed25519:${this.config.publicKey}`,
        sign: signature,
        timestamp,
      },
    };

    console.log('[Orderly WS] Sending auth...');
    this.ws?.send(JSON.stringify(authMsg));
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.on('open', async () => {
          console.log('[Orderly WS] Connected');

          // Send auth first
          await this.sendAuth();

          this.startPingInterval();

          // Re-subscribe to all symbols
          for (const symbol of this.subscribedSymbols) {
            this.sendSubscribe(symbol);
          }

          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          console.log('[Orderly WS] Raw message:', data.toString().substring(0, 500));
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (error) => {
          console.error('[Orderly WS] Error:', error);
          this.emit('error', error);
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[Orderly WS] Disconnected - Code: ${code}, Reason: ${reason.toString()}`);
          this.stopPingInterval();
          this.scheduleReconnect();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  subscribeTicker(symbol: string, callback: TickerCallback): void {
    if (!this.tickerCallbacks.has(symbol)) {
      this.tickerCallbacks.set(symbol, new Set());
    }
    this.tickerCallbacks.get(symbol)!.add(callback);

    if (!this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.add(symbol);
      this.sendSubscribe(symbol);
    }
  }

  unsubscribeTicker(symbol: string, callback?: TickerCallback): void {
    if (callback) {
      this.tickerCallbacks.get(symbol)?.delete(callback);
      if (this.tickerCallbacks.get(symbol)?.size === 0) {
        this.tickerCallbacks.delete(symbol);
      }
    } else {
      this.tickerCallbacks.delete(symbol);
    }

    if (!this.tickerCallbacks.has(symbol)) {
      this.subscribedSymbols.delete(symbol);
      this.sendUnsubscribe(symbol);
    }
  }

  private sendSubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = {
        id: `sub_${symbol}_${Date.now()}`,
        event: 'subscribe',
        topic: `${symbol}@ticker`,
      };
      this.ws.send(JSON.stringify(msg));
      console.log(`[Orderly WS] Subscribing to ${symbol}@ticker`);
    }
  }

  private sendUnsubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = {
        id: `unsub_${symbol}_${Date.now()}`,
        event: 'unsubscribe',
        topic: `${symbol}@ticker`,
      };
      this.ws.send(JSON.stringify(msg));
      console.log(`[Orderly WS] Unsubscribed from ${symbol}`);
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg: WsMessage = JSON.parse(data);
      console.log('[Orderly WS] Received:', JSON.stringify(msg).substring(0, 200));

      // Handle ping/pong
      if (msg.topic === 'pong') {
        return;
      }

      // Handle ticker/trade updates
      if (msg.topic?.includes('@ticker') || msg.topic?.includes('@trade')) {
        const symbol = msg.topic.split('@')[0];
        const callbacks = this.tickerCallbacks.get(symbol);

        if (callbacks && msg.data) {
          // Handle both ticker and trade data formats
          const price = msg.data.close || msg.data.price || msg.data.p || msg.data.c;

          if (price) {
            const ticker: TickerData = {
              symbol,
              price: parseFloat(price),
              timestamp: msg.ts || Date.now(),
            };

            console.log(`[Orderly WS] Price update: ${symbol} = $${ticker.price}`);

            for (const callback of callbacks) {
              try {
                callback(ticker);
              } catch (err) {
                console.error('[Orderly WS] Callback error:', err);
              }
            }
          } else {
            console.log(`[Orderly WS] No price in data:`, JSON.stringify(msg.data).substring(0, 100));
          }
        }
      }

      this.emit('message', msg);
    } catch (err) {
      console.error('[Orderly WS] Parse error:', err);
    }
  }

  private startPingInterval(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ event: 'ping' }));
      }
    }, 30000); // Ping every 30s
  }

  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      console.log('[Orderly WS] Reconnecting...');
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error('[Orderly WS] Reconnect failed:', err);
      });
    }, 5000); // Reconnect after 5s
  }

  disconnect(): void {
    this.stopPingInterval();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
