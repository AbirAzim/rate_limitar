"""Builds docs/architecture.html from the version snapshots in this folder.

Each version lives in vN.html. v1-v3 are full snapshots; from v4 on, a version
shows only what it adds or changes and links back to the version it builds on
(<p class="builds-on">). Add a new version by writing vN+1.html with just its
changes and adding an entry to versions.json. Older versions are never edited.

Usage (from the repo root):
    python3 docs/architecture/build.py
"""
import html, json, re, sys
from pathlib import Path

here = Path(__file__).parent
versions = json.loads((here / 'versions.json').read_text())
head = (here / 'head.html').read_text()
latest = versions[-1]['id']

NEXT = [
    'v7: video service, reels uploaded to S3, transcoded, shared with friends',
    'Rate limit store behind an interface; circuit breaker with in-memory fallback',
    'Rate limiter keyed on CloudFront-Viewer-Address and Cognito user id',
]

EXTRA_CSS = """
  /* Version history */
  .history { display: grid; gap: 14px; }
  .timeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
  .vcard {
    all: unset; box-sizing: border-box; cursor: pointer; display: grid; gap: 6px; align-content: start;
    padding: 14px 16px; border-radius: 10px; background: var(--surface);
    border: 1px solid var(--line); color: var(--ink); font: inherit;
  }
  .vcard:hover { border-color: var(--muted); }
  .vcard:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .vcard[aria-selected="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--accent-soft); }
  .vcard .vtag { font-family: var(--font-mono); font-size: 12px; color: var(--muted); display: flex; gap: 8px; align-items: baseline; }
  .vcard .vtag b { font-weight: 500; color: var(--accent); }
  .vcard .vname { font-family: var(--font-display); font-weight: 700; font-size: 16px; }
  .vcard .vsum { font-size: 13.5px; color: var(--muted); line-height: 1.45; }
  .vcard.next { cursor: default; border-style: dashed; background: transparent; }
  .vcard.next .vtag b { color: var(--warn); }
  .vcard.next ul { margin: 0; padding-left: 16px; font-size: 13.5px; color: var(--muted); display: grid; gap: 2px; }
  .changes {
    border-left: 3px solid var(--accent); padding: 4px 0 4px 14px; display: grid; gap: 4px;
  }
  .changes strong { font-family: var(--font-mono); font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
  .changes ul { margin: 0; padding-left: 18px; display: grid; gap: 2px; font-size: 14px; }
  article.version { display: grid; gap: 56px; }
  .canvas.code pre { margin: 0; font-family: var(--font-mono); font-size: 13px; line-height: 1.55; color: var(--ink); }
  .canvas.code code { font-size: inherit; }
  .builds-on { font-size: 14px; color: var(--muted); }
  .builds-on a { color: var(--accent); font-weight: 600; }
  @media (prefers-reduced-motion: no-preference) { .vcard { transition: border-color .15s, background .15s; } }
</style>"""

def suffix_ids(body, vid):
    # Marker ids must be unique across versions, or hidden versions break arrowheads
    body = re.sub(r'id="(h[a-z]*\d*)"', rf'id="\1-{vid}"', body)
    return re.sub(r'url\(#(h[a-z]*\d*)\)', rf'url(#\1-{vid})', body)

def version_body(v, index):
    body = (here / f"{v['id']}.html").read_text()
    body = suffix_ids(body, v['id'])
    label = f"rate_limitar · architecture {v['id']} · {v['name']}"
    body = body.replace('<span class="eyebrow">rate_limitar · production layout</span>',
                        f'<span class="eyebrow">{html.escape(label)}</span>', 1)
    if v['changes']:
        prev = versions[index - 1]['id']
        items = ''.join(f'<li>{html.escape(c)}</li>' for c in v['changes'])
        note = f'\n    <div class="changes"><strong>New since {prev}</strong><ul>{items}</ul></div>'
        body = body.replace('  </header>', note + '\n  </header>', 1)
    hidden = '' if v['id'] == latest else ' hidden'
    return f'  <article class="version" data-version="{v["id"]}" aria-label="Architecture {v["id"]}"{hidden}>\n{body}\n  </article>\n'

cards = []
for v in versions:
    selected = 'true' if v['id'] == latest else 'false'
    cur = ' · current' if v['id'] == latest else ''
    cards.append(
        f'      <button class="vcard" role="tab" data-show="{v["id"]}" aria-selected="{selected}">'
        f'<span class="vtag"><b>{v["id"]}</b>{v["date"]}{cur}</span>'
        f'<span class="vname">{html.escape(v["name"])}</span>'
        f'<span class="vsum">{html.escape(v["summary"])}</span></button>')
next_items = ''.join(f'<li>{html.escape(n)}</li>' for n in NEXT)
cards.append(f'      <div class="vcard next"><span class="vtag"><b>next</b>planned</span>'
             f'<span class="vname">Where we\'re going</span><ul>{next_items}</ul></div>')

history = f"""  <section class="history" aria-label="Architecture versions">
    <span class="eyebrow">Architecture history · pick a version</span>
    <div class="timeline" role="tablist">
{chr(10).join(cards)}
    </div>
  </section>
"""

script = f"""<script>
  (() => {{
    const ids = {json.dumps([v['id'] for v in versions])};
    const latest = {json.dumps(latest)};
    const cards = [...document.querySelectorAll('[data-show]')];
    const views = [...document.querySelectorAll('article[data-version]')];
    const show = (id) => {{
      if (!ids.includes(id)) id = latest;
      views.forEach((a) => (a.hidden = a.dataset.version !== id));
      cards.forEach((c) => c.setAttribute('aria-selected', String(c.dataset.show === id)));
    }};
    cards.forEach((c) => c.addEventListener('click', () => {{
      show(c.dataset.show);
      history.replaceState(null, '', '#' + c.dataset.show);
    }}));
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    show(location.hash.slice(1));
  }})();
</script>"""

page_head = head.replace('</style>', EXTRA_CSS, 1)
main = '<main>\n' + history + ''.join(version_body(v, i) for i, v in enumerate(versions)) + '</main>\n'
artifact = page_head + main + script + '\n'

# Default output: docs/architecture.html. An optional first argument also writes
# the bare page (no <html>/<head> wrapper) for publishing elsewhere.
out_docs = here.parent / 'architecture.html'
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(artifact)

i = artifact.index('<main>')
docs = f"""<!doctype html>
<!-- Architecture history (generated). Open in a browser: `open docs/architecture.html` -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{artifact[:i].rstrip()}
</head>
<body>
{artifact[i:]}</body>
</html>
"""
Path(out_docs).write_text(docs)
print('built', [v['id'] for v in versions], 'latest', latest)
