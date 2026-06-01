import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function copyClassicRuntimeAssets() {
  const copies = [
    ['src/vendor', 'dist/src/vendor'],
    ['src/mascot-v2/sanitize.js', 'dist/src/mascot-v2/sanitize.js'],
    ['src/mascot-v2/behavior-machine.js', 'dist/src/mascot-v2/behavior-machine.js'],
    ['src/mascot-v2/states.js', 'dist/src/mascot-v2/states.js'],
    ['src/mascot-v2/motion-adapter.js', 'dist/src/mascot-v2/motion-adapter.js'],
    ['src/mascot-v2/runtime.js', 'dist/src/mascot-v2/runtime.js'],
    ['src/mascot-v2/audio.js', 'dist/src/mascot-v2/audio.js'],
    ['src/mascot-v2/touch-fx.js', 'dist/src/mascot-v2/touch-fx.js'],
    ['src/mascot-v2/entertainment.js', 'dist/src/mascot-v2/entertainment.js'],
    ['src/mascot-v2/watch-sequences.js', 'dist/src/mascot-v2/watch-sequences.js'],
    ['src/mascot-v2/sequences.json', 'dist/src/mascot-v2/sequences.json'],
    ['src/mascot-v2/app.js', 'dist/src/mascot-v2/app.js'],
    ['src/mascot-v2/approval.js', 'dist/src/mascot-v2/approval.js'],
    ['src/mascot-v2/hermes-puppet.svg', 'dist/src/mascot-v2/hermes-puppet.svg'],
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
        mascot: 'src/character-runtime-v2.html',
        debug: 'src/mascot-v2-debug.html',
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
