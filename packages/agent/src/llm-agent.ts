import Anthropic from '@anthropic-ai/sdk';
import type { Agent, AgentContext, AgentDecision } from './types.js';

export interface LLMAgentConfig {
  apiKey: string;
  model?: string;
  systemPrompt?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are a cryptocurrency futures trading agent.

Your task is to analyze the current market context and make a trading decision.

You will receive:
- Current price
- Your current position (qty, average price, side: LONG/SHORT/NONE)
- Available cash
- Total equity

You must respond with a JSON object with this exact structure:
{
  "action": "BUY" | "SELL" | "HOLD",
  "qty": <number between 0 and 1, representing fraction of equity to use>,
  "reason": "<brief explanation of your decision>"
}

Rules:
- qty represents the fraction of your total equity to allocate (0.0 to 1.0)
- Consider risk management and position sizing
- Provide clear reasoning for your decisions
- If uncertain, prefer HOLD over risky trades`;

export class LLMAgent implements Agent {
  private client: Anthropic;
  private model: string;
  private systemPrompt: string;

  constructor(config: LLMAgentConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-3-5-sonnet-20241022';
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  async decide(context: AgentContext): Promise<AgentDecision> {
    const userPrompt = this.buildPrompt(context);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: this.systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseDecision(content.text);
    } catch (error) {
      console.error('[LLM Agent] Error:', error);
      return { action: 'HOLD', qty: 0, reason: 'Error occurred' };
    }
  }

  private buildPrompt(context: AgentContext): string {
    const { currentPrice, position, cash, equity, symbol } = context;

    return `Symbol: ${symbol}
Current Price: $${currentPrice.toFixed(2)}

Position:
- Side: ${position.side}
- Quantity: ${position.qty}
- Average Price: $${position.avgPrice.toFixed(2)}

Account:
- Cash: $${cash.toFixed(2)}
- Total Equity: $${equity.toFixed(2)}

What is your trading decision?`;
  }

  private parseDecision(text: string): AgentDecision {
    try {
      // Extract JSON from text (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!parsed.action || !['BUY', 'SELL', 'HOLD'].includes(parsed.action)) {
        throw new Error('Invalid action');
      }

      const qty = typeof parsed.qty === 'number' ? parsed.qty : 0;
      const clampedQty = Math.max(0, Math.min(1, qty));

      return {
        action: parsed.action,
        qty: clampedQty,
        reason: parsed.reason || 'No reason provided',
      };
    } catch (error) {
      console.error('[LLM Agent] Parse error:', error);
      return { action: 'HOLD', qty: 0, reason: 'Failed to parse decision' };
    }
  }
}
