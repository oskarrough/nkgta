# NK GTA

A little top-down game set in the real streets of Neukölln. Streets, buildings, parks and shops come from OpenStreetMap, rasterised onto a 3 m tile grid.

```sh
bun install
bun run fetch-osm   # data/osm.json from Overpass, for the default area in scripts/bbox.js
bun run build-map   # public/map.json, the static default map
bun run dev
```

Arrow keys or WASD walk, E gets on and off the bike, space is turbo (for testing), +/− or the mouse wheel zooms, N toggles street names, M picks another area. Collect Pfand bottles and cash them in at a Späti.

Picked areas (`/pick.html`, then `/?area=south,west,north,east`) are fetched from Overpass in the browser, built there, and cached with TinyJoin in OPFS. OPFS needs https or localhost; over plain http the cache is skipped.

## Code

- `src/overpass.js`, `src/build-map.js`: OSM data in, tile grid out. Shared by the scripts and the browser.
- `src/load-map.js`, `src/map-codec.js`, `src/area-cache.js`: getting a map into the game.
- `src/world.js`: tile lookups and start points.
- `src/player.js`, `src/pfand.js`, `src/input.js`, `src/camera.js`: the game.
- `src/map-image.js`, `src/sprites.js`, `src/draw.js`, `src/hud.js`: what you see.

Map data © OpenStreetMap contributors, ODbL.
