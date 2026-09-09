# Critical Path - Gotchas & Workarounds

This document tracks known issues, pitfalls, non-obvious quirks, and their solutions or workarounds across the Critical Path repository. AI agents and contributors must consult this document when debugging or encountering unexpected behavior and update it whenever a new gotcha or workaround is discovered.

---

## Template for New Entries

```markdown
### [Short Description of Issue / Pitfall]
- **Area / Package**: (e.g. `@critical-path/core`, `@critical-path/server`, CI/CD, SQLiteStore)
- **Symptom / Behavior**: Describe what fails or behaves unexpectedly.
- **Root Cause**: Explain why it happens.
- **Solution / Workaround**: Step-by-step instructions or code snippets to fix or work around the problem.
```

---

## Known Gotchas

### Importing `@critical-path/mcp` in Browser Bundlers (Vite, Next.js client, SvelteKit)
- **Area / Package**: `@critical-path/mcp`, `@critical-path/react`, `@critical-path/svelte`
- **Symptom / Behavior**: Vite or client-side bundler warns `Module "node:process" has been externalized for browser compatibility` or attempts to bundle `@modelcontextprotocol/sdk/server/stdio.js`.
- **Root Cause**: The root entrypoint `@critical-path/mcp` exports both the standard server (which imports Node stdio transports) and the WebMCP client.
- **Solution / Workaround**: Client-side UI code or hooks should import from the dedicated `@critical-path/mcp/web` subpath export:
  ```ts
  import { registerWebMcpTools } from '@critical-path/mcp/web';
  ```
  Both `@critical-path/react` (`useWebMCP`) and `@critical-path/svelte` (`createWebMcpState`) already use this subpath internally.

### Publishing New Scoped Packages via npm Trusted Publishing / Changesets
- **Area / Package**: CI/CD, `@critical-path/mcp`, `.changeset`
- **Symptom / Behavior**: `changeset publish` in GitHub Actions fails with `Package @critical-path/<pkg> was not found in the registry` and `ENEEDAUTH: This command requires you to be logged in to https://registry.npmjs.org/`.
- **Root Cause**: npm Trusted Publishing (OIDC Provenance) requires the package to already exist on npmjs.com with Trusted Publisher configured in its settings, or requires an `NPM_TOKEN` secret for initial creation. Additionally, scoped packages default to private unless `"publishConfig": { "access": "public" }` is explicitly present in the package's `package.json`.
- **Solution / Workaround**:
  1. Always add `"publishConfig": { "access": "public" }` to new package `package.json` files.
  2. For the very first publish of a brand new scoped package name, either provide `NPM_TOKEN` with write permission in GitHub Actions secrets, or manually publish version `0.1.0` once with `npm publish --access public` and configure the GitHub repository as a Trusted Publisher on npmjs.com.

