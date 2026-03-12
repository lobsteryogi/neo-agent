/**
 * ░▒▓ USER PROFILE REPO ▓▒░
 *
 * "I know you. You're Neo."
 *
 * Per-user profiles for Telegram DMs.
 * Stores display names and onboarding state.
 */

import type Database from 'better-sqlite3';

export interface UserProfile {
  id: string; // e.g. "telegram:12345"
  channel: string;
  displayName: string | null;
  onboarded: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Whitelisted column mappings — prevents SQL injection via dynamic field names. */
const FIELD_MAP: Record<string, string> = {
  displayName: 'display_name',
  onboarded: 'onboarded',
};

export class UserProfileRepo {
  constructor(private db: Database.Database) {}

  get(id: string): UserProfile | undefined {
    const row = this.db.prepare('SELECT * FROM user_profiles WHERE id = ?').get(id) as any;
    return row ? this.rowToProfile(row) : undefined;
  }

  upsert(
    id: string,
    channel: string,
    updates: { displayName?: string; onboarded?: boolean },
  ): UserProfile {
    const now = Date.now();

    return this.db.transaction(() => {
      // INSERT OR IGNORE to handle race conditions
      this.db
        .prepare(
          'INSERT OR IGNORE INTO user_profiles (id, channel, display_name, onboarded, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, channel, updates.displayName ?? null, updates.onboarded ? 1 : 0, now, now);

      // Then update with provided fields (whitelisted)
      const sets: string[] = ['updated_at = ?'];
      const values: unknown[] = [now];
      for (const [key, value] of Object.entries(updates)) {
        const col = FIELD_MAP[key];
        if (!col) continue; // Skip unknown fields
        sets.push(`${col} = ?`);
        values.push(key === 'onboarded' ? (value ? 1 : 0) : value);
      }
      values.push(id);
      this.db.prepare(`UPDATE user_profiles SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      return this.get(id)!;
    })();
  }

  private rowToProfile(row: any): UserProfile {
    return {
      id: row.id,
      channel: row.channel,
      displayName: row.display_name ?? null,
      onboarded: !!row.onboarded,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
