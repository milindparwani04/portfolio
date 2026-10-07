// Victory Road: bundles the Pokémon Showdown battle simulator (MIT, sim/ + data only — never the
// AGPL client) with Victory Road's engine glue into one Web Worker script, public/vr/vr-engine.js.
//
// Usage:  npm ci --prefix scripts/vr
//         node scripts/vr/build-sim.mjs <path to a pokemon-showdown checkout> [--node]
//
// --node also writes scripts/vr/dist/vr-engine.cjs (same engine, CommonJS) for tests/vr.
// Pinned Showdown commit: see SHOWDOWN_COMMIT below; the build refuses a different checkout.
//
// Showdown loads data with dynamic require() and fs.readdirSync(); a browser has neither. The plugin
// below replaces those calls with a static registry of exactly the data files a battle needs (base
// Gen 9 data + the champions and championsregmb mods), stubs Node built-ins, and supplies a
// one-format formats list so the 300 ladder formats aren't bundled.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

export const SHOWDOWN_COMMIT = 'c046106cbe075931b1ff8d8b800ff5be47a85f96';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const [psArg, ...flags] = process.argv.slice(2);
if (!psArg) { console.error('Usage: node scripts/vr/build-sim.mjs <pokemon-showdown checkout> [--node]'); process.exit(1); }
const PS = path.resolve(psArg).replace(/\\/g, '/');
const head = execSync('git rev-parse HEAD', { cwd: PS }).toString().trim();
if (head !== SHOWDOWN_COMMIT && !flags.includes('--any-commit')) {
  console.error(`Showdown checkout is at ${head}; expected ${SHOWDOWN_COMMIT}. Check it out, or pass --any-commit and update SHOWDOWN_COMMIT + NOTICE.md.`);
  process.exit(1);
}

const DATA = ['abilities', 'aliases', 'conditions', 'formats-data', 'items', 'moves', 'natures', 'pokedex', 'rulesets', 'scripts', 'typechart'];
const MODS = ['champions', 'championsregmb'];
const registryFiles = [];
for (const f of DATA) registryFiles.push([`/data/${f}`, `${PS}/data/${f}.ts`]);
for (const mod of MODS) {
  for (const f of fs.readdirSync(`${PS}/data/mods/${mod}`)) {
    const name = f.replace(/\.ts$/, '');
    if (name === 'learnsets' || name === 'random-teams') continue; // validator / random battles only
    registryFiles.push([`/data/mods/${mod}/${name}`, `${PS}/data/mods/${mod}/${f}`]);
  }
}
const registrySource = [
  ...registryFiles.map(([, file], i) => `import * as m${i} from ${JSON.stringify(file)};`),
  `import * as formats from ${JSON.stringify(path.join(here, 'engine/formats.js').replace(/\\/g, '/'))};`,
  'const REG = {',
  ...registryFiles.map(([key], i) => `  ${JSON.stringify(key)}: m${i},`),
  "  '/config/formats': formats,",
  '};',
  'export function vrRequire(p) {',
  "  const key = String(p).replace(/\\\\/g, '/').replace(/\\.(ts|js)$/, '').replace(/\\/+$/, '');",
  '  if (REG[key]) return REG[key];',
  "  const e = new Error('Cannot find module ' + key); e.code = 'MODULE_NOT_FOUND'; throw e;",
  '}',
  `export const MOD_NAMES = ${JSON.stringify(MODS)};`
].join('\n');

const PATH_SHIM = `
const norm = (parts) => { const out = []; for (const p of parts.join('/').split('/')) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p); } return '/' + out.join('/'); };
export const resolve = (...a) => { let acc = []; for (const p of a) { if (String(p).startsWith('/')) acc = [p]; else acc.push(p); } return norm(acc); };
export const join = (...a) => norm(a);
export const dirname = (p) => p.replace(/\\/[^/]*$/, '') || '/';
export const basename = (p) => p.replace(/^.*\\//, '');
export const extname = (p) => (p.match(/\\.[^./]*$/) || [''])[0];
export const sep = '/';
export default { resolve, join, dirname, basename, extname, sep };`;

const UTIL_SHIM = `
export function isDeepStrictEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a); const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && isDeepStrictEqual(a[k], b[k]));
}
export default { isDeepStrictEqual };`;

