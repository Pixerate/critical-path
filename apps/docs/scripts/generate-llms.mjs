import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://criticalpath.pixerate.com';
const DOCS_DIR = path.resolve(__dirname, '../src/content/docs');
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const ROOT_DIR = path.resolve(__dirname, '../../..');

const SECTIONS = [
  {
    title: 'Start Here',
    dir: 'getting-started',
    files: ['introduction.md', 'quick-start.md', 'architecture.md'],
  },
  {
    title: 'Core Engine',
    dir: 'core',
    files: [
      'engine.md',
      'data-model.md',
      'dependencies.md',
      'lifecycle.md',
      'ladder-of-abstraction.md',
    ],
  },
  {
    title: 'Storage Adapters',
    dir: 'storage',
    files: ['in-memory.md', 'sqlite.md', 'firebase.md', 'custom.md'],
  },
  {
    title: 'Framework Adapters',
    dir: 'frameworks',
    files: ['nextjs.md', 'sveltekit.md', 'web-handler.md'],
  },
  {
    title: 'Frontend UI Libraries',
    dir: 'ui',
    files: ['react.md', 'svelte.md'],
  },
  {
    title: 'Plugins & Extensibility',
    dir: 'plugins',
    files: ['creating-plugins.md', 'audit-log.md'],
  },
  {
    title: 'Model Context Protocol (MCP)',
    dir: 'mcp',
    files: ['overview.md', 'server.md', 'webmcp.md'],
  },
  {
    title: 'Reference & AI',
    dir: 'reference',
    files: ['agents.md', 'api.md', 'types.md'],
  },
];

function parseFrontmatter(rawContent) {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { frontmatter: {}, body: rawContent };
  }

  const frontmatterStr = match[1];
  const body = rawContent.slice(match[0].length).trim();
  const frontmatter = {};

  for (const line of frontmatterStr.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

function generate() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  const collectedDocs = [];

  for (const section of SECTIONS) {
    const sectionDocs = [];
    for (const filename of section.files) {
      const filePath = path.join(DOCS_DIR, section.dir, filename);
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        continue;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);
      const slug = filename.replace(/\.mdx?$/, '');
      const url = `${BASE_URL}/${section.dir}/${slug}/`;

      sectionDocs.push({
        title: frontmatter.title || slug,
        description: frontmatter.description || '',
        url,
        body,
        section: section.title,
        dir: section.dir,
        slug,
      });
    }

    collectedDocs.push({
      sectionTitle: section.title,
      docs: sectionDocs,
    });
  }

  // 1. Generate llms.txt
  let llmsTxt = `# Critical Path

> Critical Path is an extensible, headless project management engine and framework for modern web applications.

Critical Path decouples project management logic from the presentation layer. It provides a core DAG/scheduling dependency resolution engine, universal Web Fetch route handlers, pluggable storage adapters (In-Memory, SQLite, Firestore), reactive UI primitives for React and Svelte, and native Model Context Protocol (MCP) and WebMCP tools for autonomous AI coding agents.

- Website: ${BASE_URL}
- GitHub: https://github.com/Pixerate/Critical-Path
- Full Context: ${BASE_URL}/llms-full.txt
- Sitemap: ${BASE_URL}/sitemap.xml

## Start Here
`;

  for (const { sectionTitle, docs } of collectedDocs) {
    if (sectionTitle !== 'Start Here') {
      llmsTxt += `\n## ${sectionTitle}\n\n`;
    } else {
      llmsTxt += `\n`;
    }
    for (const doc of docs) {
      if (doc.description) {
        llmsTxt += `- [${doc.title}](${doc.url}): ${doc.description}\n`;
      } else {
        llmsTxt += `- [${doc.title}](${doc.url})\n`;
      }
    }
  }

  llmsTxt += `\n## Optional & External Resources\n\n`;
  llmsTxt += `- [Full Documentation Bundle](${BASE_URL}/llms-full.txt): Complete combined documentation in plain text markdown format.\n`;
  llmsTxt += `- [Developer Guide](https://github.com/Pixerate/Critical-Path/blob/main/docs/DEVELOPER_GUIDE.md): Monorepo setup, contributing guide, and testing workflow.\n`;
  llmsTxt += `- [Gotchas & Workarounds](https://github.com/Pixerate/Critical-Path/blob/main/GOTCHAS.md): Known issues, pitfalls, and established workarounds.\n`;
  llmsTxt += `- [GitHub Repository](https://github.com/Pixerate/Critical-Path): Source code, issues, and discussions.\n`;

  // Write llms.txt to apps/docs/public and root
  const docsLlmsPath = path.join(PUBLIC_DIR, 'llms.txt');
  fs.writeFileSync(docsLlmsPath, llmsTxt, 'utf-8');
  console.log(`Generated ${docsLlmsPath}`);

  const rootLlmsPath = path.join(ROOT_DIR, 'llms.txt');
  fs.writeFileSync(rootLlmsPath, llmsTxt, 'utf-8');
  console.log(`Generated ${rootLlmsPath}`);

  // 2. Generate llms-full.txt
  let llmsFullTxt = `# Critical Path — Full Documentation Bundle

> Critical Path is an enterprise-ready headless project management engine for modern web applications.
> Source: ${BASE_URL}
> Documentation generated on: ${new Date().toISOString()}

================================================================================
`;

  for (const { sectionTitle, docs } of collectedDocs) {
    llmsFullTxt += `\n\n# SECTION: ${sectionTitle.toUpperCase()}\n`;
    llmsFullTxt += `================================================================================\n`;

    for (const doc of docs) {
      llmsFullTxt += `\n## ${doc.title}\n`;
      llmsFullTxt += `URL: ${doc.url}\n`;
      if (doc.description) {
        llmsFullTxt += `Description: ${doc.description}\n`;
      }
      llmsFullTxt += `\n${doc.body}\n`;
      llmsFullTxt += `\n--------------------------------------------------------------------------------\n`;
    }
  }

  const docsLlmsFullPath = path.join(PUBLIC_DIR, 'llms-full.txt');
  fs.writeFileSync(docsLlmsFullPath, llmsFullTxt, 'utf-8');
  console.log(`Generated ${docsLlmsFullPath}`);

  // 3. Generate robots.txt
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap-index.xml
Sitemap: ${BASE_URL}/sitemap.xml
`;
  const robotsPath = path.join(PUBLIC_DIR, 'robots.txt');
  fs.writeFileSync(robotsPath, robotsTxt, 'utf-8');
  console.log(`Generated ${robotsPath}`);

  // 4. Generate sitemap.xml
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-0.xml</loc>
  </sitemap>
</sitemapindex>
`;
  const sitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, sitemapXml, 'utf-8');
  console.log(`Generated ${sitemapPath}`);
}

generate();
