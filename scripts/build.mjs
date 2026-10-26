import { build } from 'esbuild';
await build({ entryPoints: ['web/app.mjs'], outfile: 'dist/app.js', bundle: true, minify: true, platform: 'browser', format: 'esm', target: ['es2022'], inject: ['web/polyfill.mjs'], define: { 'process.env.NODE_ENV': '"production"' }, sourcemap: false });
