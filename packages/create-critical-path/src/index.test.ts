import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, resolveVersions, scaffold } from './index.js';

const packageDir = path.resolve(__dirname, '..');

describe('create-critical-path', () => {
  beforeAll(() => {
    // Produce dist/templates and dist/versions.json from the example apps
    execFileSync(process.execPath, [path.join(packageDir, 'scripts/copy-templates.mjs')]);
  });

  it('parses the directory and framework in any order', () => {
    expect(parseArgs(['--framework=sveltekit', 'my-app'])).toEqual({ targetDir: 'my-app', framework: 'sveltekit' });
    expect(parseArgs(['my-app'])).toEqual({ targetDir: 'my-app', framework: 'nextjs' });
    expect(() => parseArgs(['--framework=rails'])).toThrow(/Unknown framework/);
  });

  it.each(['nextjs', 'sveltekit'] as const)('scaffolds a runnable %s app with pinned versions', (framework) => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cp-scaffold-')), 'My App');
    scaffold({ targetDir: dir, framework, versions: { '@critical-path/core': '9.9.9', '@critical-path/server': '9.9.9', '@critical-path/client': '9.9.9', '@critical-path/react': '9.9.9', '@critical-path/svelte': '9.9.9' } });

    const pkgText = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgText);
    expect(pkg.name).toBe('my-app');
    expect(pkgText).not.toContain('workspace:');
    expect(pkg.dependencies['@critical-path/server']).toBe('^9.9.9');
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toBeUndefined();

    const files = fs.readdirSync(dir, { recursive: true }) as string[];
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    const route = framework === 'nextjs' ? 'app/api/critical-path/[...path]/route.ts' : 'src/routes/api/critical-path/[...path]/+server.ts';
    expect(fs.readFileSync(path.join(dir, route), 'utf8')).toContain('export const { GET, POST, PUT, PATCH, DELETE, OPTIONS }');
    expect(fs.existsSync(path.join(dir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '_gitignore'))).toBe(false);
    if (framework === 'nextjs') expect(fs.existsSync(path.join(dir, 'app/layout.tsx'))).toBe(true);
    if (framework === 'sveltekit') expect(fs.existsSync(path.join(dir, 'src/app.html'))).toBe(true);
  });

  it('refuses to overwrite a non-empty directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-scaffold-'));
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'x');
    expect(() => scaffold({ targetDir: dir, framework: 'nextjs' })).toThrow(/not empty/);
  });

  it('prefers the latest published versions and falls back to bundled ones', async () => {
    const offline = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const bundled = await resolveVersions(offline);
    expect(bundled['@critical-path/core']).toMatch(/^\d+\.\d+\.\d+/);

    const registry = (async () => Response.json({ version: '42.0.0' })) as unknown as typeof fetch;
    expect((await resolveVersions(registry))['@critical-path/core']).toBe('42.0.0');
  });
});
