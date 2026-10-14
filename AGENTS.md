# Agents

See README.md for what the game is and where the code lives.

## Finding your way

- `ast-grep outline src/` lists the symbols, imports and exports per file. Start there before reading whole files.
- `ast-grep run -p '<pattern>' src/` searches by syntax, e.g. `ast-grep run -p 'strokeLine($$$)' src/`. Prefer it over grep for code.

## Testing

- `bun run check` lints and checks formatting; `bun run format` fixes formatting.
- Test in a real browser with `agent-browser` (`agent-browser skills get core` for usage). The dev server usually already runs on :5277; reuse it rather than starting another.
- After adding a dependency, restart the dev server, or Vite keeps serving stale optimized deps and the page hangs on "Lade Karte…".

## Map data

- `public/map.json` is the committed default map. Regenerate with `bun run fetch-osm && bun run build-map` after changing `src/default-area.js`, `src/overpass.js` or `src/build-map.js`.
- When `src/build-map.js` changes, bump `BUILD_VERSION` in `src/load-map.js` so cached picked areas rebuild.
- Overpass is a shared public service. Fetch once and work from `data/osm.json`; never call it in a loop.

## Version control

This repo uses jj (colocated with git). Commit messages say what changed for the player, not how.

Pushing `main` deploys to nkgta.0sk.ar automatically via Cloudflare Workers CI.
