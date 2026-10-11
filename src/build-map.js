// Rasterise raw Overpass JSON onto a tile grid. Runs in Bun and the browser.
import polygonClipping from 'polygon-clipping'
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
// Passages are at least 1.5 tiles wide, so diagonal ones don't come out as a
// chain of corner-touching tiles you can't walk along.
const PASSAGE_M = 4.5
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
	// The same areas and lines as drawn shapes, for a smooth ground texture.
	// The tiles stay the truth for walking; these are just for looking at.
	const shapes = []
	const flat = (pts) => pts.flatMap((p) => [round(p.x), round(p.y)])

	// Even-odd scanline fill, so inner rings (courtyards) stay holes.
	function fillRings(rings, type, onlyOn) {
		// Buildings stand on top in 3D; their footprints needn't be drawn.
		if (type !== T.BUILDING) shapes.push({ t: type, layer: LAYER[type], rings: rings.map(flat) })
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
					if (onlyOn && !onlyOn.includes(tiles[i])) continue
					tiles[i] = type
				}
			}
		}
	}

	function strokeLine(pts, widthM, type, { onlyOn, street, layer = LAYER[type] } = {}) {
		shapes.push({ t: type, layer, w: round(widthM / tileM), line: flat(pts) })
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
	const isPassage = (t) => t.tunnel === 'building_passage'
	const isPrivate = (t) => ['private', 'no', 'customers'].includes(t.access)
	// A passage at layer -1 is a ramp down into one, still at street level here.
	const underground = (t) => t.tunnel === 'yes' || (Number(t.layer) < 0 && !isPassage(t) && !t.covered) || t.indoor

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

	// 2. Sidewalks: up to 10 m each side of every road, as far as the façades,
	// which come later and stand on top. Into parks only 4 m.
	// Driveways and parking aisles are mostly Hinterhof clutter at this scale.
	const roadWays = ways.filter(
		(w) =>
			ROADS[roadClass(w.tags.highway)] && !underground(w.tags) && !w.tags.area && !['driveway', 'parking_aisle'].includes(w.tags.service),
	)
	for (const w of roadWays) {
		const pts = geom(w.geometry)
		const road = ROADS[roadClass(w.tags.highway)]
		strokeLine(pts, road + 20, T.SIDEWALK, { onlyOn: [T.GROUND], layer: -1 })
		strokeLine(pts, road + 8, T.SIDEWALK, { onlyOn: [T.GROUND, T.GRASS] })
	}

	// 3. Pedestrian squares.
	for (const a of areas) if (a.tags.highway === 'pedestrian' && a.tags.area === 'yes') fillRings(a.rings, T.SIDEWALK)

	// Passages through buildings: paths, and driveways into a Hof.
	const passages = ways.filter((w) => {
		const t = w.tags
		return isPassage(t) && (PATHS.includes(t.highway) || t.highway === 'service') && !underground(t) && !t.area
	})
	const corridors = passages.map((w) => corridor(geom(w.geometry), PASSAGE_M / tileM / 2))

	// 4. Buildings, onto the tiles for walking into, and as outlines with a
	// height in metres for the 3D city. Passages are cut out of the outlines,
	// so from above you see the gap you can walk through.
	const buildings = []
	for (const a of areas) {
		if (!a.tags.building || underground(a.tags)) continue
		fillRings(a.rings, T.BUILDING)
		const rings = cutPassages(a.rings, corridors)
		// A small building can sit entirely inside a passage and be cut away.
		if (rings.length) buildings.push({ h: buildingHeight(a.tags), rings: rings.map(flat) })
	}

	// 5. Roads, widest first so junctions look right.
	roadWays.sort((a, b) => ROADS[roadClass(a.tags.highway)] - ROADS[roadClass(b.tags.highway)])
	for (const w of roadWays) {
		let street
		const name = w.tags.name
		if (name) {
			street = streets.indexOf(name)
			if (street < 0) street = streets.push(name) - 1
		}
		const pts = geom(w.geometry)
		strokeLine(pts, ROADS[roadClass(w.tags.highway)], T.ROAD, { street })
		// Dashed centre line on the bigger two-way roads. Split carriageways
		// come as two one-way roads and get none.
		if (ROADS[roadClass(w.tags.highway)] >= 12 && w.tags.oneway !== 'yes') shapes.push({ t: 'mark', layer: 9, w: 0.1, line: flat(pts) })
	}

	// 6. Paths and cycleways, never over roads, and through buildings only
	// where a passage runs under them, like the Kino-Passage off
	// Karl-Marx-Straße or a Tordurchfahrt into a Hof. Private ones are
	// walkable too, just marked as such.
	for (const w of passages) {
		strokeLine(geom(w.geometry), PASSAGE_M, isPrivate(w.tags) ? T.PRIVATE : T.SIDEWALK, {
			onlyOn: [T.GROUND, T.GRASS, T.PLAYGROUND, T.BUILDING],
			layer: 8,
		})
	}
	for (const w of ways) {
		const t = w.tags
		const h = t.highway
		if (!PATHS.includes(h) || isPassage(t) || underground(t) || t.area) continue
		const type = isPrivate(t) ? T.PRIVATE : h === 'cycleway' ? T.CYCLEWAY : T.SIDEWALK
		strokeLine(geom(w.geometry), h === 'cycleway' ? 2.5 : 2, type, { onlyOn: [T.GROUND, T.GRASS, T.PLAYGROUND], layer: 5 })
	}

	// The network traffic drives on: every road's nodes, shared where roads
	// meet. Service roads lead into Höfe and car parks, so traffic stays out.
	const roadNodes = []
	const nodeIndex = new Map()
	const roads = []
	for (const w of roadWays) {
		const t = w.tags
		if (roadClass(t.highway) === 'service' || isPrivate(t) || !w.nodes) continue
		const nodes = w.nodes.map((id, i) => {
			if (!nodeIndex.has(id)) {
				const p = toTile(w.geometry[i])
				nodeIndex.set(id, roadNodes.push(round(p.x), round(p.y)) / 2 - 1)
			}
			return nodeIndex.get(id)
		})
		const oneway = ['yes', 'true', '1'].includes(t.oneway) || t.junction === 'roundabout' ? 1 : t.oneway === '-1' ? -1 : 0
		roads.push({ w: round(ROADS[roadClass(t.highway)] / tileM), oneway, nodes })
	}

	// Traffic lights, as points: OSM puts them at the junction or at each stop line.
	const signals = osm.elements
		.filter((e) => e.type === 'node' && e.tags?.highway === 'traffic_signals')
		.flatMap((e) => Object.values(toTile(e)).map(round))

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

	// U-Bahn entrances and bus stops. Entrances rarely carry a name, so they
	// borrow the nearest station's.
	const stations = osm.elements.filter((e) => e.type === 'node' && e.tags?.railway === 'station' && e.tags.station === 'subway')
	// Line numbers per stop name, from the route relations through its stops.
	const nodeName = new Map(osm.elements.filter((e) => e.type === 'node' && e.tags?.name).map((e) => [e.id, e.tags.name]))
	const linesAt = {}
	for (const e of osm.elements) {
		if (e.type !== 'relation' || !['bus', 'subway'].includes(e.tags?.route) || !e.tags.ref) continue
		for (const m of e.members) {
			const name = m.type === 'node' && nodeName.get(m.ref)
			if (name) (linesAt[`${e.tags.route}:${name}`] ??= new Set()).add(e.tags.ref)
		}
	}
	const transit = []
	const seen = new Set()
	for (const e of osm.elements) {
		// Poles that are also stop positions come back twice.
		if (e.type !== 'node' || !e.tags || seen.has(e.id)) continue
		seen.add(e.id)
		const t = e.tags
		let kind
		if (t.railway === 'subway_entrance') kind = 'ubahn'
		else if (t.highway === 'bus_stop') kind = 'bus'
		else continue
		const { x, y } = toTile(e)
		if (x < 0 || y < 0 || x >= W || y >= H) continue
		let name = t.name ?? ''
		if (kind === 'ubahn' && !name) {
			const s = nearest(stations, e)
			if (s && Math.hypot(s.lat - e.lat, s.lon - e.lon) < 0.003) name = s.tags.name
		}
		const lines = [...(linesAt[`${kind === 'ubahn' ? 'subway' : 'bus'}:${name}`] ?? [])].sort((a, b) =>
			a.localeCompare(b, 'de', { numeric: true }),
		)
		transit.push({ kind, name, lines, x: round(x), y: round(y) })
	}

	shapes.sort((a, b) => a.layer - b.layer)
	return { w: W, h: H, tileM, bbox, shapes, buildings, tiles, streetOf, streets, labels, pois, transit, roadNodes, roads, signals }
}

