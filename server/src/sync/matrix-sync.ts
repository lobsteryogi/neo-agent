/**
 * ░▒▓ MATRIX SYNC ▓▒░
 *
 * "The Matrix has you."
 *
 * Git-based auto-sync of memory + workspace across machines.
 * Runs on a configurable interval, commits and pushes changes,
 * then pulls remote changes with rebase.
 */

import { execSync } from 'child_process';

export class MatrixSync {
  private interval?: ReturnType<typeof setInterval>;
  private syncing = false;

  constructor(private cwd: string) {}

  start(intervalMinutes: number) {
    if (this.interval) this.stop();
    this.interval = setInterval(() => this.sync(), intervalMinutes * 60_000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async sync(): Promise<{ success: boolean; error?: string }> {
    if (this.syncing) return { success: false, error: 'Sync already in progress' };
    this.syncing = true;

    try {
      this.exec('git add -A');
      this.exec(`git commit -m "Matrix Sync: ${new Date().toISOString()}" --allow-empty`);
      this.exec('git push');
      this.exec('git pull --rebase');
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    } finally {
      this.syncing = false;
    }
  }

  private exec(command: string): string {
    return execSync(command, {
      cwd: this.cwd,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: 'pipe',
    });
  }

  get isRunning(): boolean {
    return this.interval !== undefined;
  }
}
