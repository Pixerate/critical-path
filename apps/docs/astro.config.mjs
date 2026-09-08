import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://criticalpath.pixerate.com',
  output: 'static',
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
          label: 'Reference & AI',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
});
