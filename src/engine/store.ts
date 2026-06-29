import { GameState, Action, GameConfig } from './types';
import { createInitialState } from './state';
import { applyAction } from './reducer';

type Listener = (state: GameState) => void;

export class GameStore {
  private state: GameState;
  private listeners: Set<Listener> = new Set();
  private history: GameState[] = [];

  constructor(config: GameConfig) {
    this.state = createInitialState(config);
  }

  getState(): GameState {
    return this.state;
  }

  dispatch(action: Action): void {
    const next = applyAction(this.state, action);
    this.history.push(this.state);
    this.state = next;
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  undo(): boolean {
    if (this.history.length === 0) return false;
    this.state = this.history.pop()!;
    this.notify();
    return true;
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }
}
