import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://beta.cristianserrano.ar',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
