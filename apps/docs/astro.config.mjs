import node from "@apphosting/astro-adapter";
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  site: 'https://criticalpath.pixerate.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    starlight({
      title: 'Critical Path',
      description: 'The Headless Project Management Engine for Modern Web Applications',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: false,
      },
      social: {
        github: 'https://github.com/Pixerate/Critical-Path',
      },
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'script',
          attrs: {
            async: true,
            src: `https://www.googletagmanager.com/gtag/js?id=${process.env.PUBLIC_GA_MEASUREMENT_ID || 'G-XF2M2Z6EV0'}`,
          },
        },
        {
          tag: 'script',
          content: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${process.env.PUBLIC_GA_MEASUREMENT_ID || 'G-XF2M2Z6EV0'}');`,
        },
      ],
      components: {
        Hero: './src/components/StarlightHeroOverride.astro',
        ThemeSelect: './src/components/ThemeSelectOverride.astro',
      },
      sidebar: [
        {
          label: 'Start Here',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Core Engine',
          autogenerate: { directory: 'core' },
        },
        {
          label: 'Storage Adapters',
          autogenerate: { directory: 'storage' },
        },
        {
          label: 'Framework Adapters',
          autogenerate: { directory: 'frameworks' },
        },
        {
          label: 'Frontend UI Libraries',
          autogenerate: { directory: 'ui' },
        },
        {
          label: 'Plugins & Extensibility',
          autogenerate: { directory: 'plugins' },
        },
        {
          label: 'Model Context Protocol (MCP)',
          autogenerate: { directory: 'mcp' },
        },
        {
          label: 'Reference & AI',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
    tailwind({
      applyBaseStyles: false,
    }),
    svelte(),
  ],
});
