# the stock desk

https://stocks.andykirwan.com is a morning paper for learning to invest: the day's brief, market closes, gauges, a calendar, a course of lessons with quizzes, back issues and a jargon buster. It's for learning only, not financial advice. `README.md` describes the data files.

## How it's built
- Static pages (`index.html`, `style.css`, `app.js`, `quiz.js`), plus `scripts/build.mjs`, which builds `dist/` with real pages for every lesson and back issue and a sitemap. Vercel runs `node scripts/build.mjs`. Run `npm run build` before pushing.
- `data/` is updated every weekday from the "Daily stock brief" scheduled task. Scheduled tasks can't push to GitHub, so the task writes the public files into a clone, runs `node scripts/make-drop.mjs YYYY-MM-DD` and saves the result (a "drop") in the Vercel store `ak-public` (key `stock-desk`). `api/drop.js` hands it out, and the GitHub Action `.github/workflows/publish.yml` fetches it, runs `scripts/apply-drop.mjs` and commits data/ as "Morning paper: YYYY-MM-DD" (around 06:35 to 07:00 UK, retrying through the morning). `.publish/last` records the last drop published, so each one lands once. To publish by hand, run the Action from GitHub's Actions tab. `data/editions/` holds the back issues: never edit or delete old ones.
- The public site must never show anything personal: no paper pot, watchlist, holdings or share counts. Those live only in Andy's private dashboard.
- Never tell readers to buy or sell anything. Keep "not financial advice" on the site.
- On weekdays the publish Action pushes around 06:35 to 07:00 UK. Avoid pushing then, and always fetch and rebase on `origin/main` first.

## Look
- It has its own look (a printed morning paper). Mockups come first, using the ak-mockups skill.

## ak. house rules (shared by every ak. repo)
- Current status, blockers and next steps live in the GLOBAL project doc `claude/state-of-play.md` and on health.andykirwan.com (Edge Config store `ak-health`). Check those, then Vercel deployments and runtime errors, before diagnosing.
- Vercel team "AK" (`team_9wmsS0FQN0vRcVIqQDj7YZGp`), project `stock-desk`. A push to `main` deploys to production. Claude may push without asking: commit as `Andy Kirwan <andykirwan2@gmail.com>`.
- After any change, confirm the production deployment is READY and the live page shows it.
- The footer reads exactly "an ak. app", with "ak." linking to https://www.andykirwan.com/apps.
- Anything visible gets a mockup first. Look and feel are Andy's call.
- Plain British English, short and friendly, no em dashes. UK-focused, with costs kept to a minimum. Add any new paid service to the ak. health cost register.
- Secrets live in Vercel env vars, which Andy adds himself. Never commit them, print them or ask for them in chat.
