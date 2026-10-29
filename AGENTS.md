# Agents

See README.md for what the game is and where the code lives.

## Finding your way

- `ast-grep outline src/` lists the symbols, imports and exports per file. Start there before reading whole files.
- `ast-grep run -p '<pattern>' src/` searches by syntax, e.g. `ast-grep run -p 'strokeLine($$$)' src/`. Prefer it over grep for code.

## Testing

Oskar values speed over certainty. Verify once and stop: one check that the change works, one before/after if you're measuring. Never re-run a check to firm up a result, re-check views you didn't change, or chase noise. Rough numbers are fine. If you catch yourself verifying a second time, stop and report what you have.

- `bun run check` lints and checks formatting; `bun run format` fixes formatting. The deploy runs it first, so a file that fails it (even in docs/) stops the site updating.
- Test in a real browser with `agent-browser` (`agent-browser skills get core` for usage): one look at the view you changed, not a tour of every look and camera. The dev server usually already runs on :5277; reuse it rather than starting another.
- Headless `agent-browser` renders in software here (SwiftShader), so its frame times mean nothing. For perf numbers, run `chromium-browser --headless=new --enable-gpu --ignore-gpu-blocklist --use-angle=gl --remote-debugging-port=<port> --user-data-dir=/tmp/<name> about:blank &` and `agent-browser connect <port>`; the GPU string should say Radeon. `?perf` has the timings.
- After adding a dependency, restart the dev server, or Vite keeps serving stale optimized deps and the page hangs on "Lade Karte…".

PLEASE, do not verify and visually screenshot everything single thing.

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
- `HILLS` in `src/terrain.js` is how hills feel without changing their height: walking and cycling pace up and down, freewheeling, gravity on cars, hill shading from above.

## Working in a worktree

Agents often work in parallel, each in its own bb worktree, and the lead agent lands their commits on main.

- Worktrees are plain git, not jj: make one git commit on the base, don't push and don't touch main. On another machine (e.g. hetzner), push it as a branch named after the issue instead, since the lead can't reach that disk.
- Run `bun install` first, and start your own dev server on a free port (`bunx vite --port <5300-5399> --strictPort`); :5277 belongs to the main checkout.
- Stay inside your task. src/scene.js is shared by most look changes: touch as few of its lines as you can and put new things in their own module, so parallel work merges cleanly.
- Finish with: the commit (or branch), one line per change the player notices, perf before/after if it draws anything, a before/after screenshot at an absolute path if it shows on screen, and what Oskar should check by eye.

## Issues

Ideas, bugs and the roadmap live in GitHub issues, using the labels `now`, `next` and `later`. Not in Linear and not in the bb inbox.

## Version control

This repo uses jj (colocated with git). Commit messages say what changed for the player, not how.

Pushing `main` deploys to nkgta.0sk.ar automatically via Cloudflare Workers CI.

## Pull requests

If the change shows on screen, attach a before/after: `gh pr edit <n> --attach './before.png#Alt text'`. Otherwise skip screenshots.