const round = (n) => Math.round(n * 10) / 10

// A path widened to radius r: a box along each segment and an octagon at
// each bend, as polygons for clipping.
function corridor(pts, r) {
	const polys = []
	for (let i = 0; i + 1 < pts.length; i++) {
		const a = pts[i]
		const b = pts[i + 1]
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
		const nx = (-(b.y - a.y) / len) * r
		const ny = ((b.x - a.x) / len) * r
		polys.push([
			[
				[a.x + nx, a.y + ny],
				[b.x + nx, b.y + ny],
				[b.x - nx, b.y - ny],
				[a.x - nx, a.y - ny],
				[a.x + nx, a.y + ny],
			],
		])
	}
	for (const p of pts) {
		const ring = []
		for (let k = 0; k <= 8; k++) ring.push([p.x + r * Math.cos((k * Math.PI) / 4), p.y + r * Math.sin((k * Math.PI) / 4)])
		polys.push([ring])
	}
	const xs = pts.map((p) => p.x)
	const ys = pts.map((p) => p.y)
	return { polys, box: [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r] }
}

// Building rings minus any corridors crossing them. Rings are even-odd, so
// courtyards stay holes.
function cutPassages(rings, corridors) {
	const xs = rings.flat().map((p) => p.x)
	const ys = rings.flat().map((p) => p.y)
	const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
	const hits = corridors.filter(({ box }) => box[0] < x1 && box[2] > x0 && box[1] < y1 && box[3] > y0)
	if (!hits.length) return rings
	const area = polygonClipping.xor(...rings.map((r) => [r.map((p) => [p.x, p.y])]))
	const cut = polygonClipping.difference(area, ...hits.flatMap((c) => c.polys))
	return cut.flat().map((ring) => ring.map(([x, y]) => ({ x, y })))
}

