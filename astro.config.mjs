// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import cloudflare from '@astrojs/cloudflare';

const siteUrl = process.env.SITE_URL ?? 'https://gearpro.example.com';
const command = process.argv[2] ?? '';
const useCloudflare = command !== 'dev' || process.env.CF_WORKERD_DEV === '1';

export default defineConfig({
  site: siteUrl,
  session: false,
  integrations: [mdx(), sitemap(), react(), keystatic()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: useCloudflare
    ? cloudflare({
        imageService: { build: 'compile', runtime: 'passthrough' },
        prerenderEnvironment: 'node',
      })
    : undefined,
});
