import { describe, expect, it, vi } from 'vitest';
import { wrapRoute } from '../../src/api/route-handler';

function mockReq(): any {
  return {};
}

function mockRes(): any {
  const res: any = { headersSent: false };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockImplementation(() => {
    res.headersSent = true;
    return res;
  });
  return res;
}

describe('wrapRoute', () => {
  it('calls the handler and returns its result', () => {
    const handler = vi.fn().mockImplementation((_req, res) => res.json({ ok: true }));
    const wrapped = wrapRoute(handler);
    const req = mockReq();
    const res = mockRes();
    wrapped(req, res);
    expect(handler).toHaveBeenCalledWith(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('catches synchronous errors and returns 500', () => {
    const handler = vi.fn().mockImplementation(() => {
      throw new Error('sync boom');
    });
    const wrapped = wrapRoute(handler);
    const res = mockRes();
    wrapped(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'sync boom' });
  });

  it('catches async errors and returns 500', async () => {
    const handler = vi.fn().mockImplementation(() => Promise.reject(new Error('async boom')));
    const wrapped = wrapRoute(handler);
    const res = mockRes();
    wrapped(mockReq(), res);
    // Allow microtask to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'async boom' });
  });

  it('does not send 500 if headers already sent (sync)', () => {
    const handler = vi.fn().mockImplementation((_req, res) => {
      res.json({ partial: true }); // sets headersSent = true
      throw new Error('after headers');
    });
    const wrapped = wrapRoute(handler);
    const res = mockRes();
    wrapped(mockReq(), res);
    // json was called once for the response, NOT again for the error
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not send 500 if headers already sent (async)', async () => {
    const handler = vi.fn().mockImplementation(async (_req, res) => {
      res.json({ ok: true });
      throw new Error('late async error');
    });
    const wrapped = wrapRoute(handler);
    const res = mockRes();
    wrapped(mockReq(), res);
    await new Promise((r) => setTimeout(r, 0));
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('handles non-Error thrown values', () => {
    const handler = vi.fn().mockImplementation(() => {
      throw 'string error'; // eslint-disable-line no-throw-literal
    });
    const wrapped = wrapRoute(handler);
    const res = mockRes();
    wrapped(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'string error' });
  });

  it('passes req and res to handler', () => {
    let capturedReq: any;
    let capturedRes: any;
    const handler = vi.fn().mockImplementation((req, res) => {
      capturedReq = req;
      capturedRes = res;
    });
    const wrapped = wrapRoute(handler);
    const req = mockReq();
    const res = mockRes();
    wrapped(req, res);
    expect(capturedReq).toBe(req);
    expect(capturedRes).toBe(res);
  });
});
