/**
 * ░▒▓ STEP 10 — KUNG FU ▓▒░
 *
 * "I know kung fu."
 *
 * Scan workspace for existing skills.
 */

import * as clack from '@clack/prompts';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { color } from '../../utils/terminal.js';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const workspacePath = join(process.cwd(), 'workspace');
  const skillsDir = join(workspacePath, 'skills');

  const s = clack.spinner();
  s.start('Scanning workspace for skills...');

  const skills: string[] = [];

  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMd = join(skillsDir, entry.name, 'SKILL.md');
          if (existsSync(skillMd)) {
            // Extract skill name from frontmatter
            const content = readFileSync(skillMd, 'utf-8');
            const nameMatch = content.match(/name:\s*(.+)/);
            const name = nameMatch ? nameMatch[1].trim() : entry.name;
            skills.push(name);
          }
        }
      }
    } catch {
      // Silent fallthrough — no skills found
    }
  }

  if (skills.length > 0) {
    s.stop(`Found ${skills.length} skill(s):`);
    for (const skill of skills) {
      clack.log.info(`  ${color.neonCyan('⚡')} ${skill}`);
    }
  } else {
    s.stop('No existing skills found — you can add them later to workspace/skills/');
  }

  return { answers: {}, skipped: skills.length === 0 };
};