const plugin = {
  name: 'vr-showdown',
  setup(build) {
    build.onResolve({ filter: /^vr-registry$/ }, () => ({ path: 'vr-registry', namespace: 'vr' }));
    build.onLoad({ filter: /.*/, namespace: 'vr' }, (args) => {
      if (args.path === 'vr-registry') return { contents: registrySource, loader: 'js', resolveDir: PS };
      if (args.path === 'path') return { contents: PATH_SHIM, loader: 'js' };
      if (args.path === 'util') return { contents: UTIL_SHIM, loader: 'js' };
      if (args.path === 'lib') return { contents: `export * as Streams from ${JSON.stringify(`${PS}/lib/streams.ts`)};\nexport * as Utils from ${JSON.stringify(`${PS}/lib/utils.ts`)};`, loader: 'js', resolveDir: PS };
      return { contents: 'export default {}; export const readdirSync = () => []; export const existsSync = () => false;', loader: 'js' };
    });
    // Node built-ins: path gets a small POSIX shim, the rest are empty.
    build.onResolve({ filter: /^(node:)?(fs|path|child_process|net|http|https|url|zlib|os|crypto|worker_threads|stream|util|tty|readline|cluster|dns|v8|vm|assert)$/ }, (args) => ({
      path: ['path', 'util'].includes(args.path.replace(/^node:/, '')) ? args.path.replace(/^node:/, '') : 'empty', namespace: 'vr'
    }));
    // sim/* imports '../lib', whose index also pulls in the server's FS, Net, SQL and REPL.
    build.onResolve({ filter: /^\.\.\/lib$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('/sim/') ? { path: 'lib', namespace: 'vr' } : undefined));
    // Random-battle team generators and translated text are never used by Victory Road; their
    // template-string require()s would otherwise make esbuild bundle whole directories.
    build.onLoad({ filter: /[\\/]sim[\\/](teams|dex-text)\.ts$/ }, (args) => {
      let src = fs.readFileSync(args.path, 'utf8');
      const before = src;
      src = src.replace(/require\(`[^`]*`\)/g, "vrRequire('/unused')").replace('return require(filePath)[exportName];', 'return vrRequire(filePath)[exportName];');
      if (src === before) throw new Error(`Showdown changed: no require() patched in ${args.path}`);
      return { contents: `import { vrRequire } from 'vr-registry';\n${src}`, loader: 'ts', resolveDir: path.dirname(args.path) };
    });
    build.onLoad({ filter: /[\\/]sim[\\/](dex|dex-formats)\.ts$/ }, (args) => {
      let src = fs.readFileSync(args.path, 'utf8');
      src = `import { vrRequire, MOD_NAMES } from 'vr-registry';\n${src}`;
      src = src.replace('const dataObject = require(filePath);', 'const dataObject = vrRequire(filePath);');
      src = src.replace("const exported = require(path.resolve(DATA_DIR, 'aliases'));", "const exported = vrRequire('/data/aliases');");
      src = src.replace('for (const mod of fs.readdirSync(MODS_DIR)) {', 'for (const mod of MOD_NAMES) {');
      src = src.replace('customFormats = require(`${__dirname}/../config/custom-formats`).Formats;', "customFormats = vrRequire('/config/custom-formats').Formats;");
      src = src.replace('let Formats: AnyObject[] = require(`${__dirname}/../config/formats`).Formats;', "let Formats: AnyObject[] = vrRequire('/config/formats').Formats;");
      for (const needle of ['vrRequire(filePath)', "vrRequire('/data/aliases')", 'MOD_NAMES) {', "vrRequire('/config/formats')"]) {
        if (path.basename(args.path) === 'dex.ts' && needle.includes('formats')) continue;
        if (path.basename(args.path) === 'dex-formats.ts' && !needle.includes('formats')) continue;
        if (!src.includes(needle)) throw new Error(`Showdown changed: patch "${needle}" no longer applies to ${args.path}`);
      }
      return { contents: src, loader: 'ts', resolveDir: path.dirname(args.path) };
    });
  }
};

const common = {
  entryPoints: [path.join(here, 'engine/worker.js')],
  bundle: true,
  plugins: [plugin],
  alias: { 'ps-sim': PS },
  nodePaths: [path.join(here, 'node_modules')],
  define: { __dirname: '"/sim"', 'process.env.NODE_ENV': '"production"' },
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  target: ['es2020'],
  banner: { js: `/* Victory Road engine. Includes Pokémon Showdown sim (MIT, (c) Guangcong Luo and contributors, ${SHOWDOWN_COMMIT}). See /vr/NOTICE.md */` }
};
const out = path.join(repo, 'public/vr/vr-engine.js');
await esbuild.build({ ...common, format: 'iife', platform: 'browser', outfile: out });
const size = fs.statSync(out).size;
const { gzipSync } = await import('node:zlib');
console.log(`public/vr/vr-engine.js ${(size / 1024).toFixed(0)} KB, ${(gzipSync(fs.readFileSync(out)).length / 1024).toFixed(0)} KB gzipped`);
if (flags.includes('--node')) {
  const nodeOut = path.join(here, 'dist/vr-engine.cjs');
  await esbuild.build({ ...common, entryPoints: [path.join(here, 'engine/engine.js')], format: 'cjs', platform: 'node', outfile: nodeOut, minify: false });
  console.log(`scripts/vr/dist/vr-engine.cjs written`);
}
