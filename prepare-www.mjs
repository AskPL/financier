import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  'index.html','styles.css','compact.css','readable.css','daily.css','theme.css','comfort.css','timeline.css',
  'app.js','finance.js','finance-v2.js','finance-v3.js','comfort-model.js','comfort.js','timeline-model.js','timeline.js',
  'features.js','upgrade.js','daily.js','calendar.js','sw.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'
];

const www = path.resolve('www');
fs.mkdirSync(www, { recursive: true });
for (const f of FILES) {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join(www, f));
  }
}
console.log('Copied', FILES.length, 'web assets into ./www for Capacitor APK build.');
