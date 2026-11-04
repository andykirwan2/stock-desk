// The Stock Desk: a static morning paper. Data lives in /data/*.json and is
// rewritten each weekday morning by a scheduled routine, then Vercel redeploys.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paras = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const longDate = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
  const shortDate = (s) => { const d = parseDay(s); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

  const STRIP = ['FTSE 100', 'S&P 500', 'Nasdaq', 'Stoxx 600', 'Gold', 'GBP/USD'];
  const BASIC = new Set(['Share (stock, equity)', 'Index', 'Fund', 'Results / earnings', 'Dividend', 'Volatility']);

  const fmtLevel = (m) => {
    const v = Number(m.level);
    if (m.kind === 'Currency') return v.toFixed(4);
    if (m.kind === 'Rate') return `${v.toFixed(2)}%`;
    const s = v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return /gold|brent|oil|silver/i.test(m.name) ? `$${s}` : s;
  };
  const fmtChange = (c) => {
    const v = Number(c);
    if (!isFinite(v)) return { t: '', cls: 'flat' };
    const s = Math.abs(v).toFixed(2) + '%';
    return v > 0 ? { t: '+' + s, cls: 'up' } : v < 0 ? { t: '−' + s, cls: 'down' } : { t: s, cls: 'flat' };
  };

  let D = null;

  async function load() {
    const names = ['brief', 'markets', 'gauges', 'calendar', 'lessons', 'glossary'];
    const got = await Promise.all(names.map((n) => fetch(`/data/${n}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    D = Object.fromEntries(names.map((n, i) => [n, got[i]]));
    D.lessons = (D.lessons || []).slice().sort((a, b) => a.n - b.n);
    D.glossary = (D.glossary || []).slice().sort((a, b) => a.term.localeCompare(b.term));
  }

  function chrome() {
    const b = D.brief;
    $('#edition').textContent = b?.date ? `${longDate(b.date).toUpperCase()} · 7AM EDITION` : '';
    const ms = D.markets || [];
    const pick = STRIP.map((n) => ms.find((m) => m.name === n)).filter(Boolean);
    const list = (pick.length >= 6 ? pick : ms).slice(0, 6);
    $('#tickers').innerHTML = list.map((m) => {
      const c = fmtChange(m.change_pct);
      return `<div class="tick" title="${esc(m.note || '')}"><span class="n">${esc(m.name)}</span><span class="l">${esc(fmtLevel(m))}</span><span class="c ${c.cls}">${c.t}</span></div>`;
    }).join('');
  }

  const currentLesson = () => D.lessons.find((l) => l.status === 'Today') || [...D.lessons].reverse().find((l) => l.status === 'Done') || D.lessons[0];
  const isOpen = (l) => l.status === 'Today' || l.status === 'Done';

  function quizHTML(l) {
    if (!l?.quiz_q) return '';
    const opts = ['a', 'b', 'c', 'd'].filter((k) => l['quiz_' + k]);
    return `<div class="quiz" data-n="${l.n}">
      <span class="label">Quick quiz</span>
      <p class="q">${esc(l.quiz_q)}</p>
      <div class="answers">${opts.map((k) => `<button type="button" data-k="${k}">${esc(l['quiz_' + k])}</button>`).join('')}</div>
      <p class="verdict" hidden></p>
    </div>`;
  }

  function wireQuiz(root) {
    root.querySelectorAll('.quiz').forEach((box) => {
      const n = Number(box.dataset.n);
      const l = D.lessons.find((x) => x.n === n);
      const answer = String(l.quiz_answer || '').toLowerCase();
      const show = (k, save) => {
        box.querySelectorAll('button').forEach((b) => {
          b.disabled = true;
          if (b.dataset.k === answer) b.classList.add('right'), (b.textContent += ' ✓');
          else if (b.dataset.k === k) b.classList.add('wrong');
          else b.classList.add('faded');
        });
        const v = box.querySelector('.verdict');
        v.hidden = false;
        v.textContent = (k === answer ? 'Right. ' : 'Not quite. ') + (l.quiz_explain || '');
        if (save) store.set('sd-quiz-' + n, k);
      };
      const prev = store.get('sd-quiz-' + n);
      if (prev) show(prev, false);
      box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => show(b.dataset.k, true)));
    });
  }

  function jargonFor(text) {
    const hay = ' ' + text.toLowerCase() + ' ';
    const hits = [];
    for (const g of D.glossary) {
      if (BASIC.has(g.term)) continue;
      const keys = g.term.split(/\s*[(/]\s*|\s+and\s+/i)[0].replace(/\)$/, '').trim().toLowerCase();
      if (keys.length < 3) continue;
      const re = new RegExp(`[^a-z]${keys.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`);
      const m = re.exec(hay);
      if (m) hits.push({ g, at: m.index });
    }
    return hits.sort((a, b) => a.at - b.at).slice(0, 3).map((h) => h.g);
  }

  function viewToday() {
    const b = D.brief || { sections: [] };
    const l = currentLesson();
    const all = [b.headline, b.standfirst, ...b.sections.map((s) => s.text)].join(' ');
    const jargon = jargonFor(all);
    const start = b.date ? parseDay(b.date) : new Date();
    const end = new Date(start.getTime() + 7 * 864e5);
    const today = todayISO();
    const week = (D.calendar || []).filter((c) => { const d = parseDay(c.date); return d >= start && d < end; })
      .sort((x, y) => (x.date + (x.time_uk || '')).localeCompare(y.date + (y.time_uk || '')));
    const body = b.sections.filter((s) => s.section !== 'Today and this week' || !week.length);

    const lp = paras(l?.body);
    return `<div class="front">
      <article class="brief">
        <span class="label">The morning brief</span>
        <h2>${esc(b.headline || 'The paper is late today')}</h2>
        ${b.standfirst ? `<p class="standfirst">${esc(b.standfirst)}</p>` : ''}
        <div class="cols">${body.map((s) => `<h3>${esc(s.section)}</h3>${paras(s.text).map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>
        ${week.length ? `<section class="week"><span class="label">The week ahead</span><ol>${week.map((c) => `<li class="${c.date < today ? 'past' : ''}"><span class="when">${shortDate(c.date)}${c.time_uk ? ' · ' + esc(c.time_uk) : ''}</span><span>${esc(c.event)}</span>${c.why ? `<span class="why">${esc(c.why)}</span>` : ''}</li>`).join('')}</ol></section>` : ''}
        ${jargon.length ? `<div class="jargon"><span class="label">Jargon</span><p>${jargon.map((g) => `<b>${esc(g.term)}</b>: ${esc(g.meaning)}`).join(' ')}</p></div>` : ''}
      </article>
      ${l ? `<aside class="lesson-aside">
        <span class="label">Today's lesson · ${l.n} of ${D.lessons.length}</span>
        <h3>${esc(l.title)}</h3>
        <div class="lesson-body">${lp.slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        ${lp.length > 2 ? `<a class="more" href="#lesson-${l.n}">Read the whole lesson →</a>` : ''}
        ${quizHTML(l)}
        <a class="all-link" href="#lessons">All lessons →</a>
      </aside>` : ''}
    </div>
    ${(D.gauges || []).length ? `<section class="dials"><span class="label">The dials · how the market feels</span><div class="dial-row">${D.gauges.map((g) => `<div class="dial"><span class="g">${esc(g.gauge)}</span><span class="r">${esc(g.reading)}</span><span class="d">${esc(firstSentence(g.detail))}</span></div>`).join('')}</div></section>` : ''}`;
  }

  const firstSentence = (t) => { const m = String(t || '').match(/^.*?[.!?](?=\s|$)/); return m ? m[0] : t; };

  function viewLessons() {
    const done = D.lessons.filter(isOpen).length;
    return `<div class="stack">
      <span class="label">Lessons · ${done} of ${D.lessons.length} out so far</span>
      <h2>Learning to invest, one morning at a time</h2>
      <p class="intro">A new lesson most weekdays, each tied to something that actually happened in the markets that week. Five minutes, then a quiz.</p>
      <ol class="toc">${D.lessons.map((l) => isOpen(l)
        ? `<li><a href="#lesson-${l.n}"><span class="num">${String(l.n).padStart(2, '0')}</span><span class="t">${esc(l.title)}<span class="s">${esc(l.summary || '')}</span></span><span class="tag ${l.status === 'Today' ? 'now' : ''}">${l.status === 'Today' ? 'today' : esc(l.date ? shortDate(l.date).toLowerCase() : '')}</span></a></li>`
        : `<li><span class="soon"><span class="num">${String(l.n).padStart(2, '0')}</span><span class="t">${esc(l.title)}</span><span class="tag">soon</span></span></li>`).join('')}</ol>
    </div>`;
  }

  function viewLesson(n) {
    const open = D.lessons.filter(isOpen);
    const i = open.findIndex((l) => l.n === n);
    const l = open[i];
    if (!l) return viewLessons();
    const prev = open[i - 1], next = open[i + 1];
    return `<article class="lesson">
      <span class="label">Lesson ${l.n} of ${D.lessons.length}${l.date ? ' · ' + longDate(l.date) : ''}</span>
      <h2>${esc(l.title)}</h2>
      ${l.summary ? `<p class="intro">${esc(l.summary)}</p>` : ''}
      <div class="lesson-body">${paras(l.body).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      ${quizHTML(l)}
      <nav class="pager">${prev ? `<a href="#lesson-${prev.n}">← ${esc(prev.title)}</a>` : '<a href="#lessons">← All lessons</a>'}${next ? `<a href="#lesson-${next.n}">${esc(next.title)} →</a>` : '<a href="#lessons">All lessons →</a>'}</nav>
    </article>`;
  }

  function viewGlossary() {
    return `<div class="stack">
      <span class="label">Jargon buster · ${D.glossary.length} terms</span>
      <h2>What the words mean</h2>
      <input class="search" type="search" placeholder="Search a word, e.g. spread" aria-label="Search the jargon buster">
      <dl class="gloss">${D.glossary.map((g) => `<div data-q="${esc((g.term + ' ' + g.meaning).toLowerCase())}"><dt>${esc(g.term)}</dt><dd>${esc(g.meaning)}</dd></div>`).join('')}</dl>
    </div>`;
  }

  function route() {
    if (!D) return;
    const h = location.hash.replace(/^#/, '');
    const m = /^lesson-(\d+)$/.exec(h);
    const view = m ? 'lessons' : h === 'lessons' || h === 'glossary' ? h : 'today';
    const el = $('#view');
    el.innerHTML = m ? viewLesson(Number(m[1])) : view === 'lessons' ? viewLessons() : view === 'glossary' ? viewGlossary() : viewToday();
    document.querySelectorAll('.sections a').forEach((a) => (a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    wireQuiz(el);
    const s = $('.search', el);
    if (s) s.addEventListener('input', () => { const q = s.value.trim().toLowerCase(); el.querySelectorAll('.gloss > div').forEach((d) => { d.hidden = q && !d.dataset.q.includes(q); }); });
    document.title = m ? `${(D.lessons.find((l) => l.n === Number(m[1])) || {}).title || 'Lesson'} · The Stock Desk` : view === 'lessons' ? 'Lessons · The Stock Desk' : view === 'glossary' ? 'Jargon buster · The Stock Desk' : 'The Stock Desk';
  }

  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  load().then(() => { chrome(); route(); }).catch(() => { $('#view').innerHTML = '<p class="loading">The paper didn’t arrive. Try again in a minute.</p>'; });
})();
