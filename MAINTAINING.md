# Maintaining the arcade

A zero-build static site that lists the game family as launcher cards. Games run
on Render; this site only links to them. No backend, no build step, no npm
dependencies.

## Files

| File | What it is |
|---|---|
| `index.html` / `styles.css` / `app.js` | The site. Served as-is by GitHub Pages. |
| `games.json` | The registry — the single source of truth the page renders from. |
| `register.mjs` | Maintainer tool: a game's deploy milestone runs this to add/update its card. |
| `covers/` | Optional 640×360 cover art, `<id>.png`. No image → generated gradient cover. |
| `.nojekyll` | Tells Pages to skip Jekyll processing. Required. |

## Field ownership (the one rule that matters)

- **Machine-owned** (`register.mjs` writes on every run): `id`, `repo`,
  `service`, `url`, `firstSeen`, `lastSeen`, `archived`.
- **Human-owned** (`register.mjs` seeds once at creation, then never touches):
  `title`, `blurb`, `players`, `controls`, `setup`, `accent`, `cover`,
  `urlOverride`, `hidden`, `order`.

Registrations add or update entries and never delete them — a decommissioned
game is archived (card hidden, data kept). Hand edits in `games.json` always
survive re-registration.

## Viewing locally

```bash
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

## Adding a new game

Registration is push-based: when a game's repo gains its production deploy
config (`render.yaml` for Render), its spec's deploy milestone runs the
registration — game specs generated from `game-specs` include this step with
the seed values pre-filled. To do it by hand:

```bash
node ~/Projects/arcade/register.mjs --id <repo-name> \
  --service "<web service name from render.yaml>" \
  --blurb "<one line>" \
  --players "<e.g. 2–4 players>" \
  --controls "<e.g. Phone as controller>" \
  --setup "<e.g. Shared screen + a phone per player>"

git -C ~/Projects/arcade diff games.json   # review: one entry added/updated
git -C ~/Projects/arcade add games.json
git -C ~/Projects/arcade commit -m "register: <game>" && git -C ~/Projects/arcade push
# Pages redeploys automatically, live in ~1 minute
```

Notes:

- Add `--url <production-url>` when the game is not at
  `https://<service>.onrender.com` (e.g. hosted elsewhere).
- Re-running is always safe (`--dry-run` previews without writing).
- Seed flags (`--blurb`, `--players`, …) only apply on first registration;
  after that, edit `games.json` directly.
- If a game's PLAY link 404s, Render probably appended a suffix to its URL (the
  service name was taken) — set that game's `urlOverride` by hand.
- Decommissioned a game? `node register.mjs --id <repo-name> --archive` hides
  the card but keeps the entry in case it comes back.

## Hosting (maintainer note — already done; only needed if re-creating)

1. Repo must be public (free Pages requirement).
2. Settings → Pages → Build and deployment → Source: "Deploy from a branch" →
   Branch `main`, folder `/ (root)` → Save.
3. The site is live at `https://nwsgerald.github.io/arcade/` in about a minute.
