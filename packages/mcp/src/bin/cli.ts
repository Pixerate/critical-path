#!/usr/bin/env node
import { CriticalPathEngine, SQLiteStore, InMemoryStore } from '@critical-path/core';
import { CriticalPathClient } from '@critical-path/client';
import { createCriticalPathMcpServer, startStdioServer } from '../server/index.js';
import { parseArgs, buildApiHeaders, isInsecureRemote } from './args.js';

function showHelp() {
  console.log(`
Critical Path MCP Server (Stdio)

Usage:
  npx @critical-path/mcp [options]

Environment:
  CRITICAL_PATH_API_TOKEN   Sent as "Authorization: Bearer <token>" in --api mode

Options:
  --db <path>      Path to SQLite database file (uses SQLiteStore)
  --api <url>      Base URL of remote Critical Path server (uses CriticalPathClient)
  --header <h>     Extra request header for --api, as "Name: value" (repeatable)
  --help, -h       Display this help message

Examples:
  # Run against local SQLite database
  npx @critical-path/mcp --db ./critical-path.db

  # Run against remote Next.js or SvelteKit route handler
  npx @critical-path/mcp --api http://localhost:3000/api/critical-path

  # Authenticate against a protected API (token read from the environment)
  CRITICAL_PATH_API_TOKEN=secret npx @critical-path/mcp --api https://app.example.com/api/critical-path

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
    const headers = buildApiHeaders(options.headers, process.env);
    if (Object.keys(headers).length > 0 && isInsecureRemote(options.api)) {
      console.error('[Critical Path MCP] Warning: sending credentials over plain http to a remote host.');
    }
    const client = new CriticalPathClient({ baseUrl: options.api, headers });
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
