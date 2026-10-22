# Agents

See README.md for what the game is and where the code lives.

## Finding your way

- `ast-grep outline src/` lists the symbols, imports and exports per file. Start there before reading whole files.
- `ast-grep run -p '<pattern>' src/` searches by syntax, e.g. `ast-grep run -p 'strokeLine($$$)' src/`. Prefer it over grep for code.

## Testing

- `bun run check` lints and checks formatting; `bun run format` fixes formatting.
- Test in a real browser with `agent-browser` (`agent-browser skills get core` for usage): one look at the view you changed, not a tour of every look and camera. The dev server usually already runs on :5277; reuse it rather than starting another.
- After adding a dependency, restart the dev server, or Vite keeps serving stale optimized deps and the page hangs on "Lade Karte…".

## Map data

- `public/map.json` is the committed default map. Regenerate with `bun run fetch-osm && bun run build-map` after changing `src/default-area.js`, `src/overpass.js` or `src/build-map.js`.
- When `src/build-map.js` or `src/map-codec.js` changes, bump `BUILD_VERSION` in `src/load-map.js` so cached picked areas rebuild.
- Overpass is a shared public service. Fetch once and work from `data/osm.json`; never call it in a loop.

## Ground height

- `public/terrain.json` is a 12 m grid of heights for the default area, from Berlin's ATKIS DGM1 (bare ground, 1 m, EPSG:25833, dl-de/zero-2-0). `bun run build-terrain` downloads the 2 km tiles once into `data/dgm/` (`https://gdi.berlin.de/data/dgm1/atom/DGM1_<km east>_<km north>.zip`, ~18 MB each) and rebuilds it. Rerun after changing `src/default-area.js`. `--debug` writes shaded relief PNGs to `data/`.
- The build fills dips and shaves ridges narrower than ~60 m before smoothing. Without that, bridges sink into the canals and Karl-Marx-Straße climbs over the Ringbahn embankment instead of passing under it.
- Anything standing in the city gets its z from `world.heightAt(x, y)` (tiles, 0 at the lowest point); slopes from `world.slopeAt`. Without terrain, e.g. picked areas, both return 0, so new code must work flat too.
- Buildings stand on the lowest ground under their outline; walls reach a little below it. The overhead camera rises with the ground at the view's centre so the 2D overlay lines up there. Shop interiors stay flat (`cam.ground: 0`).
- `RELIEF` in `src/terrain.js` exaggerates every slope; 1 is true to life.

## Version control

This repo uses jj (colocated with git). Commit messages say what changed for the player, not how.

Pushing `main` deploys to nkgta.0sk.ar automatically via Cloudflare Workers CI.
