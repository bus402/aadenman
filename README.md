# Aadenman

LLM-based multi-agent trading bot for Orderly perpetual futures.

## Features

- **LLM-Driven Trading**: Claude-powered agents make autonomous trading decisions
- **Strategy-Based Agents**: Each agent implements a specific trading strategy (momentum, grid, etc.)
- **Flexible Tick Sources**: Agents can operate on different schedules (timer-based, price-change, candle-based)
- **Paper & Live Trading**: Seamlessly switch between simulation and real trading
- **Modular Architecture**: Independent modules for easy extension and testing

## Architecture

```
packages/
  orderly-connector/    # Orderly REST + WebSocket client
  tick/                 # Tick sources (timer, price-change, candle)
  execution/            # Order execution (paper & live)
  agent/                # LLM agent + runner
  memory/               # Agent memory (TODO)
  metrics/              # Performance metrics (TODO)

apps/
  momentum-agent/       # Momentum trading strategy agent

scripts/
  create-orderly-account.ts  # Orderly account setup utility
```

## Quick Start

### 1. Install Dependencies

This project uses **pnpm**:

```bash
pnpm install
```

### 2. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Required variables:
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `MODE`: `paper` or `live`
- `SYMBOL`: Trading symbol (e.g., `PERP_BTC_USDC`)
- `START_BAL`: Starting balance for paper trading

### 3. Build

```bash
pnpm run build
```

### 4. Run Momentum Agent

Development mode (recommended):
```bash
pnpm run dev:momentum
```

Production mode:
```bash
pnpm run momentum
```

## Configuration

### Paper Trading (Default)

```env
MODE=paper
START_BAL=10000
ANTHROPIC_API_KEY=sk-ant-...
```

No Orderly credentials needed for paper trading.

### Live Trading

```env
MODE=live
ORDERLY_ACCOUNT_ID=your_account_id
ORDERLY_PUBLIC_KEY=your_public_key
ORDERLY_SECRET_KEY=your_secret_key
ANTHROPIC_API_KEY=sk-ant-...
```

## Project Structure

### Packages

#### `@aadenman/orderly-connector`
REST and WebSocket client for Orderly Network.
- Currently uses REST API polling for price data
- WebSocket support available for future use

#### `@aadenman/tick`
Tick sources that trigger agent execution:
- `TimerTick`: Execute at fixed intervals (currently 5 seconds)
- `PriceChangeTick`: Execute on price changes (TODO)
- `CandleTick`: Execute on candle close (TODO)

#### `@aadenman/execution`
Order execution with paper and live modes:
- `PaperExecutor`: Simulates fills with slippage and fees
  - Supports LONG/SHORT positions
  - Calculates P&L correctly for position flips
  - Tracks cash and equity separately
- `OrderlyExecutor`: Sends real orders to Orderly (TODO)

#### `@aadenman/agent`
LLM-based trading agent:
- `LLMAgent`: Uses Claude to make trading decisions
  - Configurable system prompts for different strategies
  - JSON-based decision output
- `AgentRunner`: Manages agent lifecycle and execution
  - Context tracking (price, position, cash, equity)
  - Cooldown management between executions

#### `@aadenman/memory`
Agent memory and history tracking (TODO)

#### `@aadenman/metrics`
Performance tracking (TODO):
- ROI calculation
- Max drawdown
- Sharpe ratio

### Apps

#### `@aadenman/momentum-agent`
Momentum trading strategy agent:
- **Strategy**: "The trend is your friend" - follows price momentum
- **Rules**:
  - BUY on strong upward momentum
  - SELL on strong downward momentum
  - HOLD when momentum is unclear
- Polls price every 1 second
- Makes trading decisions every 5 seconds
- Risk management: 10-30% equity per trade

## Development

### Adding a New Strategy Agent

Create a new app in `apps/` with a different trading strategy:

```typescript
import { LLMAgent, AgentRunner } from '@aadenman/agent';
import { TimerTick } from '@aadenman/tick';
import { PaperExecutor } from '@aadenman/execution';
import { OrderlyRestClient } from '@aadenman/orderly-connector';

// Create agent with custom strategy prompt
const agent = new LLMAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5-20250929',
  systemPrompt: `You are a GRID TRADING agent...

  Your strategy: Buy low, sell high in a range

  GRID TRADING RULES:
  1. Place buy orders below current price
  2. Place sell orders above current price
  3. Take profits on small price movements
  ...`,
});

// Create runner
const runner = new AgentRunner({
  name: 'Grid-Agent',
  symbol: 'PERP_BTC_USDC',
  agent,
  executor: new PaperExecutor({ slippage: 0.001, takerFee: 0.0005 }),
  tick: new TimerTick(10000), // 10 seconds
  initialCash: 10000,
  cooldownMs: 5000,
  getCurrentPrice: () => priceManager.getPrice('PERP_BTC_USDC'),
});

runner.start();
```

### Key Concepts

**Cash vs Equity:**
- **Cash**: Available cash in account
- **Equity**: Total account value (Cash + Unrealized P&L)

**Position States:**
- `NONE`: No position
- `LONG`: Holding long position
- `SHORT`: Holding short position

## Roadmap

- [x] Orderly REST client
- [x] REST API price polling
- [x] Basic tick system (TimerTick)
- [x] Paper execution with P&L (LONG/SHORT support)
- [x] LLM agent + runner
- [x] Momentum strategy agent
- [x] Context visualization (price, position, cash, equity)
- [ ] Price change detection (only log when price actually changes)
- [ ] Additional strategy agents (grid, mean-reversion, arbitrage)
- [ ] Multi-agent support (run multiple strategies simultaneously)
- [ ] PriceChangeTick and CandleTick
- [ ] Metrics module (ROI, MDD, Sharpe)
- [ ] Live execution with Orderly
- [ ] Memory/history for agents (track price history, past decisions)
- [ ] Risk management layer
- [ ] Backtesting mode

## License

MIT
