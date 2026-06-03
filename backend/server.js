import 'dotenv/config';
import { start } from './src/bootstrap.js';

// Entry point. All logic lives in the tested src/ modules; this file and
// src/bootstrap.js are the only untested wiring (the composition root).
start().catch((err) => {
  console.error('Failed to start TrueCapture backend:', err);
  process.exit(1);
});
