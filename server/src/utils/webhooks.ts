/**
 * ░▒▓ WEBHOOK UTILITY ▓▒░
 *
 * "Everything that has a beginning has an end."
 *
 * Fire-and-forget webhook for task events.
 * Reads NEO_WEBHOOK_URL from env — no-ops if not set.
 */

export async function fireWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  const url = process.env.NEO_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload, timestamp: Date.now() }),
    });
  } catch {
    // fire and forget — callers don't need to handle webhook failures
  }
}
