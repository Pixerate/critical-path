import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Framework = 'nextjs' | 'sveltekit';

export interface ScaffoldOptions {
  /** Directory to create. */
  targetDir: string;
  framework: Framework;
  /** Versions for `@critical-path/*` packages. Default: latest from npm, falling back to bundled versions. */
  versions?: Record<string, string>;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Templates and versions.json are produced in dist/ by the build; tests run from src/.
const DIST_DIR = fs.existsSync(path.join(HERE, 'templates')) ? HERE : path.join(HERE, '..', 'dist');

export function parseArgs(argv: string[]): { targetDir: string; framework: Framework } {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const frameworkFlag = argv.find((a) => a.startsWith('--framework='))?.split('=')[1];
  const framework = (frameworkFlag ?? 'nextjs') as Framework;
  if (framework !== 'nextjs' && framework !== 'sveltekit') {
    throw new Error(`Unknown framework "${framework}". Use --framework=nextjs or --framework=sveltekit.`);
  }
  return { targetDir: positional[0] ?? 'my-critical-path-app', framework };
}

function bundledVersions(): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'versions.json'), 'utf8'));
}

/** Looks up the latest published versions, keeping bundled versions for any that fail. */
export async function resolveVersions(fetchImpl: typeof fetch = fetch): Promise<Record<string, string>> {
  const versions = bundledVersions();
  await Promise.all(
    Object.keys(versions).map(async (name) => {
      try {
        const res = await fetchImpl(`https://registry.npmjs.org/${name}/latest`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) versions[name] = ((await res.json()) as { version: string }).version;
      } catch {
        // Offline or registry unavailable: keep the bundled version
      }
    })
  );
  return versions;
}

/** Creates a new app from the template for `framework`. */
export function scaffold({ targetDir, framework, versions = bundledVersions() }: ScaffoldOptions): string {
  const fullPath = path.resolve(process.cwd(), targetDir);
  if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length > 0) {
    throw new Error(`Directory "${targetDir}" already exists and is not empty.`);
  }

  fs.cpSync(path.join(DIST_DIR, 'templates', framework), fullPath, { recursive: true });
  const gitignore = path.join(fullPath, '_gitignore');
  if (fs.existsSync(gitignore)) fs.renameSync(gitignore, path.join(fullPath, '.gitignore'));

  const pkgPath = path.join(fullPath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = path.basename(fullPath).toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  pkg.version = '0.1.0';
  delete pkg.scripts?.test;
  delete pkg.devDependencies?.vitest;
  for (const section of ['dependencies', 'devDependencies'] as const) {
    for (const [name, range] of Object.entries<string>(pkg[section] ?? {})) {
      if (range.startsWith('workspace:')) {
        const version = versions[name];
        if (!version) throw new Error(`No version available for ${name}.`);
        pkg[section][name] = `^${version}`;
      }
    }
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return fullPath;
}

export async function runCLI(argv = process.argv.slice(2)): Promise<void> {
  const { targetDir, framework } = parseArgs(argv);
  console.log(`\n  Critical Path: creating a ${framework === 'nextjs' ? 'Next.js' : 'SvelteKit'} app in ./${targetDir}\n`);

  scaffold({ targetDir, framework, versions: await resolveVersions() });

  console.log(`  Done. Next steps:

    cd ${targetDir}
    npm install
    npm run dev
`);
}
