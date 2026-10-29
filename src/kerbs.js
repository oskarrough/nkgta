// Kerbs like Berlin's: what OSM says lines each side of a street, and where
// that puts parked cars, bike lanes, cobbles, bollards and lamps. The first
// half runs when the map is built, in Bun or the browser; the rest in the
// game. Sides are left and right of the way as OSM draws it.
import { offsetLine, pointAt } from './roads.js'
import { SOLID, T } from './tiles.js'

// How cars park along one side of a road, as stored per road: [left, right].
export const PARK = { unknown: 0, none: 1, parallel: 2, diagonal: 3, perpendicular: 4 }
const PARKS = ['lane', 'street_side', 'on_kerb', 'half_on_kerb', 'shoulder', 'separate', 'yes', 'parallel', 'diagonal', 'perpendicular']
const NO_PARKING = ['no', 'no_parking', 'no_stopping', 'fire_lane', 'none']
const BIKE = { none: 0, lane: 1, track: 2 }
const SETTS = ['sett', 'cobblestone', 'unhewn_cobblestone']

// Sizes in metres, kerb to kerb; the painted ones in tiles.
const LANE_M = 3.25 // a traffic lane on a split street
const BIKE_LANE_M = 1.6
const PARKING_M = 2.2
const SPLIT_MIN_M = 5.5
const BIKE_LANE = 0.5 // green paint, tiles wide
const BIKE_GAP = 0.12 // from the kerb, or from the parked cars
const PARKED = 0.7 // tiles of road a row of parked cars takes
const TRACK = 0.55 // red cycle track on the pavement, tiles wide
const MEDIAN = 0.6 // cobbled strip between the halves of a split street, tiles wide

const tag = (t, key, side, rest = '') => t[`${key}:${side}${rest}`] ?? t[`${key}:both${rest}`]
const isOneway = (t) => ['yes', 'true', '1', '-1'].includes(t.oneway) || t.junction === 'roundabout'

function parking(t, side) {
	const v = tag(t, 'parking', side) ?? tag(t, 'parking:lane', side)
	if (!v) return PARK.unknown
	if (NO_PARKING.includes(v) || NO_PARKING.includes(tag(t, 'parking', side, ':restriction'))) return PARK.none
	if (!PARKS.includes(v)) return PARK.unknown
	const o = tag(t, 'parking', side, ':orientation') ?? v
	return o === 'diagonal' ? PARK.diagonal : o === 'perpendicular' ? PARK.perpendicular : PARK.parallel
}

function bike(t, side) {
	const v = tag(t, 'cycleway', side) ?? (side === 'right' || !isOneway(t) ? t.cycleway : undefined)
	return ['lane', 'opposite_lane'].includes(v) ? BIKE.lane : ['track', 'opposite_track'].includes(v) ? BIKE.track : BIKE.none
}

// Split streets come as one way per direction, each tagged with the whole
// street's class. Kerb to kerb, each is only as wide as its lanes, bike lane
// and parking, which leaves the middle strip between them.
export function carriageway(t, m) {
	if (t.dual_carriageway !== 'yes' || !isOneway(t)) return m
	let width = (Number(t.lanes) || 1) * LANE_M + 0.6
	for (const side of ['left', 'right']) {
		if (bike(t, side) === BIKE.lane) width += BIKE_LANE_M
		if (parking(t, side) >= PARK.parallel) width += PARKING_M
	}
	return Math.min(m, Math.max(SPLIT_MIN_M, width))
}

// What a traffic road keeps of its kerbs: how cars park along each side, and
// its width kerb to kerb if that's not its class's.
export function kerbOf(t, w, kw) {
	const park = [parking(t, 'left'), parking(t, 'right')]
	return { ...(park.some(Boolean) && { park }), ...(kw !== w && { kw }) }
}

const round = (n) => Math.round(n * 10) / 10
const flat = (pts) => pts.flatMap((p) => [round(p.x), round(p.y)])

// The painted kerb lines of one road, `w` tiles wide: green bike lanes on the
// tarmac, red cycle tracks on the pavement and a cobbled strip down the
// middle of a split street, each stopping short of the junctions, where
// `cross(i)` is how wide the widest other road at point i is, if any.
export function kerbLines(pts, t, w, cross) {
	const out = []
	// Under the roads, so the tarmac covers it wherever the halves meet.
	if (t.dual_carriageway === 'yes')
		out.push(...cut(pts, -(w / 2 + MEDIAN / 2 + 0.15), cross, 0).map((line) => ({ t: 'sett', layer: 6, w: MEDIAN, line })))
	for (const [sign, side] of [
		[-1, 'left'],
		[1, 'right'],
	]) {
		const b = bike(t, side)
		if (!b) continue
		const parked = parking(t, side) >= PARK.parallel ? PARKED : 0
		const off = b === BIKE.track ? w / 2 + 0.3 + TRACK / 2 : w / 2 - BIKE_GAP - parked - BIKE_LANE / 2
		const kind = b === BIKE.track ? { t: 'track', w: TRACK } : { t: 'bike', w: BIKE_LANE }
		for (const line of cut(pts, sign * off, cross, 0.3)) out.push({ ...kind, layer: 8, line })
	}
	return out
}

