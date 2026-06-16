import { Injectable } from '@angular/core';

export interface KeystrokeFeatures {
  meanHold:      number;
  stdHold:       number;
  meanFlight:    number;
  stdFlight:     number;
  typingSpeed:   number;
  backspaceRate: number; // backspaces / total keystrokes in window
}

interface AgentEvent {
  type:         string;
  key?:         string;
  pressTime?:   number;
  releaseTime?: number;
  holdMs?:      number;
}

const AGENT_URL    = 'ws://localhost:8765';
const RECONNECT_MS = 3_000;

// pynput sends backspace as this string
const BACKSPACE_KEY = 'Key.backspace';

@Injectable({ providedIn: 'root' })
export class KeystrokeService {

  private holdDurations  : number[] = [];
  private flightTimes    : number[] = [];
  private lastReleaseMs  : number | null = null;
  private keyCount       = 0;
  private backspaceCount = 0;
  private windowStart    = 0;

  // Tracks last keystroke across window resets — used for inactivity detection
  private lastActivityMs: number = 0;

  private socket         : WebSocket | null = null;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  agentConnected = false;

  init(): void {
    this.windowStart = Date.now();
    this.connect();
  }

  private connect(): void {
    this.socket = new WebSocket(AGENT_URL);

    this.socket.onopen = () => {
      this.agentConnected = true;
      console.log('[Keystroke] Agent connected.');
    };

    this.socket.onmessage = (event: MessageEvent) => {
      this.handleAgentEvent(JSON.parse(event.data));
    };

    this.socket.onclose = () => {
      this.agentConnected = false;
      console.warn('[Keystroke] Agent disconnected. Retrying in 3s...');
      this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
    };

    this.socket.onerror = () => {
      this.agentConnected = false;
    };
  }

  private handleAgentEvent(data: AgentEvent): void {
    if (data.type === 'ready') return;
    if (data.type !== 'keyup' || data.holdMs == null || data.releaseTime == null) return;

    // Track backspace separately before counting as a regular keystroke
    if (data.key === BACKSPACE_KEY) {
      this.backspaceCount++;
    }

    this.holdDurations.push(data.holdMs);

    if (this.lastReleaseMs !== null) {
      const flight = data.releaseTime - this.lastReleaseMs;
      if (flight < 5_000) {
        this.flightTimes.push(flight);
      }
    }

    this.lastReleaseMs  = data.releaseTime;
    this.lastActivityMs = Date.now();
    this.keyCount++;
  }

  /** Ms since the last keystroke was received. Returns Infinity if no key has ever arrived. */
  getSecondsSinceLastActivity(): number {
    if (this.lastActivityMs === 0) return Infinity;
    return (Date.now() - this.lastActivityMs) / 1_000;
  }

  // Minimum keystrokes before a window is worth logging.
  // Prevents all-zero rows during pauses from polluting the dataset.
  hasEnoughData(): boolean {
    return this.keyCount >= 5;
  }

  getWindowFeatures(): KeystrokeFeatures {
    const elapsedMinutes = (Date.now() - this.windowStart) / 60_000;

    return {
      meanHold:      this.mean(this.holdDurations),
      stdHold:       this.std(this.holdDurations),
      meanFlight:    this.mean(this.flightTimes),
      stdFlight:     this.std(this.flightTimes),
      typingSpeed:   elapsedMinutes > 0 ? this.keyCount / elapsedMinutes : 0,
      backspaceRate: this.keyCount > 0 ? this.backspaceCount / this.keyCount : 0
    };
  }

  resetWindow(): void {
    this.holdDurations  = [];
    this.flightTimes    = [];
    this.lastReleaseMs  = null;
    this.keyCount       = 0;
    this.backspaceCount = 0;
    this.windowStart    = Date.now();
  }

  stop(): void {
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private std(values: number[]): number {
    if (values.length < 2) return 0;
    const avg      = this.mean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}