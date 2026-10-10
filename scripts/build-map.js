// Rasterise data/osm.json onto a tile grid and write public/map.json.
// Usage: bun scripts/build-map.js
import { BBOX, TILE_M } from './bbox.js'
import { T } from '../src/tiles.js'

const osm = await Bun.file('data/osm.json').json()

// Equirectangular projection in metres, origin at the north-west corner.
const latM = 111320
const lonM = 111320 * Math.cos((((BBOX.north + BBOX.south) / 2) * Math.PI) / 180)
const W = Math.ceil(((BBOX.east - BBOX.west) * lonM) / TILE_M)
const H = Math.ceil(((BBOX.north - BBOX.south) * latM) / TILE_M)
const toTile = ({ lat, lon }) => ({
	x: ((lon - BBOX.west) * lonM) / TILE_M,
	y: ((BBOX.north - lat) * latM) / TILE_M,
})

const tiles = new Uint8Array(W * H).fill(T.GROUND)
const streetOf = new Uint16Array(W * H)
const streets = ['']

function fillPolygon(pts, type, onlyOn) {
	let minY = Infinity
	let maxY = -Infinity
	for (const p of pts) {
		minY = Math.min(minY, p.y)
		maxY = Math.max(maxY, p.y)
	}
	for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
		const cy = y + 0.5
		const xs = []
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const a = pts[i]
			const b = pts[j]
			if (a.y > cy !== b.y > cy) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x))
		}
		xs.sort((a, b) => a - b)
		for (let k = 0; k + 1 < xs.length; k += 2) {
			for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(W, Math.round(xs[k + 1])); x++) {
				const i = y * W + x
				if (!onlyOn || onlyOn.includes(tiles[i])) tiles[i] = type
			}
		}
	}
}

function strokeLine(pts, widthM, type, { onlyOn, street } = {}) {
	const r = widthM / TILE_M / 2
	for (let s = 0; s + 1 < pts.length; s++) {
		const a = pts[s]
		const b = pts[s + 1]
		const dx = b.x - a.x
		const dy = b.y - a.y
		const len2 = dx * dx + dy * dy || 1
		const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r))
		const x1 = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + r))
		const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r))
		const y1 = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + r))
		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				const px = x + 0.5
				const py = y + 0.5
				const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2))
				const qx = a.x + t * dx - px
				const qy = a.y + t * dy - py
				if (qx * qx + qy * qy > r * r) continue
				const i = y * W + x
				if (onlyOn && !onlyOn.includes(tiles[i])) continue
				tiles[i] = type
				if (street) streetOf[i] = street
			}
		}
	}
}

// Road widths in metres, kerb to kerb.
const ROADS = {
	primary: 18,
	secondary: 15,
	tertiary: 12,
	residential: 10,
	unclassified: 10,
	living_street: 7,
	service: 4,
}
const PATHS = ['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'track', 'bridleway']
const roadClass = (h) => h?.replace('_link', '')

const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry)
const geom = (w) => w.geometry.map(toTile)
const closed = (w) => w.nodes && w.nodes[0] === w.nodes[w.nodes.length - 1]
const underground = (w) => w.tags.tunnel === 'yes' || Number(w.tags.layer) < 0 || w.tags.indoor

// 1. Green and water.
for (const w of ways) {
	const t = w.tags
	if (!closed(w)) continue
	if (t.leisure === 'playground') continue
	if (t.leisure === 'pitch') fillPolygon(geom(w), T.PITCH)
	else if (t.leisure || t.landuse || ['wood', 'scrub'].includes(t.natural)) fillPolygon(geom(w), T.GRASS)
	else if (t.natural === 'water') fillPolygon(geom(w), T.WATER)
}
for (const w of ways) if (w.tags.leisure === 'playground' && closed(w)) fillPolygon(geom(w), T.PLAYGROUND)
for (const w of ways) if (w.tags.waterway === 'canal' || w.tags.waterway === 'river') strokeLine(geom(w), 20, T.WATER)

// 2. Sidewalks: every road gets a 4 m pavement each side.
// Driveways and parking aisles are mostly Hinterhof clutter at this scale.
const roadWays = ways.filter(
	(w) => ROADS[roadClass(w.tags.highway)] && !underground(w) && !w.tags.area && !['driveway', 'parking_aisle'].includes(w.tags.service),
)
for (const w of roadWays) strokeLine(geom(w), ROADS[roadClass(w.tags.highway)] + 8, T.SIDEWALK, { onlyOn: [T.GROUND, T.GRASS] })

// 3. Pedestrian squares.
for (const w of ways) if (w.tags.highway === 'pedestrian' && w.tags.area === 'yes' && closed(w)) fillPolygon(geom(w), T.SIDEWALK)

// 4. Buildings.
for (const w of ways) if (w.tags.building && closed(w) && !underground(w)) fillPolygon(geom(w), T.BUILDING)

// 5. Roads, widest first so junctions look right.
roadWays.sort((a, b) => ROADS[roadClass(a.tags.highway)] - ROADS[roadClass(b.tags.highway)])
for (const w of roadWays) {
	let street
	const name = w.tags.name
	if (name) {
		street = streets.indexOf(name)
		if (street < 0) street = streets.push(name) - 1
	}
	strokeLine(geom(w), ROADS[roadClass(w.tags.highway)], T.ROAD, { street })
}

// 6. Paths and cycleways, never through buildings or over roads.
for (const w of ways) {
	const h = w.tags.highway
	if (!PATHS.includes(h) || underground(w) || w.tags.area) continue
	const type = h === 'cycleway' ? T.CYCLEWAY : T.SIDEWALK
	strokeLine(geom(w), h === 'cycleway' ? 2.5 : 2, type, { onlyOn: [T.GROUND, T.GRASS, T.PLAYGROUND] })
}

// Places worth walking to.
function poiKind(t) {
	if (t.shop === 'kiosk' || t.shop === 'convenience') return 'spaeti'
	if (t.amenity === 'fast_food' && /kebab|doner|döner/i.test(t.cuisine ?? '')) return 'doener'
	if (t.amenity === 'fast_food') return 'imbiss'
	if (t.amenity === 'cafe' || t.amenity === 'ice_cream') return 'cafe'
	if (t.amenity === 'bar' || t.amenity === 'pub' || t.amenity === 'nightclub') return 'bar'
	if (t.amenity === 'restaurant') return 'restaurant'
	if (t.shop === 'bicycle') return 'bikeshop'
	if (t.shop === 'supermarket') return 'supermarket'
	if (t.shop === 'bakery') return 'bakery'
	if (t.amenity === 'pharmacy') return 'pharmacy'
	if (t.amenity === 'school') return 'school'
	if (t.amenity === 'kindergarten') return 'kita'
	if (t.leisure === 'playground') return 'playground'
	return null
}
const pois = []
for (const e of osm.elements) {
	if (e.type !== 'node' || !e.tags) continue
	const kind = poiKind(e.tags)
	if (!kind) continue
	const { x, y } = toTile(e)
	if (x < 0 || y < 0 || x >= W || y >= H) continue
	pois.push({ kind, name: e.tags.name ?? '', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
}

const map = {
	w: W,
	h: H,
	tileM: TILE_M,
	bbox: BBOX,
	tiles: Buffer.from(tiles).toString('base64'),
	streetOf: Buffer.from(streetOf.buffer).toString('base64'),
	streets,
	pois,
}
await Bun.write('public/map.json', JSON.stringify(map))
const counts = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, tiles.filter((t) => t === v).length]))
console.log(`${W}×${H} tiles, ${streets.length - 1} streets, ${pois.length} places`, counts)
