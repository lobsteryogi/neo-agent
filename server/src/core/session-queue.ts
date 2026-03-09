/**
 * ░▒▓ SESSION QUEUE ▓▒░
 *
 * "You can't stop me. Not in this construct."
 *
 * Promise-chain per session key — serializes within a session,
 * allows parallel execution across different sessions.
 */

export class SessionQueue {
  private queues = new Map<string, Promise<void>>();

  async enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.then(() => fn());

    // Store the chain (swallow errors to not block subsequent tasks)
    const chain = next.then(
      () => {},
      () => {},
    );
    this.queues.set(key, chain);

    // Clean up completed entries to prevent unbounded map growth
    chain.then(() => {
      if (this.queues.get(key) === chain) {
        this.queues.delete(key);
      }
    });

    return next;
  }
}
