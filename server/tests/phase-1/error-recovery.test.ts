import { describe, expect, it, vi } from 'vitest';
import { ErrorRecovery } from '../../src/core/error-recovery';

const mockMessage = { sessionKey: 'test-session', content: 'test' };

describe('ErrorRecovery', () => {
  it('returns retryable response on TIMEOUT', async () => {
    const historian = { logError: vi.fn() };
    const memory = { savePartialTranscript: vi.fn().mockResolvedValue(undefined) };
    const recovery = new ErrorRecovery(historian, memory);
    const result = await recovery.handle(new Error('TIMEOUT'), mockMessage);
    expect(result.retryable).toBe(true);
    expect(result.neoQuip).toContain('Deadline');
  });

  it('preserves partial response on SQLITE error', async () => {
    const historian = { logError: vi.fn() };
    const memory = { savePartialTranscript: vi.fn().mockResolvedValue(undefined) };
    const message = { ...mockMessage, _lastPartialResponse: 'partial...' };
    const recovery = new ErrorRecovery(historian, memory);
    const result = await recovery.handle(new Error('SQLITE_BUSY'), message);
    expect(result.content).toContain('partial...');
  });

  it('logs all errors to audit trail', async () => {
    const historian = { logError: vi.fn() };
    const memory = { savePartialTranscript: vi.fn().mockResolvedValue(undefined) };
    const recovery = new ErrorRecovery(historian, memory);
    await recovery.handle(new Error('unknown'), mockMessage);
    expect(historian.logError).toHaveBeenCalled();
  });

  it('attempts partial transcript save on any crash', async () => {
    const historian = { logError: vi.fn() };
    const memory = { savePartialTranscript: vi.fn().mockResolvedValue(undefined) };
    const recovery = new ErrorRecovery(historian, memory);
    await recovery.handle(new Error('crash'), mockMessage);
    expect(memory.savePartialTranscript).toHaveBeenCalledWith(mockMessage.sessionKey);
  });

  it('still returns response even if partial save fails', async () => {
    const historian = { logError: vi.fn() };
    const memory = {
      savePartialTranscript: vi.fn().mockRejectedValue(new Error('disk full')),
    };
    const recovery = new ErrorRecovery(historian, memory);
    const result = await recovery.handle(new Error('crash'), mockMessage);
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
  });
});
