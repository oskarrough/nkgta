// Rasterise raw Overpass JSON onto a tile grid. Runs in Bun and the browser.
import polygonClipping from 'polygon-clipping'
import { T } from './tiles.js'
import { createWorld } from './world.js'
import { findShops, packShops } from './shops.js'
import { hospitalDoor } from './hospital.js'
import { findFronts, storefronts } from './fronts.js'
import { carriageway, isSett, kerbGaps, kerbLines, kerbOf } from './kerbs.js'
import { cornerCutter } from './corners.js'

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
	// Kerb to kerb, in metres; see kerbs.js for split streets.
	const widthOf = (t) => carriageway(t, ROADS[roadClass(t.highway)])

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

	function strokeLine(pts, widthM, type, { onlyOn, street, layer = LAYER[type], sett } = {}) {
		shapes.push({ t: type, layer, w: round(widthM / tileM), line: flat(pts), ...(sett && { sett: 1 }) })
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
		const road = widthOf(w.tags)
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
	const corridors = overlapping(passages.map((w) => corridor(geom(w.geometry), PASSAGE_M / tileM / 2)))

	// 4. Buildings, onto the tiles for walking into, and as outlines with a
	// height in metres for the 3D city. Passages are cut out of the outlines,
	// so from above you see the gap you can walk through.
	// Street corners are cut at an angle in 3D; the tiles keep the square
	// corner, a tile or so of building you can't walk into.
	const houses = areas.filter((a) => a.tags.building && !underground(a.tags))
	const cutCorner = cornerCutter(
		roadWays.map((w) => ({ pts: geom(w.geometry), r: ROADS[roadClass(w.tags.highway)] / tileM / 2 })),
		overlapping(houses.map((a) => ({ rings: a.rings, box: bounds(a.rings) }))),
		tileM,
	)
	const buildings = []
	houses.forEach((a, i) => {
		fillRings(a.rings, T.BUILDING)
		// A small building can sit entirely inside a passage and be cut away.
		const m2 = Math.abs(ringArea(a.rings[0])) * tileM * tileM
		const h = buildingHeight(a.tags, m2)
		const rings = cutPassages(cutCorner(a.rings, h, i), corridors)
		if (rings.length) buildings.push({ h, rings: rings.map(flat) })
	})

	// 5. Roads, widest first so junctions look right. Their bike lanes and
	// cobbled middle strips stop where another street comes in.
	roadWays.sort((a, b) => ROADS[roadClass(a.tags.highway)] - ROADS[roadClass(b.tags.highway)])
	const meets = new Map()
	for (const w of roadWays) for (const id of w.nodes ?? []) meets.set(id, [...(meets.get(id) ?? []), w])
	const crossing = (w) => (i) =>
		Math.max(
			0,
			...(meets.get(w.nodes?.[i]) ?? [])
				.filter((o) => o !== w && (!o.tags.name || o.tags.name !== w.tags.name))
				.map((o) => widthOf(o.tags) / tileM),
		)
	for (const w of roadWays) {
		let street
		const name = w.tags.name
		if (name) {
			street = streets.indexOf(name)
			if (street < 0) street = streets.push(name) - 1
		}
		const pts = geom(w.geometry)
		strokeLine(pts, widthOf(w.tags), T.ROAD, { street, sett: isSett(w.tags) })
		shapes.push(...kerbLines(pts, w.tags, widthOf(w.tags) / tileM, crossing(w)))
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
		const wide = round(ROADS[roadClass(t.highway)] / tileM)
		roads.push({ w: wide, oneway, nodes, ...kerbOf(t, wide, round(widthOf(t) / tileM)) })
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
	const addPoi = (kind, name, x, y, extra) => {
		if (x < 0 || y < 0 || x >= W || y >= H) return
		pois.push({ kind, name, x: round(x), y: round(y), ...extra })
	}
	for (const e of osm.elements) {
		if (e.type !== 'node' || !e.tags) continue
		const kind = poiKind(e.tags)
		if (!kind) continue
		const { x, y } = toTile(e)
		addPoi(kind, e.tags.name ?? '', x, y)
	}
	// A hospital is usually a campus outline, not a node. Put its place on
	// the pavement at the edge, so getting wasted leaves you at the door.
	for (const a of areas) {
		if (poiKind(a.tags) !== 'hospital') continue
		const ring = a.rings[0]
		const door = hospitalDoor(ring, (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.BUILDING : tiles[(y | 0) * W + (x | 0)]))
		if (!door) continue
		if (pois.some((p) => p.kind === 'hospital' && Math.hypot(p.x - door.x, p.y - door.y) < 30)) continue
		addPoi('hospital', a.tags.name ?? '', door.x, door.y, { dir: Math.round(door.dir * 1000) / 1000 })
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

	// Street trees, decoration only: nothing on the tile grid, so you walk and
	// drive through them. Rows are spaced about 8 m along the way.
	const trees = []
	const addTree = (tags, seed, x, y) => {
		if (x < 0 || y < 0 || x >= W || y >= H) return
		const { crown, top } = treeSize(tags, seed)
		trees.push({ x: round(x), y: round(y), crown, top })
	}
	for (const e of osm.elements) {
		if (e.type !== 'node' || e.tags?.natural !== 'tree') continue
		const { x, y } = toTile(e)
		addTree(e.tags, e.id, x, y)
	}
	const rowStep = 8 / tileM
	for (const e of osm.elements) {
		if (e.type !== 'way' || e.tags?.natural !== 'tree_row' || !e.geometry) continue
		const pts = geom(e.geometry)
		let n = 0
		for (let i = 0; i + 1 < pts.length; i++) {
			const a = pts[i]
			const b = pts[i + 1]
			const len = Math.hypot(b.x - a.x, b.y - a.y)
			if (!len) continue
			for (let d = 0; d < len; d += rowStep) addTree(e.tags, e.id * 31 + n++, a.x + ((b.x - a.x) * d) / len, a.y + ((b.y - a.y) * d) / len)
		}
		const end = pts.at(-1)
		addTree(e.tags, e.id * 31 + n, end.x, end.y)
	}

	// Where the kerb stops for a driveway or a crossing, and the street lamps
	// OSM knows, if the data has them.
	const tileAt = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? tiles[(y | 0) * W + (x | 0)] : T.GROUND)
	const atKerb = ({ x, y }) => [-1.5, 0, 1.5].some((dx) => [-1.5, 0, 1.5].some((dy) => tileAt(x + dx, y + dy) === T.ROAD))
	const gaps = kerbGaps(ways, toTile, atKerb)
	const lamps = osm.elements
		.filter((e) => e.type === 'node' && e.tags?.highway === 'street_lamp')
		.map(toTile)
		.filter((p) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H)
		.flatMap((p) => [round(p.x), round(p.y)])

	// Murals, painted on the nearest blank wall: where, how wide if it's
	// mapped as a line along the wall, and roughly what of.
	const murals = []
	for (const e of osm.elements) {
		const t = e.tags
		if (t?.tourism !== 'artwork' || t.artwork_type !== 'mural') continue
		const pts = e.type === 'node' ? [toTile(e)] : e.geometry ? geom(e.geometry) : []
		if (!pts.length) continue
		const x = pts.reduce((s, p) => s + p.x, 0) / pts.length
		const y = pts.reduce((s, p) => s + p.y, 0) / pts.length
		if (x < 0 || y < 0 || x >= W || y >= H) continue
		const w = pts.length > 1 ? Math.hypot(pts.at(-1).x - pts[0].x, pts.at(-1).y - pts[0].y) : 0
		murals.push({ x: round(x), y: round(y), w: round(w), seed: e.id % 100003, of: muralSubject(t) })
	}

	shapes.sort((a, b) => a.layer - b.layer)
	const map = { w: W, h: H, tileM, bbox, shapes, buildings, tiles, streetOf, streets, labels, pois, transit, trees, murals }
	// Where the doors are depends only on the map, so it's worked out here, once.
	const world = createWorld(map)
	return {
		...map,
		roadNodes,
		roads,
		signals,
		kerbGaps: gaps,
		lamps,
		shops: packShops(findShops(world), pois),
		fronts: findFronts(world, storefronts(osm, toTile, W, H)),
	}
}

const round = (n) => Math.round(n * 10) / 10

// Stable noise per tree, so sizes and shapes don't change between loads.
const treeHash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007

// Crown diameter and top height in metres: from the tags where they exist,
// otherwise a default with a little stable variation.
function treeSize(tags, seed) {
	const num = (k) => {
		const v = parseFloat(tags?.[k])
		return Number.isFinite(v) ? v : null
	}
	const h = num('height')
	const circumference = num('circumference')
	const crownTag = num('diameter_crown')
	const r = treeHash(seed)
	const crown = Math.min(13, Math.max(3.5, crownTag ?? (circumference != null ? 3 + circumference * 4 : 5 + r * 2.5)))
	const top = Math.min(16, Math.max(6, h ?? crown * 1.4 + 2 + r * 2))
	return { crown: round(crown), top: round(top) }
}

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

// A lookup of the items whose box overlaps a rectangle, in their order.
// Items are filed in a grid first, so each lookup only sees its neighbours.
function overlapping(items, size = 32) {
	const cells = new Map()
	items.forEach(({ box }, i) => {
		for (let y = Math.floor(box[1] / size); y <= Math.floor(box[3] / size); y++) {
			for (let x = Math.floor(box[0] / size); x <= Math.floor(box[2] / size); x++) {
				const key = y * 65536 + x
				if (!cells.has(key)) cells.set(key, [])
				cells.get(key).push(i)
			}
		}
	})
	return (x0, y0, x1, y1) => {
		const near = new Set()
		for (let y = Math.floor(y0 / size); y <= Math.floor(y1 / size); y++) {
			for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++) for (const i of cells.get(y * 65536 + x) ?? []) near.add(i)
		}
		return [...near]
			.sort((a, b) => a - b)
			.map((i) => items[i])
			.filter(({ box }) => box[0] < x1 && box[2] > x0 && box[1] < y1 && box[3] > y0)
	}
}

