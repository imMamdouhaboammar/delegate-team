import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/proxy/server.ts', 'src/config-check.ts'],
  format: ['esm'],
  target: 'esnext',
  outDir: 'dist',
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
});
