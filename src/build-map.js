// Rasterise raw Overpass JSON onto a tile grid. Runs in Bun and the browser.
import { T } from './tiles.js'

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

export function buildMap(osm, bbox, tileM) {
	// Equirectangular projection in metres, origin at the north-west corner.
	const latM = 111320
	const lonM = 111320 * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)
	const W = Math.ceil(((bbox.east - bbox.west) * lonM) / tileM)
	const H = Math.ceil(((bbox.north - bbox.south) * latM) / tileM)
	const toTile = ({ lat, lon }) => ({
		x: ((lon - bbox.west) * lonM) / tileM,
		y: ((bbox.north - lat) * latM) / tileM,
	})

	const tiles = new Uint8Array(W * H).fill(T.GROUND)
	const streetOf = new Uint16Array(W * H)
	const streets = ['']

	// Even-odd scanline fill, so inner rings (courtyards) stay holes.
	function fillRings(rings, type, onlyOn) {
		let minY = Infinity
		let maxY = -Infinity
		for (const pts of rings) {
			for (const p of pts) {
				minY = Math.min(minY, p.y)
				maxY = Math.max(maxY, p.y)
			}
		}
		for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
			const cy = y + 0.5
			const xs = []
			for (const pts of rings) {
				for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
					const a = pts[i]
					const b = pts[j]
					if (a.y > cy !== b.y > cy) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x))
				}
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
		const r = widthM / tileM / 2
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

	const geom = (g) => g.map(toTile)
	const underground = (t) => t.tunnel === 'yes' || Number(t.layer) < 0 || t.indoor

	// Every closed way and multipolygon relation becomes { tags, rings }.
	const areas = []
	const ways = []
	for (const e of osm.elements) {
		if (e.type === 'way' && e.geometry) {
			ways.push(e)
			if (e.nodes && e.nodes[0] === e.nodes.at(-1)) areas.push({ tags: e.tags, rings: [geom(e.geometry)] })
		} else if (e.type === 'relation' && e.tags?.type === 'multipolygon' && e.members) {
			const parts = e.members.filter((m) => m.type === 'way' && m.geometry).map((m) => m.geometry)
			areas.push({ tags: e.tags, rings: joinRings(parts).map(geom) })
		}
	}

	// 1. Green and water.
	for (const a of areas) {
		const t = a.tags
		if (t.leisure === 'playground') continue
		if (t.leisure === 'pitch') fillRings(a.rings, T.PITCH)
		else if (t.leisure || t.landuse || ['wood', 'scrub', 'grassland'].includes(t.natural)) fillRings(a.rings, T.GRASS)
		else if (t.natural === 'water') fillRings(a.rings, T.WATER)
	}
	for (const a of areas) if (a.tags.leisure === 'playground') fillRings(a.rings, T.PLAYGROUND)
	for (const w of ways) if (w.tags.waterway === 'canal' || w.tags.waterway === 'river') strokeLine(geom(w.geometry), 20, T.WATER)

	// 2. Sidewalks: every road gets a 4 m pavement each side.
	// Driveways and parking aisles are mostly Hinterhof clutter at this scale.
	const roadWays = ways.filter(
		(w) =>
			ROADS[roadClass(w.tags.highway)] && !underground(w.tags) && !w.tags.area && !['driveway', 'parking_aisle'].includes(w.tags.service),
	)
	for (const w of roadWays) {
		strokeLine(geom(w.geometry), ROADS[roadClass(w.tags.highway)] + 8, T.SIDEWALK, { onlyOn: [T.GROUND, T.GRASS] })
	}

	// 3. Pedestrian squares.
	for (const a of areas) if (a.tags.highway === 'pedestrian' && a.tags.area === 'yes') fillRings(a.rings, T.SIDEWALK)

	// 4. Buildings.
	for (const a of areas) if (a.tags.building && !underground(a.tags)) fillRings(a.rings, T.BUILDING)

	// 5. Roads, widest first so junctions look right.
	roadWays.sort((a, b) => ROADS[roadClass(a.tags.highway)] - ROADS[roadClass(b.tags.highway)])
	for (const w of roadWays) {
		let street
		const name = w.tags.name
		if (name) {
			street = streets.indexOf(name)
			if (street < 0) street = streets.push(name) - 1
		}
		strokeLine(geom(w.geometry), ROADS[roadClass(w.tags.highway)], T.ROAD, { street })
	}

	// 6. Paths and cycleways, never through buildings or over roads.
	for (const w of ways) {
		const h = w.tags.highway
		if (!PATHS.includes(h) || underground(w.tags) || w.tags.area) continue
		const type = h === 'cycleway' ? T.CYCLEWAY : T.SIDEWALK
		strokeLine(geom(w.geometry), h === 'cycleway' ? 2.5 : 2, type, { onlyOn: [T.GROUND, T.GRASS, T.PLAYGROUND] })
	}

	// Street name labels: one per long segment, at least 60 m from the last
	// label of the same name.
	const labels = []
	for (const w of roadWays) {
		const name = w.tags.name
		if (!name) continue
		const pts = geom(w.geometry)
		for (let i = 0; i + 1 < pts.length; i++) {
			const a = pts[i]
			const b = pts[i + 1]
			if (Math.hypot(b.x - a.x, b.y - a.y) < name.length * 0.9) continue
			const x = (a.x + b.x) / 2
			const y = (a.y + b.y) / 2
			if (labels.some((l) => l.name === name && Math.hypot(l.x - x, l.y - y) < 60 / tileM)) continue
			let angle = Math.atan2(b.y - a.y, b.x - a.x)
			if (angle > Math.PI / 2) angle -= Math.PI
			if (angle < -Math.PI / 2) angle += Math.PI
			labels.push({ name, x: round(x), y: round(y), angle: Math.round(angle * 1000) / 1000 })
		}
	}

	const pois = []
	for (const e of osm.elements) {
		if (e.type !== 'node' || !e.tags) continue
		const kind = poiKind(e.tags)
		if (!kind) continue
		const { x, y } = toTile(e)
		if (x < 0 || y < 0 || x >= W || y >= H) continue
		pois.push({ kind, name: e.tags.name ?? '', x: round(x), y: round(y) })
	}

	return { w: W, h: H, tileM, bbox, tiles, streetOf, streets, labels, pois }
}

const round = (n) => Math.round(n * 10) / 10

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

// Multipolygon members arrive as loose way pieces; chain them end to end
// into closed rings.
function joinRings(parts) {
	const same = (a, b) => a.lat === b.lat && a.lon === b.lon
	const pool = parts.map((p) => [...p])
	const rings = []
	while (pool.length) {
		const ring = pool.shift()
		let grown = true
		while (!same(ring[0], ring.at(-1)) && grown) {
			grown = false
			for (let i = 0; i < pool.length; i++) {
				const p = pool[i]
				if (same(ring.at(-1), p[0])) ring.push(...p.slice(1))
				else if (same(ring.at(-1), p.at(-1))) ring.push(...p.reverse().slice(1))
				else continue
				pool.splice(i, 1)
				grown = true
				break
			}
		}
		rings.push(ring)
	}
	return rings
}
