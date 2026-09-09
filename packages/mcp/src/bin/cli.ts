#!/usr/bin/env node
import { CriticalPathEngine, SQLiteStore, InMemoryStore } from '@critical-path/core';
import { CriticalPathClient } from '@critical-path/client';
import { createCriticalPathMcpServer, startStdioServer } from '../server/index.js';

function parseArgs(args: string[]) {
  const options: { db?: string; api?: string; help?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--db' && args[i + 1]) {
      options.db = args[++i];
    } else if (arg === '--api' && args[i + 1]) {
      options.api = args[++i];
    }
  }
  return options;
}

function showHelp() {
  console.log(`
Critical Path MCP Server (Stdio)

Usage:
  npx @critical-path/mcp [options]

Options:
  --db <path>      Path to SQLite database file (uses SQLiteStore)
  --api <url>      Base URL of remote Critical Path server (uses CriticalPathClient)
  --help, -h       Display this help message

Examples:
  # Run against local SQLite database
  npx @critical-path/mcp --db ./critical-path.db

  # Run against remote Next.js or SvelteKit route handler
  npx @critical-path/mcp --api http://localhost:3000/api/critical-path

  # Run with in-memory store (for testing)
  npx @critical-path/mcp
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  let server;

  if (options.api) {
    const client = new CriticalPathClient({ baseUrl: options.api });
    server = createCriticalPathMcpServer({ client, name: 'critical-path-api-mcp' });
    console.error(`[Critical Path MCP] Connecting to remote API at ${options.api} over stdio...`);
  } else if (options.db) {
    const store = new SQLiteStore({ filename: options.db });
    const engine = new CriticalPathEngine({ store });
    server = createCriticalPathMcpServer({ engine, name: 'critical-path-sqlite-mcp' });
    console.error(`[Critical Path MCP] Loaded SQLite database from "${options.db}" over stdio...`);
  } else {
    const store = new InMemoryStore();
    const engine = new CriticalPathEngine({ store });
    server = createCriticalPathMcpServer({ engine, name: 'critical-path-inmemory-mcp' });
    console.error('[Critical Path MCP] Initialized in-memory store over stdio...');
  }

  await startStdioServer(server);
}

main().catch((err) => {
  console.error('[Critical Path MCP] Fatal error:', err);
  process.exit(1);
});
