import { build } from 'esbuild';
await build({ entryPoints: ['web/research-app.mjs'], outfile: 'dist/research.js', bundle: true, minify: true, platform: 'browser', format: 'esm', target: ['es2022'], sourcemap: false });
await build({ entryPoints: ['web/app.mjs'], outfile: 'dist/app.js', bundle: true, minify: true, platform: 'browser', format: 'esm', target: ['es2022'], sourcemap: false, inject: ['web/polyfill.mjs'], define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' } });
