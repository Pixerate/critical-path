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

### Firebase App Hosting Deployment Requires `apps/docs/package-lock.json` Sync
- **Area / Package**: `apps/docs`, Firebase App Hosting, Cloud Build
- **Symptom / Behavior**: Cloud Build step 3 fails with `npm error code EUSAGE: npm ci can only install packages when your package.json and package-lock.json are in sync. Missing: <pkg> from lock file`.
- **Root Cause**: Firebase App Hosting runs in `apps/docs` and uses `npm ci` rather than `pnpm install`. Modifying `apps/docs/package.json` with `pnpm` updates `pnpm-lock.yaml`, but leaves `apps/docs/package-lock.json` outdated.
- **Solution / Workaround**: Whenever adding or updating dependencies in `apps/docs`, always regenerate `apps/docs/package-lock.json`:
  ```bash
  cd apps/docs && npm install --package-lock-only
  ```

### Greedy Subpath Stripping in Server Router with Repeated Route Names
- **Area / Package**: `@critical-path/server`, `CriticalPathRouter`
- **Symptom / Behavior**: Requests to endpoints such as `/api/critical-path/projects/:id/critical-path` return 404 Not Found even though the subresource route handler is defined.
- **Root Cause**: The router stripped the route prefix using a greedy regular expression `pathname.replace(/^.*\/critical-path\/?/, '')`. When the pathname contains the prefix substring again deeper in the route path (e.g. `/api/critical-path/.../critical-path`), the greedy `.*` consumed everything up to the second occurrence, resulting in an empty or corrupt subpath.
- **Solution / Workaround**: Use a non-greedy wildcard `^.*?\/critical-path\/?` so only the base route prefix is stripped, leaving subsequent path segments intact:
  ```ts
  const subpath = pathname.replace(/^.*?\/critical-path\/?/, '').replace(/^\/+/, '');
  ```

### Continuous Stacked Layouts & Streamgraphs Require Tabular Zero-Filling
- **Area / Package**: `@critical-path/core`, `@critical-path/react`, `@critical-path/svelte`, D3 (`d3.stack`, `d3.stackOffsetWiggle`)
- **Symptom / Behavior**: Streamgraph or stacked area SVG path `d` attributes evaluate to `NaN` or fail to render entirely when certain series (assignees, teams, task types) have no activity in particular time buckets.
- **Root Cause**: D3 baseline offset algorithms (notably `d3.stackOffsetWiggle` and `d3.stackOffsetSilhouette`) calculate weighted baselines across all layers simultaneously. If any key in `seriesKeys` is `undefined` in any bucket `values`, D3 arithmetic results in `NaN`, which poisons the entire path calculation.
- **Solution / Workaround**: In `calculateWorkloadDistribution`, the engine collects all unique `seriesKeys` across the entire queried timeline upfront and initializes every bucket's `values` dictionary with `0` for every key. When writing custom aggregators for continuous stacked visualizations, always ensure every series key is explicitly zero-filled in every bucket.

### Deterministic Reference Dates in Task Progress & EVM Domain Tests
- **Area / Package**: `@critical-path/core`, `reconstructTaskProgressHistory`, `calculateTaskEVM`
- **Symptom / Behavior**: Tests asserting curve profiles (`linear`, `s_curve`, `early_surge`, `late_rush`) intermittently or suddenly fail with `expected 'stalled'` days after being authored.
- **Root Cause**: `reconstructTaskProgressHistory` and `calculateTaskEVM` evaluate stalls and schedule durations relative to `referenceDate ?? new Date()`. If unit test fixtures hardcode historical activity dates without specifying `referenceDate`, real time elapsing causes `now - lastActivity > stallThresholdMs` (5 days), misclassifying normal progress as `'stalled'`.
- **Solution / Workaround**: Always supply an explicit, deterministic `referenceDate` in unit test options when verifying time-sensitive progress curves or EVM calculations:
  ```ts
  const referenceDate = new Date('2026-09-09T12:00:00Z');
  const history = reconstructTaskProgressHistory(task, activities, { referenceDate });
  ```

### Firebase App Hosting Default Domain vs Custom Domain in Astro Sitemaps
- **Area / Package**: `apps/docs`, Astro Starlight, Firebase App Hosting
- **Symptom / Behavior**: `sitemap.xml` returns 200 on the live deployment (e.g. `*.uchiage.app`), but search crawlers fail because `<loc>` points to sub-sitemaps on an unconfigured custom domain returning HTTP 404.
- **Root Cause**: Astro's sitemap generation relies on `site` defined in `astro.config.mjs`. If set to a custom domain before DNS/domain verification completes in Firebase App Hosting, the generated sitemap index directs bots to 404s.
- **Solution / Workaround**: Configure `site: process.env.DOCS_SITE_URL || 'https://criticalpath.uchiage.app'` in `astro.config.mjs` and sync scripts generating `robots.txt`, `sitemap.xml`, and `llms.txt` so default builds produce valid URLs for the active deployment host.



