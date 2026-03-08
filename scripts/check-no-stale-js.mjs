import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXCLUDED = new Set([
  'postcss.config.js',
  'tailwind.config.js',
  'sw.js',
]);

const problems = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (EXCLUDED.has(rel)) continue;

    const stem = full.slice(0, -3);
    const siblingTs = `${stem}.ts`;
    const siblingTsx = `${stem}.tsx`;
    const siblingJsx = `${stem}.jsx`;

    const siblings = [siblingTs, siblingTsx, siblingJsx].filter(fs.existsSync).map(p => path.relative(ROOT, p).replace(/\\/g, '/'));
    if (siblings.length) {
      problems.push({ js: rel, siblings });
    }
  }
}

walk(ROOT);

if (problems.length) {
  console.error('\nBuild blocked: stale .js files are shadowing TypeScript/JSX source files.\n');
  for (const item of problems) {
    console.error(`- ${item.js} shadows: ${item.siblings.join(', ')}`);
  }
  console.error('\nRemove the stale .js files above before building.');
  process.exit(1);
}

console.log('Stale JS duplicate check passed.');
