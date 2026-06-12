#!/usr/bin/env node
/**
 * register.mjs — push-based registry tool for games.json.
 *
 * Run from anywhere (typically a game repo's deploy milestone, the moment its
 * production deploy config first exists). games.json is resolved next to this
 * script, not the cwd.
 *
 * Field ownership: this tool owns discovery fields (id, repo, service, url,
 * firstSeen, lastSeen, archived). Presentation fields (title, blurb, players,
 * controls, setup, accent, cover) are seeded on first registration and never
 * overwritten afterwards — hand edits in games.json always survive re-runs.
 * urlOverride, hidden and order are always hand-maintained.
 *
 * Usage:
 *   node register.mjs --id <repo-name> [--service <name>] [--url <prod-url>]
 *                     [--repo <owner/name>] [--title T] [--blurb B]
 *                     [--players P] [--controls C] [--setup S]
 *                     [--accent "#rrggbb"] [--cover covers/<id>.png] [--dry-run]
 *   node register.mjs --id <repo-name> --archive   # decommissioned game
 */

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const REGISTRY_URL = new URL('games.json', import.meta.url);
const ARCADE_DIR = dirname(fileURLToPath(import.meta.url));
const TODAY = new Date().toISOString().slice(0, 10);

// Fixed palette for seeding new entries' accent, cycled by registry size.
const PALETTE = [
  '#ff4f7b', '#4fd1ff', '#ffd24f', '#62e87a',
  '#b96bff', '#ff8a3d', '#5f7bff', '#ff5f5f',
];

const SEED_KEYS = ['title', 'blurb', 'players', 'controls', 'setup', 'accent', 'cover'];

const USAGE = `usage:
  node register.mjs --id <repo-name> [--service <name>] [--url <prod-url>]
                    [--repo <owner/name>] [--title T] [--blurb B] [--players P]
                    [--controls C] [--setup S] [--accent "#rrggbb"]
                    [--cover covers/<id>.png] [--dry-run]
  node register.mjs --id <repo-name> --archive

--service/--url/--repo update the entry every run; the rest seed it on first
registration only (hand edits in games.json are never overwritten).`;

try {
  await main();
} catch (err) {
  console.error(`register failed: ${err.message}`);
  process.exit(1);
}

async function main() {
  const opts = parse();
  const { registry, raw } = await loadRegistry();
  const entry = registry.games.find((g) => g.id === opts.id);
  let result;

  if (opts.archive) {
    if (!entry) throw new Error(`no entry "${opts.id}" to archive`);
    entry.archived = true;
    result = entry;
    console.log(`ARCHIVED ${opts.id} — card hidden, entry kept`);
  } else if (!entry) {
    const service = opts.service ?? opts.id;
    result = {
      id: opts.id,
      repo: opts.repo ?? `${registry.owner}/${opts.id}`,
      service,
      url: opts.url ?? `https://${service}.onrender.com`,
      firstSeen: TODAY,
      lastSeen: TODAY,
      archived: false,
      title: opts.title ?? opts.id.charAt(0).toUpperCase() + opts.id.slice(1),
      blurb: opts.blurb ?? '',
      players: opts.players ?? '',
      controls: opts.controls ?? '',
      setup: opts.setup ?? '',
      accent: opts.accent ?? PALETTE[registry.games.length % PALETTE.length],
      cover: opts.cover ?? null,
      urlOverride: null,
      hidden: false,
      order: Math.max(0, ...registry.games.map((g) => g.order)) + 10,
    };
    registry.games.push(result);
    console.log(`ADDED ${opts.id}`);
  } else {
    const ignored = SEED_KEYS.filter((k) => opts[k] !== undefined);
    if (ignored.length) {
      console.warn(
        `WARN: entry exists — ${ignored.map((k) => '--' + k).join(', ')} ignored ` +
          '(presentation fields are hand-owned after creation; edit games.json directly)',
      );
    }
    if (opts.service) {
      entry.service = opts.service;
      entry.url = opts.url ?? `https://${opts.service}.onrender.com`;
    } else if (opts.url) {
      entry.url = opts.url;
    }
    if (opts.repo) entry.repo = opts.repo;
    entry.lastSeen = TODAY;
    entry.archived = false;
    result = entry;
    console.log(`UPDATED ${opts.id}`);
  }

  console.log(JSON.stringify(result, null, 2));

  const output = serialize(registry);
  if (output === raw) {
    console.log('no changes — games.json already up to date');
  } else if (opts.dryRun) {
    console.log('DRY RUN — games.json would change (not written)');
  } else {
    await writeFile(REGISTRY_URL, output);
    console.log(
      `wrote games.json\nnext: review with \`git -C ${ARCADE_DIR} diff games.json\`, ` +
        'then commit & push — the live site updates about a minute after push.',
    );
  }
}

function parse() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        id: { type: 'string' },
        service: { type: 'string' },
        url: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        blurb: { type: 'string' },
        players: { type: 'string' },
        controls: { type: 'string' },
        setup: { type: 'string' },
        accent: { type: 'string' },
        cover: { type: 'string' },
        archive: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    process.exit(1);
  }
  const v = parsed.values;
  if (v.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (!v.id) {
    console.error(`--id is required\n\n${USAGE}`);
    process.exit(1);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(v.id)) {
    console.error(`--id "${v.id}" doesn't look like a repo name`);
    process.exit(1);
  }
  if (v.url && !/^https?:\/\//i.test(v.url)) {
    console.error('--url must start with http(s)://');
    process.exit(1);
  }
  if (v.accent && !/^#[0-9a-f]{3,8}$/i.test(v.accent)) {
    console.warn(`WARN: --accent "${v.accent}" isn't a #hex color — using it anyway`);
  }
  return { ...v, dryRun: v['dry-run'] };
}

async function loadRegistry() {
  let raw;
  try {
    raw = await readFile(REGISTRY_URL, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    console.warn('games.json not found — starting a fresh registry');
    return {
      registry: {
        $schema_note: 'register.mjs owns discovery fields; humans own presentation fields. See README.md.',
        owner: 'nwsgerald',
        exclude: [],
        games: [],
      },
      raw: null,
    };
  }
  const registry = JSON.parse(raw);
  if (typeof registry.owner !== 'string' || !Array.isArray(registry.games)) {
    throw new Error('games.json is malformed: expected { owner, exclude, games }');
  }
  registry.exclude ??= [];
  return { registry, raw };
}

// Stable output: schema key order, games sorted by order (ties: firstSeen, id),
// 2-space indent, trailing newline. Re-running with no changes is byte-identical.
function serialize(registry) {
  const games = [...registry.games]
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.firstSeen.localeCompare(b.firstSeen) ||
        a.id.localeCompare(b.id),
    )
    .map((g) => ({
      id: g.id,
      repo: g.repo,
      service: g.service,
      url: g.url,
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      archived: g.archived,
      title: g.title,
      blurb: g.blurb,
      players: g.players,
      controls: g.controls,
      setup: g.setup,
      accent: g.accent,
      cover: g.cover,
      urlOverride: g.urlOverride,
      hidden: g.hidden,
      order: g.order,
    }));
  return (
    JSON.stringify(
      {
        $schema_note: registry.$schema_note,
        owner: registry.owner,
        exclude: registry.exclude,
        games,
      },
      null,
      2,
    ) + '\n'
  );
}
