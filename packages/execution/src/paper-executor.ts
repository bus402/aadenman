import type { Executor, ExecutionContext, ExecutionResult, ActionType, Position } from './types.js';

export interface PaperExecutorConfig {
  slippage?: number; // 0.001 = 0.1%
  takerFee?: number; // 0.0005 = 0.05%
}

export class PaperExecutor implements Executor {
  private slippage: number;
  private takerFee: number;

  constructor(config: PaperExecutorConfig = {}) {
    this.slippage = config.slippage ?? 0.001; // 0.1% default
    this.takerFee = config.takerFee ?? 0.0005; // 0.05% default
  }

  async execute(
    action: ActionType,
    qty: number,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    if (action === 'HOLD') {
      return {
        success: true,
        action: 'HOLD',
        qty: 0,
        price: context.currentPrice,
        cash: context.cash,
        position: context.position,
        equity: context.equity,
      };
    }

    const executionPrice = this.applySlippage(context.currentPrice, action);

    try {
      return action === 'BUY'
        ? this.buy(qty, executionPrice, context)
        : this.sell(qty, executionPrice, context);
    } catch (error) {
      return {
        success: false,
        action,
        qty: 0,
        price: context.currentPrice,
        cash: context.cash,
        position: context.position,
        equity: context.equity,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buy(qty: number, price: number, context: ExecutionContext): ExecutionResult {
    // HOLD or LONG -> Adding to long
    if (context.position.side === 'NONE' || context.position.side === 'LONG') {
      const cost = qty * price;
      const fee = cost * this.takerFee;
      const totalCost = cost + fee;

      if (totalCost > context.cash) {
        throw new Error(`Insufficient cash: need ${totalCost.toFixed(2)}, have ${context.cash.toFixed(2)}`);
      }

      const totalQty = context.position.qty + qty;
      const avgPrice = context.position.side === 'NONE'
        ? price
        : (context.position.avgPrice * context.position.qty + price * qty) / totalQty;

      const newPosition: Position = {
        symbol: context.symbol,
        qty: totalQty,
        avgPrice,
        side: 'LONG',
      };

      const newCash = context.cash - totalCost;
      const newEquity = newCash + this.calculatePositionValue(newPosition, context.currentPrice);

      return {
        success: true,
        action: 'BUY',
        qty,
        price,
        cash: newCash,
        position: newPosition,
        equity: newEquity,
        pnl: 0,
      };
    }

    // SHORT -> Closing or flipping
    const shortQty = Math.abs(context.position.qty);

    // Fully close short
    if (qty >= shortQty) {
      // Calculate cost to close SHORT position
      const closeCost = shortQty * price;
      const closeFee = closeCost * this.takerFee;
      const totalCloseCost = closeCost + closeFee;

      const pnl = (context.position.avgPrice - price) * shortQty - closeFee;
      const remainingQty = qty - shortQty;

      let newCash = context.cash + pnl;
      let newPosition: Position;

      // If there's remaining qty, open LONG position
      if (remainingQty > 0) {
        const longCost = remainingQty * price;
        const longFee = longCost * this.takerFee;
        const totalLongCost = longCost + longFee;

        if (totalLongCost > newCash) {
          throw new Error(`Insufficient cash for LONG: need ${totalLongCost.toFixed(2)}, have ${newCash.toFixed(2)}`);
        }

        newCash -= totalLongCost;
        newPosition = { symbol: context.symbol, qty: remainingQty, avgPrice: price, side: 'LONG' };
      } else {
        newPosition = { symbol: context.symbol, qty: 0, avgPrice: 0, side: 'NONE' };
      }

      const newEquity = newCash + this.calculatePositionValue(newPosition, context.currentPrice);

      return {
        success: true,
        action: 'BUY',
        qty,
        price,
        cash: newCash,
        position: newPosition,
        equity: newEquity,
        pnl,
      };
    }

    // Partially close short
    const cost = qty * price;
    const fee = cost * this.takerFee;
    const pnl = (context.position.avgPrice - price) * qty - fee;

    const newPosition: Position = {
      symbol: context.symbol,
      qty: context.position.qty + qty,
      avgPrice: context.position.avgPrice,
      side: 'SHORT',
    };

    const newCash = context.cash + pnl;
    const newEquity = newCash + this.calculatePositionValue(newPosition, context.currentPrice);

    return {
      success: true,
      action: 'BUY',
      qty,
      price,
      cash: newCash,
      position: newPosition,
      equity: newEquity,
      pnl,
    };
  }

  private sell(qty: number, price: number, context: ExecutionContext): ExecutionResult {
    // HOLD or SHORT -> Adding to short
    if (context.position.side === 'NONE' || context.position.side === 'SHORT') {
      const proceeds = qty * price;
      const fee = proceeds * this.takerFee;
      const netProceeds = proceeds - fee;

      const totalQty = Math.abs(context.position.qty) + qty;
      const avgPrice = context.position.side === 'NONE'
        ? price
        : (context.position.avgPrice * Math.abs(context.position.qty) + price * qty) / totalQty;

      const newPosition: Position = {
        symbol: context.symbol,
        qty: -totalQty,
        avgPrice,
        side: 'SHORT',
      };

      const newCash = context.cash + netProceeds;
      const newEquity = newCash + this.calculatePositionValue(newPosition, context.currentPrice);

      return {
        success: true,
        action: 'SELL',
        qty,
        price,
        cash: newCash,
        position: newPosition,
        equity: newEquity,
        pnl: 0,
      };
    }

    // LONG -> Closing or flipping
    const longQty = context.position.qty;

    // Fully close long
    if (qty >= longQty) {
      // Calculate proceeds from closing LONG position
      const closeProceeds = longQty * price;
      const closeFee = closeProceeds * this.takerFee;
      const netCloseProceeds = closeProceeds - closeFee;

      const pnl = (price - context.position.avgPrice) * longQty - closeFee;
      const remainingQty = qty - longQty;

      let newCash = context.cash + netCloseProceeds;
      let newPosition: Position;

      // If there's remaining qty, open SHORT position
      if (remainingQty > 0) {
        const shortProceeds = remainingQty * price;
        const shortFee = shortProceeds * this.takerFee;
        const netShortProceeds = shortProceeds - shortFee;

        newCash += netShortProceeds;
        newPosition = { symbol: context.symbol, qty: -remainingQty, avgPrice: price, side: 'SHORT' };
      } else {
        newPosition = { symbol: context.symbol, qty: 0, avgPrice: 0, side: 'NONE' };
      }

      const newEquity = newCash + this.calculatePositionValue(newPosition, context.currentPrice);

      return {
        success: true,
        action: 'SELL',
        qty,
        price,
        cash: newCash,
        position: newPosition,
        equity: newEquity,
        pnl,
      };
    }

    // Partially close long
    const proceeds = qty * price;
    const fee = proceeds * this.takerFee;
    const netProceeds = proceeds - fee;
    const pnl = (price - context.position.avgPrice) * qty - fee;

    const newPosition: Position = {
      symbol: context.symbol,
      qty: context.position.qty - qty,
      avgPrice: context.position.avgPrice,
      side: 'LONG',
    };

    const newCash = context.cash + netProceeds;
    const newEquity = newCash + this.calculatePositionValue(newPosition, context.currentPrice);

    return {
      success: true,
      action: 'SELL',
      qty,
      price,
      cash: newCash,
      position: newPosition,
      equity: newEquity,
      pnl,
    };
  }

  private applySlippage(price: number, action: ActionType): number {
    if (action === 'BUY') return price * (1 + this.slippage);
    if (action === 'SELL') return price * (1 - this.slippage);
    return price;
  }

  private calculatePositionValue(position: Position, currentPrice: number): number {
    if (position.side === 'NONE') return 0;

    const qty = Math.abs(position.qty);
    return position.side === 'LONG'
      ? (currentPrice - position.avgPrice) * qty
      : (position.avgPrice - currentPrice) * qty;
  }
}
