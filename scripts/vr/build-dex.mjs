// Victory Road: builds public/vr/dex.json and downloads the pixel sprites it lists.
//
// Usage: node scripts/vr/build-dex.mjs <path to a pokemon-showdown checkout> [--no-sprites]
//
// Species data comes from the Pokémon Showdown simulator's data/pokedex.ts (MIT). Sprites come from
// the PokeAPI sprites repository (CC0 repository; the images themselves are © The Pokémon Company
// and are used here for an unofficial fan project, see public/vr/NOTICE.md). Sprites already on
// disk are skipped, so re-running only fetches what is missing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [psRoot, ...flags] = process.argv.slice(2);
if (!psRoot) { console.error('Usage: node scripts/vr/build-dex.mjs <pokemon-showdown checkout> [--no-sprites]'); process.exit(1); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_JSON = path.join(repo, 'public/vr/dex.json');
const SPRITE_DIR = path.join(repo, 'public/assets/vr/sprites');
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const KINDS = { front: '', back: 'back/', shiny: 'shiny/', 'back-shiny': 'back/shiny/' };

const { Pokedex } = await import(pathToFileURL(path.join(psRoot, 'data/pokedex.ts')).href);
const toId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const J = (o) => JSON.stringify(o);
const genOf = (num) => [151, 251, 386, 493, 649, 721, 809, 905, 1025].findIndex((last) => num <= last) + 1;

// Forms a player can pick: every base species, plus alternate forms that change stats, types or
// abilities and exist outside battle (regional forms, Rotom appliances, Therian forms...). Forms that
// only appear mid-battle or need a held item (Megas, Primal, Zen, Crowned...) are battle forms: they get
// sprites but are not listed in the pool.
const NOT_FORMS = /Gmax|Totem|Starter|Eternamax|Tera|Stellar|Cosplay|Rock-Star|Belle|Pop-Star|PhD|Libre|Bond|Busted/;
const isPickable = (s) => {
  if (!s.forme) return true;
  if (s.battleOnly || s.requiredItem || s.requiredItems || s.requiredMove || NOT_FORMS.test(s.forme)) return false;
  if (/Mega|Primal|Ultra|Zen|Blade|Complete|School|Meteor|Pirouette|Crowned|Hero|Sunny|Rainy|Snowy|Unbound|Hangry|Noice|Gulping|Gorging/.test(s.forme)) return false;
  if (s.name === 'Rockruff-Dusk' || s.name === 'Gimmighoul-Roaming' || s.name === 'Pichu-Spiky-eared') return false;
  const base = Pokedex[toId(s.baseSpecies)];
  return J(s.baseStats) !== J(base.baseStats) || J(s.types) !== J(base.types) || J(s.abilities) !== J(base.abilities);
};
const isBattleForm = (s) => s.forme && !isPickable(s) && !NOT_FORMS.test(s.forme) && s.isNonstandard !== 'CAP'
  && /Mega|Primal|Zen|Blade|Complete|School|Meteor|Pirouette|Crowned|Hero|Sunny|Rainy|Snowy|Unbound|Hangry|Noice|Gulping|Gorging|Ultra/.test(s.forme);

// PokeAPI names its forms differently from Showdown; match on the base name plus the form words.
const api = await (await fetch('https://pokeapi.co/api/v2/pokemon?limit=2000')).json();
const apiByName = new Map(api.results.map((r) => [r.name, Number(r.url.split('/').slice(-2, -1)[0])]));
const SPECIAL = {
  'Tauros-Paldea-Combat': 'tauros-paldea-combat-breed', 'Tauros-Paldea-Blaze': 'tauros-paldea-blaze-breed', 'Tauros-Paldea-Aqua': 'tauros-paldea-aqua-breed',
  'Meowstic-F': 'meowstic-female', 'Indeedee-F': 'indeedee-female', 'Basculegion-F': 'basculegion-female', 'Oinkologne-F': 'oinkologne-female',
  'Darmanitan-Galar': 'darmanitan-galar-standard', 'Darmanitan-Galar-Zen': 'darmanitan-galar-zen', 'Darmanitan-Zen': 'darmanitan-zen',
  'Necrozma-Dusk-Mane': 'necrozma-dusk', 'Necrozma-Dawn-Wings': 'necrozma-dawn', 'Zygarde-10%': 'zygarde-10', 'Oricorio-Pa\'u': 'oricorio-pau',
  'Squawkabilly-Yellow': 'squawkabilly-yellow-plumage', 'Squawkabilly-White': 'squawkabilly-white-plumage', 'Meowstic-M-Mega': 'meowstic-male-mega', 'Meowstic-F-Mega': 'meowstic-female-mega',
  'Minior-Meteor': 'minior-red-meteor', 'Wishiwashi-School': 'wishiwashi-school', 'Palafin-Hero': 'palafin-hero', 'Mimikyu-Busted': 'mimikyu-busted',
  'Zacian-Crowned': 'zacian-crowned', 'Zamazenta-Crowned': 'zamazenta-crowned', 'Floette-Mega': 'floette-mega', 'Meloetta-Pirouette': 'meloetta-pirouette',
  'Morpeko-Hangry': 'morpeko-hangry', 'Eiscue-Noice': 'eiscue-noice', 'Cramorant-Gulping': 'cramorant-gulping', 'Cramorant-Gorging': 'cramorant-gorging',
  'Castform-Sunny': 'castform-sunny', 'Castform-Rainy': 'castform-rainy', 'Castform-Snowy': 'castform-snowy', 'Hoopa-Unbound': 'hoopa-unbound',
  'Zygarde-Complete': 'zygarde-complete', 'Aegislash-Blade': 'aegislash-blade', 'Necrozma-Ultra': 'necrozma-ultra', 'Cherrim-Sunshine': 'cherrim-sunshine'
};
function apiId(s) {
  if (!s.forme) return s.num;
  if (s.name in SPECIAL) return SPECIAL[s.name] ? apiByName.get(SPECIAL[s.name]) ?? null : null;
  const slug = s.name.toLowerCase().replace(/[’'.%:]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  if (apiByName.has(slug)) return apiByName.get(slug);
  // Megas with X/Y and other suffixes: "charizard-mega-x" already matches the slug; anything else
  // is reported as missing below and drawn with the base species sprite.
  return null;
}

const entries = [];
const battleForms = [];
const missing = [];
for (const [id, s] of Object.entries(Pokedex)) {
  if (!(s.num > 0 && s.num <= 1025) || s.isNonstandard === 'CAP' || s.isNonstandard === 'Custom') continue;
  const pickable = isPickable(s);
  if (!pickable && !isBattleForm(s)) continue;
  const sprite = apiId(s);
  if (sprite == null) missing.push(s.name);
  const entry = { id, name: s.name, num: s.num, gen: genOf(s.num), form: s.forme || '', types: s.types, sprite: sprite ?? s.num };
  (pickable ? entries : battleForms).push(entry);
}
entries.sort((a, b) => a.num - b.num || (a.form ? 1 : 0) - (b.form ? 1 : 0) || a.name.localeCompare(b.name));

async function download(entry) {
  const flags = {};
  for (const [kind, prefix] of Object.entries(KINDS)) {
    const file = path.join(SPRITE_DIR, kind, `${entry.id}.png`);
    if (fs.existsSync(file)) { flags[kind] = 1; continue; }
    const res = await fetch(`${SPRITE_BASE}/${prefix}${entry.sprite}.png`);
    if (!res.ok) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    flags[kind] = 1;
  }
  return flags;
}

const all = [...entries, ...battleForms];
if (!flags.includes('--no-sprites')) {
  for (let i = 0; i < all.length; i += 16) {
    const batch = all.slice(i, i + 16);
    const results = await Promise.all(batch.map(download));
    batch.forEach((entry, n) => { entry.has = Object.keys(results[n]).join(','); });
    process.stdout.write(`\rsprites ${Math.min(i + 16, all.length)}/${all.length}`);
  }
  process.stdout.write('\n');
} else {
  all.forEach((entry) => { entry.has = Object.keys(KINDS).filter((k) => fs.existsSync(path.join(SPRITE_DIR, k, `${entry.id}.png`))).join(','); });
}

// Compact rows: [id, name, num, gen, form, types, has-sprites]. "has" lists which of front, back,
// shiny, back-shiny exist; the page falls back from a missing one rather than requesting it.
const KEYS = Object.keys(KINDS);
const pack = (e) => [e.id, e.name, e.num, e.gen, e.form, e.types, KEYS.map((k) => (e.has.split(',').includes(k) ? 1 : 0)).join('')];
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify({
  source: 'Pokémon Showdown data/pokedex.ts (MIT) + PokeAPI sprites (images © The Pokémon Company; fan use)',
  fields: ['id', 'name', 'num', 'gen', 'form', 'types', 'sprites(front,back,shiny,back-shiny)'],
  pool: entries.map(pack),
  battle: battleForms.map(pack)
}));
console.log(`pool ${entries.length}, battle forms ${battleForms.length}, no PokeAPI match (base sprite used): ${missing.join(', ') || 'none'}`);
