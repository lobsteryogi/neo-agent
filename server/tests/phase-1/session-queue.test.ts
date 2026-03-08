import { describe, expect, it } from 'vitest';
import { SessionQueue } from '../../src/core/session-queue';

describe('SessionQueue', () => {
  it('serializes tasks for the same session', async () => {
    const queue = new SessionQueue();
    const order: number[] = [];
    const slow = () =>
      new Promise<void>((r) =>
        setTimeout(() => {
          order.push(1);
          r();
        }, 50),
      );
    const fast = () =>
      new Promise<void>((r) => {
        order.push(2);
        r();
      });
    await Promise.all([queue.enqueue('session-1', slow), queue.enqueue('session-1', fast)]);
    expect(order).toEqual([1, 2]); // slow finishes before fast starts
  });

  it('allows parallel execution for different sessions', async () => {
    const queue = new SessionQueue();
    const order: string[] = [];
    const task = (id: string, delay: number) => () =>
      new Promise<void>((r) =>
        setTimeout(() => {
          order.push(id);
          r();
        }, delay),
      );
    await Promise.all([
      queue.enqueue('session-A', task('A', 50)),
      queue.enqueue('session-B', task('B', 10)),
    ]);
    expect(order).toEqual(['B', 'A']); // B finishes first (different session)
  });

  it('recovers from errors without blocking the queue', async () => {
    const queue = new SessionQueue();
    const fail = () => Promise.reject(new Error('boom'));
    const succeed = () => Promise.resolve('ok');
    await expect(queue.enqueue('s1', fail)).rejects.toThrow('boom');
    const result = await queue.enqueue('s1', succeed);
    expect(result).toBe('ok');
  });
});
