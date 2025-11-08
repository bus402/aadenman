import type { ActionType, ExecutionContext } from '@aadenman/execution';

export interface AgentDecision {
  action: ActionType;
  qty: number;
  reason: string;
}

export interface AgentContext extends ExecutionContext {
  timestamp: number;
}

export interface Agent {
  decide(context: AgentContext): Promise<AgentDecision>;
}
