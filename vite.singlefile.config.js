/*
 * Use this config to build a self-contained HTML file.
 *
 * npm run build -- --config=vite.singlefile.config.js
 */
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import config from './vite.config.js';

export default defineConfig({
    ...config,
    plugins: [viteSingleFile()],
});