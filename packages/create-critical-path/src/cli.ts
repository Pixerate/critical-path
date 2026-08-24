#!/usr/bin/env node
import { runCLI } from './index.js';

runCLI().catch((err) => {
  console.error('❌ Error initializing Critical Path project:', err);
  process.exit(1);
});
