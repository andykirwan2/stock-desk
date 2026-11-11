// Turns this morning's changes to data/ into a drop for the ak-public store.
//
// The daily stock brief writes the public files into a fresh clone as before, then runs
//   node scripts/make-drop.mjs YYYY-MM-DD > /tmp/drop.json
// It compares data/ with the last commit and keeps only what changed, so the drop stays small.
// It checks that publishing the drop onto the last commit gives exactly today's files, and
// falls back to sending a whole file wherever it wouldn't.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChange, keyOf, readJSON, safePath } from './apply-drop.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = [
  [/^data\/lessons\.json$/, { key: 'n', sort: ['n'] }],
  [/^data\/glossary\.json$/, { key: 'term' }],
  [/^data\/market-history\.json$/, { key: ['date', 'name'], sort: ['name', 'date'] }],
  [/^data\/editions\/index\.json$/, { key: 'date', sort: ['-date'] }],
];

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { console.error('usage: node scripts/make-drop.mjs YYYY-MM-DD'); process.exit(2); }

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const status = git('status', '--porcelain=v1', '-uall', '--', 'data').split('\n').filter(Boolean);

const files = {};
for (const line of status) {
  const code = line.slice(0, 2), p = safePath(line.slice(3).trim());
  if (code.includes('D')) { console.error(`refusing: ${p} was deleted, and old data is never deleted`); process.exit(1); }
  const now = readJSON(join(ROOT, p));
  let before;
  try { before = JSON.parse(git('show', `HEAD:${p}`)); } catch { before = undefined; }
  if (JSON.stringify(now) === JSON.stringify(before)) continue;

  const rule = RULES.find(([re]) => re.test(p))?.[1];
  let change = { replace: now };
  if (rule && Array.isArray(now) && Array.isArray(before)) {
    const old = new Map(before.map((r) => [keyOf(r, rule.key), JSON.stringify(r)]));
    const fresh = new Set(now.map((r) => keyOf(r, rule.key)));
    const upsert = now.filter((r) => old.get(keyOf(r, rule.key)) !== JSON.stringify(r));
    const remove = before.filter((r) => !fresh.has(keyOf(r, rule.key))).map((r) => (Array.isArray(rule.key) ? rule.key.map((k) => r[k]) : r[rule.key]));
    const rows = { key: rule.key, upsert, ...(remove.length ? { remove } : {}), ...(rule.sort ? { sort: rule.sort } : {}) };
    // Only send rows if they rebuild today's file exactly; otherwise send the whole file.
    if (JSON.stringify(applyChange(before, rows)) === JSON.stringify(now)) change = rows;
  }
  files[p] = change;
}

if (!Object.keys(files).length) { console.error('nothing changed in data/'); process.exit(1); }
const drop = { date, at: new Date().toISOString(), message: `Morning paper: ${date}`, files };
const out = JSON.stringify(drop);
console.error(`drop: ${Object.keys(files).length} files, ${(out.length / 1024).toFixed(1)} KB`);
process.stdout.write(out + '\n');