function bounds(rings) {
	const xs = rings.flat().map((p) => p.x)
	const ys = rings.flat().map((p) => p.y)
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// Building rings minus any corridors crossing them, `corridors(x0, y0, x1,
// y1)` being those whose box overlaps. Rings are even-odd, so courtyards stay holes.
function cutPassages(rings, corridors) {
	const hits = corridors(...bounds(rings))
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
// when OSM doesn't say; sheds, garages and anything with a footprint smaller
// than a flat (a container café, a kiosk on a square) get one storey. Altbau
// storeys are high, the ground floor with its shops higher still; the wall
// shader draws its windows to the same storeys.
export const STOREY = { ground: 4.4, upper: 3.6 }
const LOW = ['garage', 'garages', 'shed', 'hut', 'kiosk', 'roof', 'carport', 'container', 'toilets']
const SMALL_M2 = 50
function buildingHeight(t, m2 = Infinity) {
	const h = parseFloat(t.height)
	if (h > 0) return Math.min(255, Math.round(h))
	const low = LOW.includes(t.building) || m2 < SMALL_M2
	const levels = parseFloat(t['building:levels']) || (low ? 1 : 5)
	const walls = low ? levels * 3 : STOREY.ground + Math.max(0, levels - 1) * STOREY.upper
	return Math.min(255, Math.round(walls + (parseFloat(t['roof:levels']) || 0) * 2.5 + 1))
}

function ringArea(pts) {
	let a = 0
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i]
		const q = pts[(i + 1) % pts.length]
		a += p.x * q.y - q.x * p.y
	}
	return a / 2
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
	if (t.amenity === 'hospital') return 'hospital'
	if (t.amenity === 'school') return 'school'
	if (t.amenity === 'kindergarten') return 'kita'
	if (t.leisure === 'playground') return 'playground'
	return null
}

// What a mural shows, as far as its tags say: faces, animals, plants and
// landscapes, or bold shapes; '' if the tags don't say.
function muralSubject(t) {
	const about = [t['artwork:subject'], t.artwork_subject, t.subject, t.name, t.description].join(' ').toLowerCase()
	if (/portrait|person|people|face|frau|mann|kind|woman|man|girl|boy|child|gesicht/.test(about)) return 'face'
	if (/animal|tier|bird|vogel|fish|fisch|cat|katze|dog|hund|bear|bär|fox|fuchs/.test(about)) return 'creature'
	if (/nature|natur|landscape|landschaft|flower|blume|plant|pflanze|\btrees?\b|baum|sea|meer|sky|himmel|garden|garten/.test(about))
		return 'garden'
	if (/abstract|pattern|muster|geometr/.test(about)) return 'shapes'
	return ''
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
