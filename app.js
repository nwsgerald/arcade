const PLACEHOLDER_BLURB = 'Just deployed — description coming soon.';

main();

async function main() {
  const grid = document.getElementById('grid');

  let registry;
  try {
    const res = await fetch('games.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    registry = await res.json();
  } catch (err) {
    grid.append(gridMessage(`Couldn't load the game list (${err.message}). Try refreshing.`));
    return;
  }

  const games = registry.games
    .filter((g) => !g.hidden && !g.archived)
    .sort((a, b) => a.order - b.order || a.firstSeen.localeCompare(b.firstSeen));

  if (games.length === 0) {
    grid.append(gridMessage('No games yet — run a scan.'));
  } else {
    for (const game of games) grid.append(card(game));
  }

  renderStats(registry.games, games.length);
}

function card(game) {
  const el = document.createElement('article');
  el.className = 'card';
  el.style.setProperty('--accent', game.accent);

  el.append(cover(game));

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = game.title;
  body.append(title);

  const blurb = document.createElement('p');
  blurb.className = 'blurb';
  if (game.blurb) {
    blurb.textContent = game.blurb;
  } else {
    blurb.textContent = PLACEHOLDER_BLURB;
    blurb.classList.add('placeholder');
  }
  body.append(blurb);

  const chipTexts = [game.players, game.controls, game.setup].filter(Boolean);
  if (chipTexts.length > 0) {
    const chips = document.createElement('ul');
    chips.className = 'chips';
    for (const text of chipTexts) {
      const chip = document.createElement('li');
      chip.textContent = text;
      chips.append(chip);
    }
    body.append(chips);
  }

  const play = document.createElement('a');
  play.className = 'play';
  play.href = game.urlOverride ?? game.url;
  play.target = '_blank';
  play.rel = 'noopener';
  play.textContent = '▶ PLAY';
  body.append(play);

  el.append(body);
  return el;
}

function cover(game) {
  const el = document.createElement('div');
  el.className = 'cover';
  if (game.cover) {
    const img = document.createElement('img');
    img.src = game.cover;
    img.alt = '';
    img.loading = 'lazy';
    el.append(img);
  } else {
    const letter = document.createElement('span');
    letter.className = 'cover-letter';
    letter.setAttribute('aria-hidden', 'true');
    letter.textContent = (game.title || game.id).charAt(0).toUpperCase();
    el.append(letter);
  }
  return el;
}

function renderStats(allGames, visibleCount) {
  const stats = document.getElementById('stats');
  const lastUpdated = allGames.map((g) => g.lastSeen).sort().at(-1);
  const count = `${visibleCount} game${visibleCount === 1 ? '' : 's'}`;
  stats.textContent = lastUpdated ? `${count} · updated ${lastUpdated}` : count;
}

function gridMessage(text) {
  const p = document.createElement('p');
  p.className = 'grid-message';
  p.textContent = text;
  return p;
}
