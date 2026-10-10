# NK GTA

A little top-down game set in the real streets of Neukölln, in the spirit of GTA 1. Streets, buildings, parks, shops, U-Bahn and bus stops come from OpenStreetMap. Buildings stand up in 3D at their mapped number of storeys; underneath, everything is also rasterised onto a 3 m tile grid that decides where you can walk.

```sh
bun install
bun run fetch-osm   # data/osm.json from Overpass, for the default area in src/default-area.js
bun run build-map   # public/map.json, the static default map
bun run dev
```

Arrow keys or WASD walk, E gets on and off the bike, space is turbo (for testing), +/− or the mouse wheel zooms, N toggles street names, T toggles U-Bahn and bus stops, M picks another area. Footpaths and Tordurchfahrten through buildings (`tunnel=building_passage`) cut through the block, so you can walk the Kino-Passage from Karl-Marx-Straße into the Hof and out onto Richardstraße. Private paths and passages are walkable too, hatched on the map. Collect Pfand bottles and cash them in at a Späti.

Picked areas (`/pick.html`, then `/?area=south,west,north,east`) are fetched from Overpass in the browser, built there, and cached with TinyJoin in OPFS. OPFS needs https or localhost; over plain http the cache is skipped.

## Code

- `src/overpass.js`, `src/build-map.js`: OSM data in; tile grid, ground shapes, building outlines, places and stops out. Shared by the scripts and the browser.
- `src/load-map.js`, `src/map-codec.js`, `src/area-cache.js`: getting a map into the game.
- `src/world.js`: tile lookups and start points.
- `src/player.js`, `src/pfand.js`, `src/input.js`, `src/camera.js`: the game.
- `src/scene.js`: the 3D city in three.js. Buildings are raised from their outlines, with windows drawn in the wall shader, under a perspective camera looking straight down.
- `src/map-image.js`: the ground and roof textures, painted once from the map's shapes.
- `src/sprites.js`, `src/draw.js`, `src/hud.js`: the flat layer on top (places, stops, street names, the player) and the text.

Map data © OpenStreetMap contributors, ODbL.
