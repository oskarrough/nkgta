// Rasterise data/osm.json into public/map.json, the area the game opens with.
// Usage: bun scripts/build-map.js
import { BBOX, TILE_M } from '../src/default-area.js'
import { T } from '../src/tiles.js'
import { buildMap } from '../src/build-map.js'
import { encodeMap } from '../src/map-codec.js'

const osm = await Bun.file('data/osm.json').json()
const map = buildMap(osm, BBOX, TILE_M)
await Bun.write('public/map.json', JSON.stringify(encodeMap(map)))
const counts = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, map.tiles.filter((t) => t === v).length]))
console.log(`${map.w}×${map.h} tiles, ${map.streets.length - 1} streets, ${map.labels.length} labels, ${map.pois.length} places`, counts)