// Drawing order of the smooth ground: paths under buildings, roads over
// pavements, passages over everything.
const LAYER = {
	[T.GRASS]: 0,
	[T.PITCH]: 0,
	[T.WATER]: 1,
	[T.PLAYGROUND]: 2,
	[T.SIDEWALK]: 3,
	[T.CYCLEWAY]: 5,
	[T.PRIVATE]: 5,
	[T.ROAD]: 7,
}
const nearest = (nodes, p) =>
	nodes.reduce(
		(best, n) => (!best || Math.hypot(n.lat - p.lat, n.lon - p.lon) < Math.hypot(best.lat - p.lat, best.lon - p.lon) ? n : best),
		null,
	)

// Metres tall. Most of Neukölln is five-storey Altbau, so that's the guess
// when OSM doesn't say; sheds and garages get one storey.
const LOW = ['garage', 'garages', 'shed', 'hut', 'kiosk', 'roof', 'carport', 'container', 'toilets']
function buildingHeight(t) {
	const h = parseFloat(t.height)
	if (h > 0) return Math.min(255, Math.round(h))
	const levels = parseFloat(t['building:levels']) || (LOW.includes(t.building) ? 1 : 5)
	return Math.min(255, Math.round(levels * 3.2 + (parseFloat(t['roof:levels']) || 0) * 2.5 + 1))
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
