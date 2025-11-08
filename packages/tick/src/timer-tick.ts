import { EventEmitter } from 'events';
import type { Tick, TickCallback } from './types.js';

export class TimerTick extends EventEmitter implements Tick {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private intervalMs: number) {
    super();
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  onTick(callback: TickCallback): void {
    this.on('tick', callback);
  }

  offTick(callback: TickCallback): void {
    this.off('tick', callback);
  }

  private scheduleNext(): void {
    if (!this.running) return;

    this.timer = setTimeout(() => {
      this.emit('tick');
      this.scheduleNext();
    }, this.intervalMs);
  }
}
