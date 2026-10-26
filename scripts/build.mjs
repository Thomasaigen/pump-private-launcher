import { build } from 'esbuild';
await build({ entryPoints: ['web/research-app.mjs'], outfile: 'dist/research.js', bundle: true, minify: true, platform: 'browser', format: 'esm', target: ['es2022'], sourcemap: false });
