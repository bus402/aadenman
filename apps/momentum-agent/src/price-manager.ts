import type { OrderlyRestClient } from "@aadenman/orderly-connector";

export class PriceManager {
  private prices = new Map<string, number>();
  private intervals = new Map<string, NodeJS.Timeout>();

  constructor(private restClient: OrderlyRestClient) {}

  async subscribeSymbol(symbol: string, pollIntervalMs = 1000): Promise<void> {
    const existingInterval = this.intervals.get(symbol);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    await this.fetchPrice(symbol);

    const interval = setInterval(() => {
      this.fetchPrice(symbol);
    }, pollIntervalMs);

    this.intervals.set(symbol, interval);
  }

  private async fetchPrice(symbol: string): Promise<void> {
    try {
      const ticker = await this.restClient.getTicker(symbol);
      if (ticker && ticker["24h_close"]) {
        this.prices.set(symbol, parseFloat(ticker["24h_close"]));
      }
    } catch (error) {
      console.error(`[Price] Failed to fetch ${symbol}:`, error);
    }
  }

  getPrice(symbol: string): number {
    return this.prices.get(symbol) ?? 0;
  }

  unsubscribeSymbol(symbol: string): void {
    const interval = this.intervals.get(symbol);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(symbol);
    }
  }

  stop(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}
