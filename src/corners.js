// Berlin corner houses have their corner cut off at an angle, the
// Eckabschrägung, usually with the Späti or the Eckkneipe in it. OSM mostly
// maps the corner square, so where a tall house stands on a street corner,
// cut it: a short slanted wall between its two street fronts. Runs in Bun
// and the browser, on outlines in tiles.

const CUT_M = [2.1, 2.9] // how far back along each front the slant starts, metres
const MIN_H = 10 // metres: sheds and kiosks keep their corners
const FRONT_M = 7 // each front at least this long, metres
const ANGLE = [65, 115] // degrees inside the corner
const STREET_M = 9 // a front faces a street if a road's kerb is this close, metres

// `roads` are [{ pts: [{x, y}], r }] with r half the road's width, `others(x0,
// y0, x1, y1)` the buildings ({ rings }) near a box. Gives a function that
// takes one building's rings and returns them with its street corners cut.
export function cornerCutter(roads, others, tileM) {
	const segs = []
	for (const { pts, r } of roads) {
		for (let i = 0; i + 1 < pts.length; i++) {
			const a = pts[i]
			const b = pts[i + 1]
			const reach = r + STREET_M / tileM
			segs.push({
				a,
				b,
				reach,
				box: [Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach, Math.max(a.x, b.x) + reach, Math.max(a.y, b.y) + reach],
			})
		}
	}
	const near = grid(segs)
	const onStreet = (p) => near(p.x, p.y).some((s) => distance(p, s.a, s.b) < s.reach)

	return function cut(rings, h, seed) {
		if (h < MIN_H) return rings
		const min = FRONT_M / tileM
		const back = (CUT_M[0] + (CUT_M[1] - CUT_M[0]) * hash(seed)) / tileM
		const self = (p) => insideRings(p, rings)
		const box = bounds(rings)
		const neighbours = others(box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2).filter((o) => o.rings !== rings)
		const taken = (p) => neighbours.some((o) => insideRings(p, o.rings))
		return rings.map((ring) => {
			const closed = ring.length > 2 && ring[0].x === ring.at(-1).x && ring[0].y === ring.at(-1).y
			const pts = closed ? ring.slice(0, -1) : ring
			if (pts.length < 4) return ring
			const out = []
			pts.forEach((v, i) => {
				const p = pts[(i + pts.length - 1) % pts.length]
				const n = pts[(i + 1) % pts.length]
				const lp = Math.hypot(p.x - v.x, p.y - v.y)
				const ln = Math.hypot(n.x - v.x, n.y - v.y)
				if (lp < min || ln < min) return out.push(v)
				const up = { x: (p.x - v.x) / lp, y: (p.y - v.y) / lp }
				const un = { x: (n.x - v.x) / ln, y: (n.y - v.y) / ln }
				const angle = (Math.acos(Math.max(-1, Math.min(1, up.x * un.x + up.y * un.y))) * 180) / Math.PI
				if (angle < ANGLE[0] || angle > ANGLE[1]) return out.push(v)
				// Convex: the building lies between its two fronts, the street outside.
				const mid = { x: up.x + un.x, y: up.y + un.y }
				const ml = Math.hypot(mid.x, mid.y)
				const inward = { x: v.x + (mid.x / ml) * 0.3, y: v.y + (mid.y / ml) * 0.3 }
				const outward = { x: v.x - (mid.x / ml) * 0.8, y: v.y - (mid.y / ml) * 0.8 }
				if (!self(inward) || self(outward) || taken(outward)) return out.push(v)
				// Both fronts face a street, and nobody else stands in front of them.
				const front = (u, s) => ({ x: v.x + u.x * 1.2 - s * u.y * 0.6, y: v.y + u.y * 1.2 + s * u.x * 0.6 })
				const sideP = self(front(up, 1)) ? front(up, -1) : front(up, 1)
				const sideN = self(front(un, 1)) ? front(un, -1) : front(un, 1)
				if (!onStreet(sideP) || !onStreet(sideN) || taken(sideP) || taken(sideN)) return out.push(v)
				out.push({ x: round(v.x + up.x * back), y: round(v.y + up.y * back) }, { x: round(v.x + un.x * back), y: round(v.y + un.y * back) })
			})
			return closed ? [...out, out[0]] : out
		})
	}
}

// Is wall `seg` a cut corner? Short, between two longer walls, turning
// about 45° off each. Walls as [dx, dy] in tiles, in order round the outline.
export function isCutCorner(before, seg, after, tileM) {
	const len = (v) => Math.hypot(v[0], v[1]) * tileM
	if (len(seg) < 1.8 || len(seg) > 6.5 || len(before) < 4 || len(after) < 4) return false
	const turn = (u, v) =>
		(Math.acos(Math.max(-1, Math.min(1, ((u[0] * v[0] + u[1] * v[1]) / (len(u) * len(v))) * tileM * tileM))) * 180) / Math.PI
	const t1 = turn(before, seg)
	const t2 = turn(seg, after)
	return t1 > 25 && t1 < 65 && t2 > 25 && t2 < 65
}

const round = (n) => Math.round(n * 10) / 10
const hash = (n) => ((Math.imul(n + 7, 2654435761) >>> 0) % 10007) / 10007

function distance(p, a, b) {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
	return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
}

function bounds(rings) {
	const box = [Infinity, Infinity, -Infinity, -Infinity]
	for (const r of rings) {
		for (const p of r) {
			box[0] = Math.min(box[0], p.x)
			box[1] = Math.min(box[1], p.y)
			box[2] = Math.max(box[2], p.x)
			box[3] = Math.max(box[3], p.y)
		}
	}
	return box
}

// Even-odd over all rings, so a point in a courtyard is outside.
function insideRings(p, rings) {
	let hit = false
	for (const r of rings) {
		for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
			const a = r[i]
			const b = r[j]
			if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) hit = !hit
		}
	}
	return hit
}

// Road segments filed in a grid, so a point only checks the ones near it.
function grid(items, size = 16) {
	const cells = new Map()
	for (const it of items) {
		const [x0, y0, x1, y1] = it.box
		for (let y = Math.floor(y0 / size); y <= Math.floor(y1 / size); y++) {
			for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++) {
				const key = y * 65536 + x
				if (!cells.has(key)) cells.set(key, [])
				cells.get(key).push(it)
			}
		}
	}
	return (x, y) => cells.get(Math.floor(y / size) * 65536 + Math.floor(x / size)) ?? []
}
