import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    // Content scripts run in the isolated world, so a <link rel="modulepreload">
    // emitted into the page never gets used — Chrome then logs a cross-world
    // resource mismatch warning for every shared chunk. Nothing preloads.
    modulePreload: false,
  },
})
