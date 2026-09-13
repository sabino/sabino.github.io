import { defineConfig } from 'vite';
import { readBuildMetadata } from './scripts/build-metadata.mjs';
export default defineConfig({
  define: { __VERSO_BUILD_METADATA__: JSON.stringify(readBuildMetadata()) },
  base: './',
  server: { host: '0.0.0.0', port: 4173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4174, strictPort: true },
});
