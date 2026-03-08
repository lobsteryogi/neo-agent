#!/usr/bin/env node
import { runWizard } from './wizard.js';

runWizard().catch((err) => {
  console.error('Wizard failed:', err);
  process.exit(1);
});
