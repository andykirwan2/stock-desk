// Hands out the latest drop: the public data Claude's daily stock brief left for this site in the
// Vercel store "ak-public". The GitHub Action "publish" fetches it and commits it to data/.
// Only public data is ever in the drop, the same as what the site shows.
const KEY = 'stock-desk';
const STORE = 'ecfg_muzhszo49uhqv15qvqrettg7tcx0'; // ak-public. Never point this at ak-health.

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

// Connecting the store to the project in Vercel adds a connection string (https://…/<store id>?token=…).
function connection() {
  for (const name of ['EDGE_CONFIG', 'GLOBAL_CONFIG', 'AK_PUBLIC_EDGE_CONFIG']) {
    const raw = process.env[name];
    if (!raw) continue;
    try {
      const url = new URL(raw);
      const id = url.pathname.split('/').filter(Boolean).pop();
      const token = url.searchParams.get('token');
      if (id === STORE && token) return { id, token, origin: url.origin };
    } catch {}
  }
  return null;
}

export async function GET() {
  const c = connection();
  if (!c) return json({ error: 'the ak-public store is not connected to this project' }, 503);
  const origins = [...new Set([c.origin, 'https://edge-config.vercel.com'])];
  for (const origin of origins) {
    try {
      const res = await fetch(`${origin}/${c.id}/item/${KEY}?token=${encodeURIComponent(c.token)}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 404) return json({ drop: null });
      if (res.ok) return json({ drop: await res.json() });
    } catch {}
  }
  return json({ error: 'the store did not answer' }, 502);
}
