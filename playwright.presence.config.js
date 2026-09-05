import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// An opt-in visual rehearsal of the real runtime, using only synthetic packets.
export default defineConfig({
  ...base,
  testDir: './tests/visual',
  timeout: 90_000,
  outputDir: 'test-results/presence',
  projects: [{
    name: 'presence-film',
    use: {
      ...base.projects[1].use,
      video: { mode: 'on', size: { width: 1440, height: 960 } },
    },
  }],
});