function cut(pts, off, cross, pad) {
	const line = offsetLine(pts, off)
	const gaps = []
	pts.forEach((_, i) => {
		const w = cross(i)
		if (w) gaps.push([line[i].s - w / 2 - pad, line[i].s + w / 2 + pad])
	})
	const pieces = []
	let from = 0
	for (const [a, b] of [...gaps, [Infinity, Infinity]]) {
		const to = Math.min(a, line.at(-1).s)
		if (to - from > 0.5) pieces.push(flat(stretch(line, from, to)))
		from = Math.max(from, b)
	}
	return pieces
}

function stretch(line, a, b) {
	const out = [pointAt(line, a)]
	for (const p of line) if (p.s > a && p.s < b) out.push(p)
	out.push(pointAt(line, b))
	return out
}

export const isSett = (t) => SETTS.includes(t.surface)

// Where cars mustn't park and bollards and lamps mustn't stand: driveways,
// passages into the Höfe, paths and crossings, where they reach the street.
// `atKerb(p)` says whether a point is at the edge of a road, in tiles; points
// come once per tile.
export function kerbGaps(ways, toTile, atKerb) {
	const gaps = new Map()
	for (const w of ways) {
		const t = w.tags
		const way = t.highway === 'service' || (['footway', 'path', 'cycleway', 'pedestrian'].includes(t.highway) && t.footway !== 'sidewalk')
		if (!way || !w.geometry || t.area) continue
		for (const end of [w.geometry[0], w.geometry.at(-1)]) {
			const p = toTile(end)
			if (atKerb(p)) gaps.set(Math.floor(p.x) * 65536 + Math.floor(p.y), [round(p.x), round(p.y)])
		}
	}
	return [...gaps.values()].flat()
}

const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007
const seedAt = (x, y) => Math.round(x * 10) * 7919 + Math.round(y * 10) * 104729

export function pointsGrid(points, cell = 4) {
	const cells = new Map()
	const key = (x, y) => Math.floor(x / cell) * 65536 + Math.floor(y / cell)
	for (const p of points) {
		const k = key(p.x, p.y)
		if (!cells.has(k)) cells.set(k, [])
		cells.get(k).push(p)
	}
	return {
		near(x, y, r) {
			for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
				for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++) {
					for (const p of cells.get(cx * 65536 + cy) ?? []) if (Math.hypot(p.x - x, p.y - y) < r) return p
				}
			}
			return null
		},
		each(x, y, r, fn) {
			for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
				for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++) {
					for (const p of cells.get(cx * 65536 + cy) ?? []) {
						const d = Math.hypot(p.x - x, p.y - y)
						if (d < r) fn(p, d)
					}
				}
			}
		},
	}
}

const pairs = (xy = []) => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2], y: xy[i * 2 + 1] }))

export function noParking(world) {
	const gaps = pointsGrid(pairs(world.kerbGaps))
	const lights = pointsGrid(pairs(world.signals))
	const stops = pointsGrid((world.transit ?? []).filter((t) => t.kind === 'bus'))
	return (x, y) => gaps.near(x, y, 1.3) || lights.near(x, y, 2.5) || stops.near(x, y, 4)
}

// Tiles between parked cars, and how far into the road their middles stand
// beyond the kerb (or short of it), by how they park.
const SPOT = {
	[PARK.parallel]: { step: 2, turn: 0 },
	[PARK.diagonal]: { step: 1.15, turn: Math.PI / 3, out: 0.35 },
	[PARK.perpendicular]: { step: 0.95, turn: Math.PI / 2, out: 0.4 },
}
// Share of spots taken: nearly all where OSM marks a parking lane, a few
// where it doesn't say, more in side streets than on the big roads.
const FILL = { lane: 0.85, side: 0.3, main: 0.08 }

// The spots for parked cars along a lane's kerb, and along the left one too on
// a one-way street: { x, y, angle, seed }. Each is the same every time, taken
// or not by its place in town, clear of junctions and of `blocked(x, y)`.
export function parkingSpots(edge, blocked, mainRoad) {
	const spots = []
	const r = edge.road
	if (!r) return spots
	const w = edge.w
	for (const side of r.oneway ? [1, -1] : [1]) {
		const code = r.park?.[side > 0 === edge.forward ? 1 : 0] ?? PARK.unknown
		if (code === PARK.none) continue
		const kind = code === PARK.unknown ? PARK.parallel : code
		const fill = code !== PARK.unknown ? FILL.lane : edge.rank >= mainRoad ? FILL.main : FILL.side
		const { step, turn, out } = SPOT[kind]
		const off = out ? w / 2 + out : Math.max(w / 2 - 0.1, r.oneway ? 0.85 : w / 4 + 0.85)
		const line = offsetLine(edge.centre, side * off)
		const len = line.at(-1).s
		const a = clearance(edge.from)
		const b = clearance(edge.to)
		const n = Math.floor((len - a - b) / step)
		for (let i = 0; i < n; i++) {
			const p = pointAt(line, a + (len - a - b - n * step) / 2 + (i + 0.5) * step)
			const seed = seedAt(p.x, p.y)
			if (hash(seed) > fill || blocked(p.x, p.y)) continue
			spots.push({ x: p.x, y: p.y, angle: p.dir + side * turn, seed })
		}
	}
	return spots
}

