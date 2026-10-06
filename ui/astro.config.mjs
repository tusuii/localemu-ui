// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// The console is rendered on demand: every page talks to LocalEmu through
// the AWS SDK on the server, so the browser never needs CORS or credentials.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Loopback by default: the console has no login of its own. Set HOST=0.0.0.0
  // (production) or pass --host (dev) deliberately if you need to expose it.
  server: { port: 4321 },
  devToolbar: { enabled: false },
  security: { checkOrigin: true },
  vite: {
    plugins: [
      tailwindcss(),
      {
        // Bundle the AWS SDK clients into the production server build so the
        // image needs no node_modules (smaller, faster cold start). Dev keeps
        // them external: bundling thousands of SDK files per request is slow.
        name: 'localemu:bundle-deps-for-build',
        config: (_cfg, { command }) => (command === 'build' ? { ssr: { noExternal: true } } : {}),
      },
    ],
  },
});
