/**
 * ░▒▓ ROUTE HANDLER ▓▒░
 *
 * "Fate, it seems, is not without a sense of irony."
 *
 * Wraps Express route handlers with automatic error handling.
 */

import type { Request, Response } from 'express';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Wrap a route handler with try-catch error handling.
 * Catches thrown errors and responds with 500 + JSON error message.
 */
export function wrapRoute(
  handler: (req: Request, res: Response) => unknown,
): (req: Request, res: Response) => void {
  return (req, res) => {
    try {
      const result = handler(req, res);
      if (result instanceof Promise) {
        result.catch((err) => {
          if (!res.headersSent) {
            res.status(500).json({ error: getErrorMessage(err) });
          }
        });
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: getErrorMessage(err) });
      }
    }
  };
}
