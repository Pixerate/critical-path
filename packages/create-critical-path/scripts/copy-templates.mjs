// Copies the example apps into dist/templates and records current package versions, so the
// scaffolder generates exactly the apps CI builds.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

const EXCLUDE = new Set(['node_modules', '.next', '.svelte-kit', 'build', 'dist', 'next-env.d.ts', 'vitest.config.ts', '.turbo']);
const isExcluded = (path) => {
  const name = basename(path);
  return EXCLUDE.has(name) || name.endsWith('.test.ts') || name.endsWith('.tsbuildinfo');
};

const templates = { nextjs: 'examples/nextjs-demo', sveltekit: 'examples/sveltekit-demo' };
rmSync(join(dist, 'templates'), { recursive: true, force: true });
for (const [name, source] of Object.entries(templates)) {
  const target = join(dist, 'templates', name);
  mkdirSync(target, { recursive: true });
  cpSync(join(root, source), target, { recursive: true, filter: (path) => !isExcluded(path) });
  // npm strips .gitignore from published packages; the scaffolder renames it back
  if (existsSync(join(target, '.gitignore'))) renameSync(join(target, '.gitignore'), join(target, '_gitignore'));
}

const versions = {};
for (const dir of readdirSync(join(root, 'packages'))) {
  const pkgPath = join(root, 'packages', dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.name?.startsWith('@critical-path/')) versions[pkg.name] = pkg.version;
}
writeFileSync(join(dist, 'versions.json'), JSON.stringify(versions, null, 2) + '\n');
console.log(`Copied templates (${Object.keys(templates).join(', ')}) and ${Object.keys(versions).length} package versions.`);
