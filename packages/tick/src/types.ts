import { EventEmitter } from 'events';

export type TickCallback = () => void | Promise<void>;

export interface Tick extends EventEmitter {
  start(): void;
  stop(): void;
  onTick(callback: TickCallback): void;
  offTick(callback: TickCallback): void;
}
