// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nailthequote.com',
  trailingSlash: 'always',
  integrations: [sitemap({
    filter: (page) => !page.includes('/dashboard/'),
  })],
  vite: {
    plugins: [tailwindcss()]
  }
});