// How far from a node parked cars keep: five metres past the crossing road's
// kerb at a junction, a little at a bend or a dead end.
function clearance(node) {
	const roads = new Set([...node.out.map((e) => e.to), ...node.in.map((e) => e.from)])
	if (roads.size < 3) return 0.4
	return Math.max(...node.out.map((e) => e.w), ...node.in.map((e) => e.w)) / 2 + 1.7
}

export function standsClear(world, x, y, angle, model) {
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	for (const [u, v] of [
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1],
	]) {
		const lx = (u * model.length) / 2
		const ly = (v * model.width) / 2
		if (SOLID.has(world.tileAt(x + lx * cos - ly * sin, y + lx * sin + ly * cos))) return false
	}
	return true
}

export const spotHash = (seed, k) => hash(seed * 31 + k)

// Lamps and bollards along the pavement edge of every street, in a box of
// the map: lamps as { x, y, angle, main } with the angle towards the road,
// bollards as { x, y }. Lamps every so often by the road's class, both sides
// staggered, unless OSM maps real ones nearby; bollards along the big roads
// where nobody parks. Nothing in a junction, a driveway or a tree.
const LAMP = { main: 11, side: 9, inset: 0.45 } // tiles apart, and in from the kerb
const BOLLARD = { step: 1.6, inset: 0.3, road: 5 } // and only along roads this wide by class
export function furnitureIn(world, box, mainRoad) {
	const { roads = [], roadNodes } = world
	const lamps = []
	const bollards = []
	if (!roadNodes) return { lamps, bollards }
	const inBox = (p) => p.x >= box.x && p.y >= box.y && p.x < box.x + box.w && p.y < box.y + box.h
	const gaps = pointsGrid(pairs(world.kerbGaps))
	const trees = pointsGrid(world.trees ?? [])
	const mapped = pairs(world.lamps).filter(inBox)
	const osm = pointsGrid(mapped)
	const pavement = (p) => [T.SIDEWALK, T.GROUND].includes(world.tileAt(p.x, p.y))
	const free = (p, r) => pavement(p) && !gaps.near(p.x, p.y, r) && !trees.near(p.x, p.y, r)
	const pad = 12
	// OSM's own lamps, turned to the nearest road within reach.
	const claimed = mapped.map((p) => ({ ...p, angle: 0, main: false, d: 6 }))
	for (const r of roads) {
		const pts = r.nodes.map((n) => ({ x: roadNodes[n * 2], y: roadNodes[n * 2 + 1] }))
		if (!pts.some((p) => p.x > box.x - pad && p.y > box.y - pad && p.x < box.x + box.w + pad && p.y < box.y + box.h + pad)) continue
		const w = r.kw ?? r.w
		const main = r.w >= mainRoad
		for (const lamp of claimed) {
			const near = nearestOn(pts, lamp)
			if (near.d - w / 2 < lamp.d) Object.assign(lamp, { d: near.d - w / 2, main, angle: Math.atan2(near.y - lamp.y, near.x - lamp.x) })
		}
		for (const side of [1, -1]) {
			const kerb = offsetLine(pts, side * (w / 2 + LAMP.inset))
			const len = kerb.at(-1).s
			const step = main ? LAMP.main : LAMP.side
			for (let s = side > 0 ? step / 2 : step; s < len; s += step) {
				const p = pointAt(kerb, s)
				if (!inBox(p) || !free(p, 0.8) || osm.near(p.x, p.y, step * 0.6)) continue
				lamps.push({ x: p.x, y: p.y, angle: p.dir - (side * Math.PI) / 2, main })
			}
			const park = r.park?.[side > 0 ? 1 : 0] ?? PARK.unknown
			if (r.w < BOLLARD.road || park >= PARK.parallel) continue
			const edge = offsetLine(pts, side * (w / 2 + BOLLARD.inset))
			for (let s = BOLLARD.step / 2; s < edge.at(-1).s; s += BOLLARD.step) {
				const p = pointAt(edge, s)
				if (inBox(p) && free(p, 0.5)) bollards.push({ x: p.x, y: p.y })
			}
		}
	}
	for (const lamp of claimed) lamps.push(lamp)
	return { lamps, bollards }
}

function nearestOn(pts, p) {
	let best = { x: pts[0].x, y: pts[0].y, d: Infinity }
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1]
		const b = pts[i]
		const dx = b.x - a.x
		const dy = b.y - a.y
		const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
		const x = a.x + dx * t
		const y = a.y + dy * t
		const d = Math.hypot(x - p.x, y - p.y)
		if (d < best.d) best = { x, y, d }
	}
	return best
}
