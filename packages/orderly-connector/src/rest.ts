import crypto from 'crypto';
import fetch from 'node-fetch';
import * as ed from '@noble/ed25519';
import type {
  OrderlyConfig,
  OrderRequest,
  OrderResponse,
  Position,
  AccountInfo,
} from './types.js';

// Setup sha512 for ed25519
ed.etc.sha512Sync = (...m) => crypto.createHash('sha512').update(Buffer.concat(m)).digest();

export class OrderlyRestClient {
  constructor(private config: OrderlyConfig) {}

  private fromBase64Url(str: string): Uint8Array {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    return Uint8Array.from(Buffer.from(b64 + '='.repeat(pad), 'base64'));
  }

  private toBase64Url(bytes: Uint8Array): string {
    const b64 = Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private async sign(timestamp: number, method: string, path: string, body?: string): Promise<string> {
    const message = `${timestamp}${method}${path}${body || ''}`;
    const secretKey = this.fromBase64Url(this.config.secretKey);
    const signature = await ed.sign(new TextEncoder().encode(message), secretKey);
    return this.toBase64Url(signature);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const timestamp = Date.now();
    const bodyString = body ? JSON.stringify(body) : undefined;
    const signature = await this.sign(timestamp, method, path, bodyString);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'orderly-timestamp': timestamp.toString(),
      'orderly-account-id': this.config.accountId,
      'orderly-key': this.config.publicKey,
      'orderly-signature': signature,
    };

    const url = `${this.config.baseUrl}${path}`;
    const options: any = {
      method,
      headers,
    };

    if (bodyString) {
      options.body = bodyString;
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Orderly API error: ${response.status} ${error}`);
    }

    return (await response.json()) as T;
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return this.request<AccountInfo>('GET', `/v1/client/info`);
  }

  async getPositions(): Promise<Position[]> {
    const response = await this.request<{ rows: Position[] }>('GET', '/v1/positions');
    return response.rows || [];
  }

  async createOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.request<OrderResponse>('POST', '/v1/order', order);
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    await this.request('DELETE', `/v1/order`, { order_id: orderId, symbol });
  }

  async getOrders(symbol?: string): Promise<OrderResponse[]> {
    const path = symbol ? `/v1/orders?symbol=${symbol}` : '/v1/orders';
    const response = await this.request<{ rows: OrderResponse[] }>('GET', path);
    return response.rows || [];
  }

  async getTicker(symbol: string): Promise<any> {
    const url = `${this.config.baseUrl}/v1/public/futures/${symbol}`;
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch ticker: ${response.status} ${error}`);
    }

    const data: any = await response.json();
    return data.data;
  }
}
