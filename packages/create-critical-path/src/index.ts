import fs from 'node:fs';
import path from 'node:path';

export async function runCLI(): Promise<void> {
  console.log(`
  🚀 Welcome to Critical Path!
  The Headless Project Management System Scaffolder
  --------------------------------------------------
  `);

  const args = process.argv.slice(2);
  const targetDir = args[0] || 'my-critical-path-app';
  const frameworkArg = args.find((a) => a.startsWith('--framework='))?.split('=')[1] || 'nextjs';

  console.log(`📂 Target Directory: ./${targetDir}`);
  console.log(`🛠️  Framework Choice: ${frameworkArg}`);

  const fullPath = path.resolve(process.cwd(), targetDir);

  if (fs.existsSync(fullPath)) {
    console.log(`⚠️  Directory "${targetDir}" already exists. Skipping scaffolding creation.`);
    return;
  }

  fs.mkdirSync(fullPath, { recursive: true });

  if (frameworkArg === 'sveltekit') {
    scaffoldSvelteKitApp(fullPath, targetDir);
  } else {
    scaffoldNextJsApp(fullPath, targetDir);
  }

  console.log(`
  ✅ Successfully initialized Critical Path app in ./${targetDir}!
  
  Next steps:
    cd ${targetDir}
    pnpm install  (or npm install)
    pnpm dev      (or npm run dev)
  `);
}

function scaffoldNextJsApp(destDir: string, appName: string) {
  const pkg = {
    name: appName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start'
    },
    dependencies: {
      '@critical-path/core': '^0.1.0',
      '@critical-path/server': '^0.1.0',
      '@critical-path/react': '^0.1.0',
      '@critical-path/client': '^0.1.0',
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0'
    }
  };

  fs.writeFileSync(path.join(destDir, 'package.json'), JSON.stringify(pkg, null, 2));

  const routeDir = path.join(destDir, 'app/api/critical-path/[...path]');
  fs.mkdirSync(routeDir, { recursive: true });

  const routeContent = `import { createNextHandler } from '@critical-path/server';

const handler = createNextHandler({
  initialData: {
    projects: [{ id: 'p1', key: 'CP', name: 'Critical Path Demo' }],
    tasks: [
      { id: 't1', projectId: 'p1', title: 'Setup Critical Path Framework', status: 'done', priority: 'urgent' },
      { id: 't2', projectId: 'p1', title: 'Mount API Route Handler', status: 'in_progress', priority: 'high' }
    ]
  }
});

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
`;

  fs.writeFileSync(path.join(routeDir, 'route.ts'), routeContent);
}

function scaffoldSvelteKitApp(destDir: string, appName: string) {
  const pkg = {
    name: appName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite dev',
      build: 'vite build'
    },
    dependencies: {
      '@critical-path/core': '^0.1.0',
      '@critical-path/server': '^0.1.0',
      '@critical-path/svelte': '^0.1.0',
      '@critical-path/client': '^0.1.0',
      '@sveltejs/kit': '^2.0.0',
      svelte: '^5.0.0',
      vite: '^6.0.0'
    }
  };

  fs.writeFileSync(path.join(destDir, 'package.json'), JSON.stringify(pkg, null, 2));

  const endpointDir = path.join(destDir, 'src/routes/api/critical-path/[...path]');
  fs.mkdirSync(endpointDir, { recursive: true });

  const serverContent = `import { createSvelteKitHandler } from '@critical-path/server';

const handler = createSvelteKitHandler({
  initialData: {
    projects: [{ id: 'p1', key: 'SVELTE', name: 'SvelteKit PM' }]
  }
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;
`;

  fs.writeFileSync(path.join(endpointDir, '+server.ts'), serverContent);
}
