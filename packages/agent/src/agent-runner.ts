import type { Tick } from '@aadenman/tick';
import type { Executor, Position, ExecutionResult } from '@aadenman/execution';
import type { Agent, AgentContext } from './types.js';

export interface AgentRunnerConfig {
  name: string;
  symbol: string;
  agent: Agent;
  executor: Executor;
  tick: Tick;
  initialCash: number;
  cooldownMs?: number;
  getCurrentPrice: () => number;
  onResult?: (result: ExecutionResult) => void;
}

export class AgentRunner {
  private name: string;
  private symbol: string;
  private agent: Agent;
  private executor: Executor;
  private tick: Tick;
  private getCurrentPrice: () => number;
  private onResult?: (result: ExecutionResult) => void;

  private cash: number;
  private position: Position;
  private equity: number;
  private running = false;
  private executing = false;
  private lastExecutionTime = 0;
  private cooldownMs: number;

  constructor(config: AgentRunnerConfig) {
    this.name = config.name;
    this.symbol = config.symbol;
    this.agent = config.agent;
    this.executor = config.executor;
    this.tick = config.tick;
    this.getCurrentPrice = config.getCurrentPrice;
    this.onResult = config.onResult;
    this.cooldownMs = config.cooldownMs ?? 5000; // 5s default

    this.cash = config.initialCash;
    this.equity = config.initialCash;
    this.position = {
      symbol: config.symbol,
      qty: 0,
      avgPrice: 0,
      side: 'NONE',
    };
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.tick.onTick(this.onTick);
    this.tick.start();

    console.log(`[${this.name}] Started`);
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.tick.stop();
    this.tick.offTick(this.onTick);

    console.log(`[${this.name}] Stopped`);
  }

  private onTick = async (): Promise<void> => {
    if (this.executing) {
      console.log(`[${this.name}] Skipping tick (already executing)`);
      return;
    }

    const now = Date.now();
    if (now - this.lastExecutionTime < this.cooldownMs) {
      console.log(`[${this.name}] Skipping tick (cooldown)`);
      return;
    }

    this.executing = true;
    this.lastExecutionTime = now;

    try {
      await this.execute();
    } catch (error) {
      console.error(`[${this.name}] Execution error:`, error);
    } finally {
      this.executing = false;
    }
  };

  private async execute(): Promise<void> {
    const currentPrice = this.getCurrentPrice();

    const context: AgentContext = {
      symbol: this.symbol,
      currentPrice,
      position: this.position,
      cash: this.cash,
      equity: this.equity,
      timestamp: Date.now(),
    };

    console.log(`\n[${this.name}] Context:`);
    console.log(`  Price: $${currentPrice.toFixed(2)}`);
    console.log(`  Position: ${this.position.side} ${Math.abs(this.position.qty).toFixed(4)} @ $${this.position.avgPrice.toFixed(2)}`);
    console.log(`  Cash: $${this.cash.toFixed(2)}`);
    console.log(`  Equity: $${this.equity.toFixed(2)}`);

    const decision = await this.agent.decide(context);

    console.log(`[${this.name}] Decision: ${decision.action} ${decision.qty.toFixed(2)} - ${decision.reason}`);

    // Convert qty (fraction of equity) to absolute quantity
    const absoluteQty = decision.action === 'HOLD'
      ? 0
      : (decision.qty * this.equity) / currentPrice;

    const result = await this.executor.execute(decision.action, absoluteQty, context);

    if (result.success) {
      this.cash = result.cash;
      this.position = result.position;
      this.equity = result.equity;

      console.log(
        `[${this.name}] Executed ${result.action}: ` +
        `qty=${result.qty.toFixed(4)}, ` +
        `price=$${result.price.toFixed(2)}, ` +
        `equity=$${result.equity.toFixed(2)}` +
        (result.pnl ? `, pnl=$${result.pnl.toFixed(2)}` : '')
      );
    } else {
      console.error(`[${this.name}] Execution failed: ${result.error}`);
    }

    this.onResult?.(result);
  }

  getStats() {
    return {
      name: this.name,
      symbol: this.symbol,
      cash: this.cash,
      position: this.position,
      equity: this.equity,
    };
  }
}
