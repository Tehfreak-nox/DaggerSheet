// Package the Vite build as one self-contained HTML page (for hosting as a
// claude.ai artifact): inline CSS and JS, keep only <title>, metas and the
// Google Fonts stylesheet from <head>.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\/?([^"]+\.css)">/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
const js = [...html.matchAll(/<script type="module" crossorigin src="\/?([^"]+\.js)"><\/script>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
if (!css.length || !js.length) throw new Error('Could not find built CSS/JS in dist/index.html');
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];

const page = [
  '<title>DaggerSheet</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  fonts,
  `<style>${css.join('\n')}</style>`,
  '<div id="root"></div>',
  `<script type="module">${js.join('\n').replace(/<\/script/gi, '<\\/script')}</script>`,
].join('\n');

mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/daggersheet.html', page);
console.log(`dist-artifact/daggersheet.html ${(page.length / 1024).toFixed(0)} KB`);
