# Changesets

Hello and welcome! This folder contains changesets for Critical Path.

## What is a Changeset?

A changeset is a piece of information about a change made to a package. When you make a pull request or commit that modifies package behavior, run:

```bash
pnpm changeset
```

This interactive prompt will ask:
1. Which packages have changed (`@critical-path/core`, `@critical-path/server`, etc.)
2. What semver bump type to apply (`patch`, `minor`, or `major`)
3. A summary of what was changed

It creates a small markdown file in `.changeset/`. When merged to `main`, GitHub Actions automatically:
1. Bumps ONLY the modified package versions
2. Generates/updates per-package `CHANGELOG.md` files
3. Publishes ONLY the modified packages to NPM with OIDC build provenance
