import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // `tools` too: the helper and supervisor are part of the feature, and the
    // pure bits of them (command parsing, the WAV header) are worth pinning.
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
})
