# NK GTA

A little top-down game set in the real streets of Neukölln. Streets, buildings, parks and shops come from OpenStreetMap, rasterised onto a 3 m tile grid.

```sh
bun install
bun run fetch-osm   # data/osm.json from Overpass
bun run build-map   # public/map.json
bun run dev
```

Arrow keys walk, space gets on and off the bike. Collect Pfand bottles and cash them in at a Späti.

Map data © OpenStreetMap contributors, ODbL.
