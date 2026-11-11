// Publishes a "drop" into data/.
//
// Claude's scheduled task can't push to GitHub, so it leaves the day's public data (a drop) in the
// Vercel store "ak-public". This site hands it out at /api/drop, and the GitHub Action "publish"
// fetches it, runs this script and commits data/ as Andy. Vercel then deploys as it always has.
//
// A drop: { date, at, message, files: { "data/x.json": change } }, where a change is either
//   { replace: <whole file> }
// or, for a file that's a list of rows,
//   { key: "id" | ["date", "name"], upsert: [rows], remove: [keys], keep: [keys], sort: ["closes", "-date"] }
// upsert swaps a row with the same key in place or adds it at the end; remove drops rows; keep (if
// given) drops every row whose key isn't listed; sort orders by those fields ("-" for newest first,
// missing values last).
//
// node scripts/apply-drop.mjs <file with the drop or {drop}> [--message-file <path>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = join(ROOT, '.publish', 'last');

const flat = (k) => (Array.isArray(k) ? k.map((v) => String(v ?? '')).join('\u0000') : String(k ?? ''));
export const keyOf = (row, key) => flat(Array.isArray(key) ? key.map((k) => row?.[k]) : row?.[key]);

const missing = (v) => v === undefined || v === null || v === '';
function compare(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
export function sortRows(rows, spec) {
  const fields = spec.map((f) => (f.startsWith('-') ? { name: f.slice(1), dir: -1 } : { name: f, dir: 1 }));
  return rows.slice().sort((r, s) => {
    for (const { name, dir } of fields) {
      const a = r?.[name], b = s?.[name];
      if (missing(a) && missing(b)) continue;
      if (missing(a)) return 1;
      if (missing(b)) return -1;
      const c = compare(a, b) * dir;
      if (c) return c;
    }
    return 0;
  });
}

export function applyChange(current, change) {
  if (!change || typeof change !== 'object') throw new Error('a change must be an object');
  if ('replace' in change) return change.replace;
  const { key } = change;
  if (!key) throw new Error('a list change needs a key');
  let rows = Array.isArray(current) ? current.slice() : [];
  const at = new Map(rows.map((r, i) => [keyOf(r, key), i]));
  for (const row of change.upsert || []) {
    const k = keyOf(row, key);
    if (at.has(k)) rows[at.get(k)] = row;
    else { at.set(k, rows.length); rows.push(row); }
  }
  if (change.remove?.length) {
    const gone = new Set(change.remove.map(flat));
    rows = rows.filter((r) => !gone.has(keyOf(r, key)));
  }
  if (Array.isArray(change.keep)) {
    const kept = new Set(change.keep.map(flat));
    rows = rows.filter((r) => kept.has(keyOf(r, key)));
  }
  if (change.sort?.length) rows = sortRows(rows, change.sort);
  return rows;
}

export function safePath(p) {
  const n = normalize(String(p)).replace(/\\/g, '/');
  if (!/^data\/[\w\-./]+\.json$/.test(n) || n.split('/').includes('..')) throw new Error(`not a data file: ${p}`);
  return n;
}

export const readJSON = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
export const writeJSON = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 1) + '\n');
};

export function checkDrop(drop) {
  if (!drop || typeof drop !== 'object') throw new Error('no drop');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drop.date || '')) throw new Error('drop has no date');
  if (!drop.files || typeof drop.files !== 'object' || !Object.keys(drop.files).length) throw new Error('drop has no files');
  for (const p of Object.keys(drop.files)) safePath(p);
  return drop;
}

export function applyDrop(drop, root = ROOT) {
  checkDrop(drop);
  const changed = [];
  for (const [p, change] of Object.entries(drop.files)) {
    const path = join(root, safePath(p));
    const before = readJSON(path, undefined);
    const after = applyChange(before, change);
    if (JSON.stringify(before) !== JSON.stringify(after)) { writeJSON(path, after); changed.push(p); }
  }
  return changed;
}

export const dropId = (drop) => `${drop.date} ${drop.at || ''}`.trim();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, flag, messageFile] = process.argv.slice(2);
  if (!file) { console.error('usage: node scripts/apply-drop.mjs <drop.json> [--message-file <path>]'); process.exit(2); }
  const got = JSON.parse(readFileSync(file, 'utf8'));
  const drop = got && 'drop' in got ? got.drop : got;
  if (!drop) { console.log('nothing to publish: the store is empty'); process.exit(0); }
  checkDrop(drop);
  const last = existsSync(MARK) ? readFileSync(MARK, 'utf8').trim() : '';
  if (last === dropId(drop)) { console.log(`already published: ${dropId(drop)}`); process.exit(0); }
  const changed = applyDrop(drop);
  mkdirSync(dirname(MARK), { recursive: true });
  writeFileSync(MARK, dropId(drop) + '\n');
  console.log(changed.length ? `published ${dropId(drop)}: ${changed.join(', ')}` : `nothing new in ${dropId(drop)}`);
  if (flag === '--message-file' && messageFile) writeFileSync(messageFile, String(drop.message || `Data: ${drop.date}`));
}
