# create-critical-path

## 0.2.0

### Minor Changes

- 6cc6851: Generate runnable apps from the tested demo apps.
  
  - Templates are the repository's `examples/nextjs-demo` (Next.js 16) and `examples/sveltekit-demo` (SvelteKit 3), which CI builds. Previously the scaffolder wrote only a `package.json` and one route file, with the broken Next.js export pattern.
  - `@critical-path/*` dependencies use the latest published versions (bundled versions when offline) instead of a hard-coded `^0.1.0`.
  - Arguments can come in any order (`--framework=sveltekit my-app`), and unknown frameworks are rejected.
  - Refuses to scaffold into a non-empty directory instead of silently doing nothing.
  - `.gitignore` is included in generated projects. Compiled tests are no longer published.

## 0.1.2

### Patch Changes

- Initial open-source release of the CLI scaffolder executable (`npx create-critical-path@latest`).
