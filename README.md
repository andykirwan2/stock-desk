# The Stock Desk

A morning paper for learning to invest. Static site: `index.html`, `style.css`, `app.js`, and the day's data in `data/`.

The 7am routine rewrites the files in `data/` each weekday and commits them; Vercel redeploys on push.

| file | what it holds |
| --- | --- |
| `brief.json` | `{date, headline, standfirst, sections:[{section, text}]}` (public sections only: no pot, no watchlist) |
| `markets.json` | closes: `{name, kind, region, level, change_pct, as_of, note}` |
| `gauges.json` | the dials: `{gauge, reading, detail, source, as_of}` |
| `calendar.json` | `{date, time_uk, event, kind, ticker, why}` |
| `lessons.json` | `{n, status: Done/Today/Upcoming, date, title, summary, body, quiz_q, quiz_a..d, quiz_answer, quiz_explain}` |
| `glossary.json` | `{term, meaning}` |

Not financial advice.
