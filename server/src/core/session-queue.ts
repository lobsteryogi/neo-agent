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
    this.queues.set(
      key,
      next.then(
        () => {},
        () => {},
      ),
    );

    return next;
  }
}
