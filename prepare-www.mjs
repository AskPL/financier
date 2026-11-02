import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const www = path.join(root, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

const files = [
  'index.html',
  'styles.css',
  'core.js',
  'app.js',
  'sw.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

for (const file of files) {
  const src = path.join(root, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(www, file));
  }
}

console.log(`Prepared Capacitor www/ directory with ${files.length} clean Financier 3.6 files.`);
