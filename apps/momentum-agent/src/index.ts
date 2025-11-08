import { OrderlyRestClient } from "@aadenman/orderly-connector";
import { TimerTick } from "@aadenman/tick";
import { PaperExecutor } from "@aadenman/execution";
import { LLMAgent, AgentRunner } from "@aadenman/agent";
import { PriceManager } from "./price-manager.js";
import { loadConfig } from "./config.js";

async function main() {
  console.log("📈 Momentum Trading Agent Starting...\n");

  const config = loadConfig();

  console.log(`Mode: ${config.mode}`);
  console.log(`Symbol: ${config.symbol}`);
  console.log(`Start Balance: $${config.startBalance}\n`);

  // Create REST client
  const restClient = new OrderlyRestClient({
    baseUrl: config.orderly.baseUrl,
    wsUrl: config.orderly.wsUrl,
    accountId: config.orderly.accountId,
    publicKey: config.orderly.publicKey,
    secretKey: config.orderly.secretKey,
  });

  // Setup price manager with REST polling
  const priceManager = new PriceManager(restClient);
  console.log("Starting price polling...");
  await priceManager.subscribeSymbol(config.symbol, 1000);

  // Wait a moment for initial price
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const initialPrice = priceManager.getPrice(config.symbol);
  if (initialPrice === 0) {
    console.error("Failed to get initial price. Exiting...");
    process.exit(1);
  }

  console.log(`Initial price: $${initialPrice.toFixed(2)}\n`);

  // Create executor (paper mode for now)
  const executor = new PaperExecutor({
    slippage: 0.001,
    takerFee: 0.0005,
  });

  // Create LLM agent with momentum strategy
  const agent = new LLMAgent({
    apiKey: config.anthropic.apiKey,
    model: "claude-sonnet-4-5-20250929",
    systemPrompt: `You are a MOMENTUM TRADING agent for cryptocurrency futures.

Your strategy: Follow the trend - "The trend is your friend"

MOMENTUM TRADING RULES:
1. Identify price momentum (strong upward or downward trends)
2. BUY when detecting strong upward momentum (price rising consistently)
3. SELL when detecting strong downward momentum (price falling consistently)
4. HOLD when momentum is unclear or market is ranging

Key Principles:
- Don't fight the trend - go with the flow
- Strong momentum = high confidence trades
- Weak/unclear momentum = stay in cash (HOLD)
- Let winners run, cut losers quickly
- Risk 10-30% of equity per trade based on momentum strength

You will receive:
- Current price
- Current position (qty, average price, side: LONG/SHORT/NONE)
- Available cash
- Total equity

Respond with JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "qty": <fraction of equity 0.0-1.0>,
  "reason": "<brief momentum analysis>"
}

Example reasoning:
- "Strong upward momentum detected, price +5% in recent period - BUY 0.3"
- "Downward momentum accelerating - SELL to exit position"
- "Sideways movement, no clear momentum - HOLD"`,
  });

  // Create tick (5 second timer)
  const tick = new TimerTick(5000);

  // Create agent runner
  const runner = new AgentRunner({
    name: "Agent-1",
    symbol: config.symbol,
    agent,
    executor,
    tick,
    initialCash: config.startBalance,
    cooldownMs: 5000,
    getCurrentPrice: () => priceManager.getPrice(config.symbol),
    onResult: (result) => {
      // Log results (can add metrics here later)
      if (result.success) {
        console.log(`✅ Action completed: ${result.action}\n`);
      } else {
        console.log(`❌ Action failed: ${result.error}\n`);
      }
    },
  });

  // Start the agent
  runner.start();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    runner.stop();
    priceManager.stop();
    process.exit(0);
  });

  console.log("✨ Trading bot is now running. Press Ctrl+C to stop.\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
