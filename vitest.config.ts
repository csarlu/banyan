import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Several tests spawn git/shell processes; Windows CI runners need more than the 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
