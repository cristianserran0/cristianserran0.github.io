import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // The real address: canonical links, sharing tags, structured data and
  // the sitemap are all built from it. (Not www.: that redirects here.)
  site: 'https://cristianserrano.ar',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => !page.includes('/styleguide') })],
  build: {
    // Always emit CSS as files. Inlined <style> would be blocked by the
    // Content-Security-Policy in public/_headers (style-src 'self').
    inlineStylesheets: 'never',
  },
});
