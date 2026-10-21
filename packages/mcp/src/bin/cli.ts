#!/usr/bin/env node
import { CriticalPathEngine, SQLiteStore, InMemoryStore } from '@critical-path/core';
import { CriticalPathClient } from '@critical-path/client';
import { createCriticalPathMcpServer, startStdioServer } from '../server/index.js';
import { parseArgs, buildApiHeaders, isInsecureRemote } from './args.js';
import { installSkills, DEFAULT_SKILLS_DIR } from './skills.js';
import { SKILLS } from '../skills/index.js';
import type { ToolsetName } from '../tools/definitions.js';

function showHelp() {
  console.log(`
Critical Path MCP Server (Stdio)

Usage:
  npx @critical-path/mcp [options]
  npx @critical-path/mcp skills list
  npx @critical-path/mcp skills install [--dir <path>] [--force]

Environment:
  CRITICAL_PATH_API_TOKEN   Sent as "Authorization: Bearer <token>" in --api mode

Options:
  --db <path>      Path to SQLite database file (uses SQLiteStore)
  --api <url>      Base URL of remote Critical Path server (uses CriticalPathClient)
  --header <h>     Extra request header for --api, as "Name: value" (repeatable)
  --toolsets <l>   Comma-separated tool groups to expose: core, collaboration,
                   scheduling, analytics, guidance (default: all)
  --tools <l>      Comma-separated tool names to expose (combined with --toolsets)
  --read-only      Expose only tools that change nothing
  --help, -h       Display this help message

Skills:
  skills list      List the bundled agent skills (playbooks for multi-step jobs)
  skills install   Write them to <dir>/<name>/SKILL.md (default: ${DEFAULT_SKILLS_DIR});
                   --force replaces files you have edited

Examples:
  # Run against local SQLite database
  npx @critical-path/mcp --db ./critical-path.db

  # Run against remote Next.js or SvelteKit route handler
  npx @critical-path/mcp --api http://localhost:3000/api/critical-path

  # Authenticate against a protected API (token read from the environment)
  CRITICAL_PATH_API_TOKEN=secret npx @critical-path/mcp --api https://app.example.com/api/critical-path

  # Read-only scheduling and analytics tools for a reporting agent
  npx @critical-path/mcp --db ./critical-path.db --toolsets scheduling,analytics,guidance --read-only

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

  if (options.command === 'skills') {
    if (options.subcommand === 'install') {
      for (const result of installSkills(options.dir ?? DEFAULT_SKILLS_DIR, { force: options.force })) {
        const note = result.status === 'skipped' ? ' (edited locally; pass --force to replace)' : '';
        console.log(`${result.status.padEnd(9)} ${result.path}${note}`);
      }
    } else if (options.subcommand === 'list') {
      for (const skill of SKILLS) console.log(`${skill.name}\n  ${skill.description}\n`);
    } else {
      console.error(`Unknown skills command "${options.subcommand}". Use "skills list" or "skills install".`);
      process.exit(1);
    }
    return;
  }

  const selection = { tools: options.tools, toolsets: options.toolsets as ToolsetName[] | undefined, readOnly: options.readOnly };
  let server;

  if (options.api) {
    const headers = buildApiHeaders(options.headers, process.env);
    if (Object.keys(headers).length > 0 && isInsecureRemote(options.api)) {
      console.error('[Critical Path MCP] Warning: sending credentials over plain http to a remote host.');
    }
    const client = new CriticalPathClient({ baseUrl: options.api, headers });
    server = createCriticalPathMcpServer({ client, name: 'critical-path-api-mcp', ...selection });
    console.error(`[Critical Path MCP] Connecting to remote API at ${options.api} over stdio...`);
  } else if (options.db) {
    const store = new SQLiteStore({ filename: options.db });
    const engine = new CriticalPathEngine({ store });
    server = createCriticalPathMcpServer({ engine, name: 'critical-path-sqlite-mcp', ...selection });
    console.error(`[Critical Path MCP] Loaded SQLite database from "${options.db}" over stdio...`);
  } else {
    const store = new InMemoryStore();
    const engine = new CriticalPathEngine({ store });
    server = createCriticalPathMcpServer({ engine, name: 'critical-path-inmemory-mcp', ...selection });
    console.error('[Critical Path MCP] Initialized in-memory store over stdio...');
  }

  await startStdioServer(server);
}

main().catch((err) => {
  console.error('[Critical Path MCP] Fatal error:', err);
  process.exit(1);
});
