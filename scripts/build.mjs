// Builds the site into dist/: the app as it is, plus a real page for every lesson that's out, every back issue,
// the jargon buster and the lists of each, with a sitemap, so search engines can find them.
// Vercel runs this on every push (the morning routine's included), so the pages follow the data.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const SITE = 'https://stocks.andykirwan.com';
const read = (p, fallback) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return fallback; } };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const longDate = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
const shortDate = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();
const plain = (t, n = 155) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, '') + '…' : s; };

const lessons = (read('data/lessons.json', []) || []).slice().sort((a, b) => a.n - b.n);
const open = lessons.filter((l) => l.status === 'Today' || l.status === 'Done');
const glossary = (read('data/glossary.json', []) || []).slice().sort((a, b) => a.term.localeCompare(b.term));
const editions = (read('data/editions/index.json', []) || []).slice().sort((a, b) => b.date.localeCompare(a.date));
export const lessonPath = (l) => `/lessons/${l.n}-${slug(l.title)}/`;

function shell({ title, description, path, label, view, body, jsonld }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23fbeee2'/%3E%3Ctext x='16' y='24' font-family='Georgia,serif' font-weight='800' font-size='22' text-anchor='middle' fill='%23262a2e'%3ES%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,800;1,6..72,400&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="/style.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<div class="page">
  <header class="masthead">
    <span class="mast-date">${esc(label)}</span>
    <a href="/" class="mast-title"><span class="h1">The Stock Desk</span></a>
    <span class="mast-tag">LEARNING TO INVEST · NOT ADVICE</span>
  </header>
  <nav class="sections" aria-label="Sections">
    <a href="/"${view === 'today' ? ' aria-current="page"' : ''}>Today</a>
    <a href="/lessons/"${view === 'lessons' ? ' aria-current="page"' : ''}>Lessons</a>
    <a href="/jargon/"${view === 'glossary' ? ' aria-current="page"' : ''}>Jargon buster</a>
    <a href="/back-issues/"${view === 'issues' ? ' aria-current="page"' : ''}>Back issues</a>
  </nav>
  <main>${body}</main>
  <footer class="foot">
    <p>A learning project, not financial advice. Prices are the latest closes when the paper went out and may be delayed. Nothing here is a recommendation to buy or sell anything.</p>
    <p class="made-by">an <a href="https://www.andykirwan.com/apps">ak.</a> app</p>
  </footer>
</div>
<script src="/quiz.js" defer></script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

function quizHTML(l) {
  if (!l?.quiz_q) return '';
  const opts = ['a', 'b', 'c', 'd'].filter((k) => l['quiz_' + k]);
  return `<div class="quiz" data-n="${l.n}" data-answer="${esc(String(l.quiz_answer || '').toLowerCase())}" data-explain="${esc(l.quiz_explain || '')}">
      <span class="label">Quick quiz</span>
      <p class="q">${esc(l.quiz_q)}</p>
      <div class="answers">${opts.map((k) => `<button type="button" data-k="${k}">${esc(l['quiz_' + k])}</button>`).join('')}</div>
      <p class="verdict" hidden></p>
    </div>`;
}

const pages = [];
function page(path, html, lastmod) {
  const dir = join(OUT, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  pages.push({ path, lastmod });
}

// 1. The app as it is, then the generated pages on top.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of readdirSync(ROOT)) {
  if (['dist', 'node_modules', 'scripts', '.git', '.vercel', 'package.json', 'package-lock.json', 'CLAUDE.md'].includes(f)) continue;
  cpSync(join(ROOT, f), join(OUT, f), { recursive: true });
}

// 2. Lessons.
open.forEach((l, i) => {
  const prev = open[i - 1], next = open[i + 1];
  const path = lessonPath(l);
  const body = `<article class="lesson">
      <span class="label">Lesson ${l.n} of ${lessons.length}${l.date ? ' · ' + esc(longDate(l.date)) : ''}</span>
      <h1 class="h2">${esc(l.title)}</h1>
      ${l.summary ? `<p class="intro">${esc(l.summary)}</p>` : ''}
      <div class="lesson-body">${paras(l.body).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      ${quizHTML(l)}
      <nav class="pager">${prev ? `<a href="${lessonPath(prev)}">← ${esc(prev.title)}</a>` : '<a href="/lessons/">← All lessons</a>'}${next ? `<a href="${lessonPath(next)}">${esc(next.title)} →</a>` : '<a href="/">Today\u2019s paper →</a>'}</nav>
    </article>`;
  page(path, shell({
    title: `${l.title}: lesson ${l.n} · The Stock Desk`,
    description: plain(l.summary ? `${l.summary}. ${paras(l.body)[0] || ''}` : paras(l.body)[0]),
    path, label: `LESSON ${l.n} OF ${lessons.length}`, view: 'lessons', body,
    jsonld: { '@context': 'https://schema.org', '@type': 'LearningResource', name: l.title, description: l.summary || plain(paras(l.body)[0]), learningResourceType: 'Lesson', educationalLevel: 'Beginner', inLanguage: 'en-GB', isAccessibleForFree: true, datePublished: l.date || undefined, url: SITE + path, isPartOf: { '@type': 'Course', name: 'Learning to invest, one morning at a time', provider: { '@type': 'Organization', name: 'The Stock Desk' } } },
  }), l.date);
});

page('/lessons/', shell({
  title: 'Lessons: learning to invest, one morning at a time · The Stock Desk',
  description: `A free beginner's course in investing: ${lessons.length} short lessons, each tied to something that really happened in the markets that week, with a quiz.`,
  path: '/lessons/', label: `${open.length} OF ${lessons.length} LESSONS OUT`, view: 'lessons',
  body: `<div class="stack">
      <span class="label">Lessons · ${open.length} of ${lessons.length} out so far</span>
      <h1 class="h2">Learning to invest, one morning at a time</h1>
      <p class="intro">A new lesson most weekdays, each tied to something that actually happened in the markets that week. Five minutes, then a quiz.</p>
      <ol class="toc">${lessons.map((l) => (l.status === 'Today' || l.status === 'Done')
        ? `<li><a href="${lessonPath(l)}"><span class="num">${String(l.n).padStart(2, '0')}</span><span class="t">${esc(l.title)}<span class="s">${esc(l.summary || '')}</span></span><span class="tag ${l.status === 'Today' ? 'now' : ''}">${l.status === 'Today' ? 'today' : esc(l.date ? shortDate(l.date).toLowerCase() : '')}</span></a></li>`
        : `<li><span class="soon"><span class="num">${String(l.n).padStart(2, '0')}</span><span class="t">${esc(l.title)}</span><span class="tag">soon</span></span></li>`).join('')}</ol>
    </div>`,
}));

// 3. The jargon buster, one anchor per term.
page('/jargon/', shell({
  title: 'Investing jargon, explained simply · The Stock Desk',
  description: `${glossary.length} investing and market terms in plain English, from ${glossary.slice(0, 3).map((g) => g.term).join(', ')} onwards.`,
  path: '/jargon/', label: `JARGON BUSTER · ${glossary.length} TERMS`, view: 'glossary',
  body: `<div class="stack">
      <span class="label">Jargon buster · ${glossary.length} terms</span>
      <h1 class="h2">What the words mean</h1>
      <dl class="gloss">${glossary.map((g) => `<div id="${slug(g.term)}"><dt>${esc(g.term)}</dt><dd>${esc(g.meaning)}</dd></div>`).join('')}</dl>
    </div>`,
  jsonld: { '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: 'Investing jargon, explained simply', hasDefinedTerm: glossary.map((g) => ({ '@type': 'DefinedTerm', name: g.term, description: g.meaning })) },
}));

// 4. Back issues.
const lessonByN = new Map(lessons.map((l) => [l.n, l]));
for (const e of editions) {
  const ed = read(`data/editions/${e.date}.json`, null);
  if (!ed?.brief) continue;
  const b = ed.brief;
  const l = lessonByN.get(ed.lesson);
  const path = `/editions/${e.date}/`;
  const body = `<p class="issue-note">You're reading a back issue. <a href="/">Today's paper →</a></p>
    <article class="brief">
      <span class="label">The morning brief · ${esc(longDate(e.date))}</span>
      <h1 class="h2">${esc(b.headline || '')}</h1>
      ${b.standfirst ? `<p class="standfirst">${esc(b.standfirst)}</p>` : ''}
      <div class="cols">${(b.sections || []).filter((s) => s.section !== 'Concept of the day').map((s) => `<h3>${esc(s.section)}</h3>${paras(s.text).map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>
      ${(ed.markets || []).length ? `<section class="week"><span class="label">The closes</span><ol>${ed.markets.map((m) => `<li><span class="when">${esc(m.name)}</span><span>${esc(String(m.level))}${typeof m.change_pct === 'number' ? ` (${m.change_pct > 0 ? '+' : m.change_pct < 0 ? '−' : ''}${Math.abs(m.change_pct).toFixed(2)}%)` : ''}</span></li>`).join('')}</ol></section>` : ''}
      ${l && (l.status === 'Today' || l.status === 'Done') ? `<p class="issue-note">That day's lesson: <a href="${lessonPath(l)}">${esc(l.title)} →</a></p>` : ''}
    </article>`;
  page(path, shell({
    title: `${plain(b.headline, 80)} · The Stock Desk, ${longDate(e.date)}`,
    description: plain(b.standfirst || b.headline),
    path, label: `${longDate(e.date).toUpperCase()} · BACK ISSUE`, view: 'issues', body,
    jsonld: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: plain(b.headline, 110), datePublished: e.date, url: SITE + path, publisher: { '@type': 'Organization', name: 'The Stock Desk' } },
  }), e.date);
}

page('/back-issues/', shell({
  title: 'Back issues · The Stock Desk',
  description: 'Every morning paper so far: what the markets did that day, why it mattered, and the lesson that went with it.',
  path: '/back-issues/', label: `BACK ISSUES · ${editions.length} SO FAR`, view: 'issues',
  body: `<div class="stack">
      <span class="label">Back issues · ${editions.length} so far</span>
      <h1 class="h2">Every morning's paper</h1>
      <ol class="toc issues">${editions.map((e) => `<li><a href="/editions/${esc(e.date)}/"><span class="num">${esc(shortDate(e.date))}</span><span class="t">${esc(e.headline || '')}${e.lessonTitle ? `<span class="s">Lesson: ${esc(e.lessonTitle)}</span>` : ''}</span><span class="tag">${esc(String(parseDay(e.date).getUTCFullYear()))}</span></a></li>`).join('')}</ol>
    </div>`,
}));

// 5. Sitemap and robots.
const today = new Date().toISOString().slice(0, 10);
const urls = [{ path: '/', lastmod: today }, ...pages];
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u.path}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
// The app needs the lesson addresses too, so its links point at the real pages.
writeFileSync(join(OUT, 'data', 'lesson-paths.json'), JSON.stringify(Object.fromEntries(open.map((l) => [l.n, lessonPath(l)]))));

if (!existsSync(join(OUT, 'index.html'))) throw new Error('build: index.html missing');
console.log(`built ${pages.length} pages: ${open.length} lessons, ${editions.length} back issues, jargon, lists, sitemap`);
