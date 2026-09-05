import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function copyClassicRuntimeAssets() {
  const copies = [
    ['src/vendor', 'dist/src/vendor'],
    ['src/generated/build-id.js', 'dist/src/generated/build-id.js'],
    ['src/generated/display-contract.js', 'dist/src/generated/display-contract.js'],
    ['src/mascot/sanitize.js', 'dist/src/mascot/sanitize.js'],
    ['src/mascot/mode-presets.js', 'dist/src/mascot/mode-presets.js'],
    ['src/mascot/behavior-machine.js', 'dist/src/mascot/behavior-machine.js'],
    ['src/mascot/states.js', 'dist/src/mascot/states.js'],
    ['src/mascot/motion-adapter.js', 'dist/src/mascot/motion-adapter.js'],
    ['src/mascot/audio.js', 'dist/src/mascot/audio.js'],
    ['src/mascot/touch-fx.js', 'dist/src/mascot/touch-fx.js'],
    ['src/mascot/entertainment.js', 'dist/src/mascot/entertainment.js'],
    ['src/mascot/watch-sequences.js', 'dist/src/mascot/watch-sequences.js'],
    ['src/mascot/sequences.json', 'dist/src/mascot/sequences.json'],
    ['src/mascot/activity-trace.js', 'dist/src/mascot/activity-trace.js'],
    ['src/mascot/app.js', 'dist/src/mascot/app.js'],
    ['src/state.js', 'dist/src/state.js'],
  ];
  for (const [from, to] of copies) {
    const target = path.resolve(to);
    mkdirSync(path.dirname(target), { recursive: true });
    if (from.endsWith('/vendor')) {
      cpSync(path.resolve(from), target, { recursive: true });
    } else {
      copyFileSync(path.resolve(from), target);
    }
  }
}

function classicRuntimeAssetPlugin() {
  return {
    name: 'hermes-classic-runtime-assets',
    closeBundle() {
      copyClassicRuntimeAssets();
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: false,
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11'],
    }),
    classicRuntimeAssetPlugin(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        mascot: 'src/character-runtime.html',
        debug: 'src/mascot-debug.html',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8770,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 8770,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
