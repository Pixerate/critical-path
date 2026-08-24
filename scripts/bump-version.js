import fs from 'node:fs';
import path from 'node:path';

const bumpType = process.argv[2] || 'patch';
const pkgFiles = [
  'package.json',
  'packages/core/package.json',
  'packages/server/package.json',
  'packages/client/package.json',
  'packages/react/package.json',
  'packages/svelte/package.json',
  'packages/create-critical-path/package.json',
  'examples/nextjs-demo/package.json',
  'examples/sveltekit-demo/package.json'
];

// Determine base version from packages/core/package.json
const corePkgPath = path.resolve('packages/core/package.json');
const corePkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'));
const parts = (corePkg.version || '0.1.0').split('.').map((n) => parseInt(n, 10) || 0);

if (bumpType === 'major') {
  parts[0]++;
  parts[1] = 0;
  parts[2] = 0;
} else if (bumpType === 'minor') {
  parts[1]++;
  parts[2] = 0;
} else {
  parts[2]++;
}

const newVersion = `${parts[0]}.${parts[1]}.${parts[2]}`;

for (const pkgFile of pkgFiles) {
  const fullPath = path.resolve(pkgFile);
  if (!fs.existsSync(fullPath)) continue;
  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  json.version = newVersion;
  fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n');
  console.log(`Updated ${json.name} -> v${newVersion}`);
}
