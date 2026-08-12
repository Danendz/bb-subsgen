import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    crx({
      manifest,
      // The page reader isn't declared in the manifest — it's registered at
      // runtime for origins the user opts into, which needs a self-contained
      // IIFE rather than the ESM loader crxjs emits for declared scripts.
      contentScripts: { standaloneFiles: ['src/reader/main.ts'] },
    }),
  ],
  build: {
    // Content scripts run in the isolated world, so a <link rel="modulepreload">
    // emitted into the page never gets used — Chrome then logs a cross-world
    // resource mismatch warning for every shared chunk. Nothing preloads.
    modulePreload: false,
  },
})
