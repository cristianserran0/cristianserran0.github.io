import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://beta.cristianserrano.ar',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => !page.includes('/styleguide') })],
  build: {
    // Always emit CSS as files. Inlined <style> would be blocked by the
    // Content-Security-Policy in netlify.toml (style-src 'self').
    inlineStylesheets: 'never',
  },
});
