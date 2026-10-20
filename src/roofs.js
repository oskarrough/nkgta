// Pitched roofs. A building that is close enough to a rectangle gets a hip
// roof over its oriented bounding box: four slopes up from the eaves, and a
// flat top where the building is too deep for the slopes to meet. The slopes
// are clipped to the real outline, so the roof covers exactly the walls.
// Every other shape, the L and U blocks round a Hof included, gets a mansard:
// a steep strip up from every wall to the outline drawn in a few metres, and
// a flat top inside that. The 3D scene builds them; the roof texture leaves
// out its painted ridge where it does.

const PITCH = 1 // rise per run: 45°, like most Altbau roofs
const MAX_RISE = 6 // metres, after which the top is flat
const SQUARE_ENOUGH = 0.9 // outline area over bounding box area
const MANSARD_PITCH = 1.5 // steeper, about 56°
const MANSARD_RUN = [4, 2.5] // metres in from the wall, tried in turn
const MITRE = 3 // longest corner offset, in runs, before a corner counts as a spike
const SIMPLIFY = 1.2 // metres of jog in an outline a mansard smooths over

// The roof for an outline, `rings` as [[[x, y], …], …] in tiles with the
// outer ring first, `h` in metres: a hip roof, a mansard, or null for flat.
export function roofShape(rings, h, tileM) {
	if (h <= 5) return null
	const clean = rings.map(tidy).filter((r) => r.length >= 3)
	if (clean.length !== rings.length || !clean.length) return null
	if (clean.length === 1) {
		const hip = hipRoof(clean[0], h, tileM)
		if (hip) return hip
	}
	// Outer ring anticlockwise, courtyards clockwise, so "left" is always
	// into the building.
	// Small jogs would turn the inset inside out, so the mansard follows a
	// simplified outline; the scene keeps the flat roof under it for the slivers.
	const simple = clean.map((r) => tidy(simplify(r, SIMPLIFY / tileM))).filter((r) => r.length >= 3)
	if (simple.length !== clean.length) return null
	const oriented = simple.map((r, i) => (area(r) > 0 === (i === 0) ? r : [...r].reverse()))
	for (const metres of MANSARD_RUN) {
		const run = metres / tileM
		const insets = oriented.map((r) => inset(r, run))
		if (insets.every(Boolean) && !crossing(insets)) {
			return { kind: 'mansard', rings: oriented, insets, run, slope: MANSARD_PITCH }
		}
	}
	return null
}

// The flat part on top of a pitched roof, as rings in the outline's frame, or
// null where the slopes meet in a ridge.
export function flatTops(roof) {
	if (roof.kind === 'mansard') return roof.insets
	const top = roofFaces(roof)[4]
	return top ? [top] : null
}

// Triangles of the roof, as flat [x, y, z, …] with z above the eaves, each
// anticlockwise from above.
export function roofTriangles(roof, triangulate) {
	const out = []
	const push = (a, b, c) => {
		const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
		for (const p of ccw ? [a, b, c] : [a, c, b]) out.push(p[0], p[1], p[2] ?? roofHeight(roof, p[0], p[1]))
	}
	const fill = (contour, holes, z) => {
		const all = [contour, ...holes].flat()
		for (const tri of triangulate(contour, holes)) {
			const [a, b, c] = tri.map((i) => [...all[i], z])
			push(a, b, c)
		}
	}
	if (roof.kind === 'hip') {
		for (const face of roofFaces(roof)) {
			const piece = clipConvex(roof.outline, face)
			if (piece.length >= 3) fill(piece, [], undefined)
		}
		return out
	}
	const top = roof.run * roof.slope
	roof.rings.forEach((ring, k) => {
		const inner = roof.insets[k]
		for (let i = 0; i < ring.length; i++) {
			const j = (i + 1) % ring.length
			const a = [...ring[i], 0]
			const b = [...ring[j], 0]
			const c = [...inner[j], top]
			const d = [...inner[i], top]
			push(a, b, c)
			push(a, c, d)
		}
	})
	fill(roof.insets[0], roof.insets.slice(1), top)
	return out
}

// Drop repeated and nearly straight-through points, which would give
// degenerate corners.
function tidy(ring) {
	let pts = ring.filter((p, i) => {
		const q = ring[(i + 1) % ring.length]
		return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3
	})
	for (let pass = 0; pass < 2; pass++) {
		pts = pts.filter((p, i) => {
			const a = pts[(i - 1 + pts.length) % pts.length]
			const b = pts[(i + 1) % pts.length]
			const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])
			return Math.abs(cross) > 1e-3 * Math.hypot(b[0] - a[0], b[1] - a[1])
		})
	}
	return pts
}

// Douglas–Peucker on a closed ring, split at the point farthest from the first.
function simplify(ring, tolerance) {
	if (ring.length <= 4) return ring
	const far = ring.reduce(
		(best, p, i) =>
			Math.hypot(p[0] - ring[0][0], p[1] - ring[0][1]) > Math.hypot(ring[best][0] - ring[0][0], ring[best][1] - ring[0][1]) ? i : best,
		0,
	)
	const keep = new Set([0, far])
	const run = (i, j) => {
		const [ax, ay] = ring[i]
		const [bx, by] = ring[j % ring.length]
		const len = Math.hypot(bx - ax, by - ay) || 1
		let worst = -1
		let dist = tolerance
		for (let k = i + 1; k < j; k++) {
			const [px, py] = ring[k]
			const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
			if (d > dist) [worst, dist] = [k, d]
		}
		if (worst < 0) return
		keep.add(worst)
		run(i, worst)
		run(worst, j)
	}
	run(0, far)
	run(far, ring.length)
	return ring.filter((_, i) => keep.has(i))
}

function area(r) {
	let a = 0
	for (let i = 0; i < r.length; i++) {
		const [x, y] = r[i]
		const [nx, ny] = r[(i + 1) % r.length]
		a += x * ny - nx * y
	}
	return a / 2
}

// The ring moved `d` to its left, corners mitred; null where a corner spikes
// or an edge turns round, which means the building is too thin for it.
function inset(ring, d) {
	const n = ring.length
	const normal = (i) => {
		const [ax, ay] = ring[i]
		const [bx, by] = ring[(i + 1) % n]
		const len = Math.hypot(bx - ax, by - ay)
		return [-(by - ay) / len, (bx - ax) / len]
	}
	const out = []
	for (let i = 0; i < n; i++) {
		const n0 = normal((i - 1 + n) % n)
		const n1 = normal(i)
		const k = 1 + n0[0] * n1[0] + n0[1] * n1[1]
		if (k < 0.2) return null
		const mx = ((n0[0] + n1[0]) * d) / k
		const my = ((n0[1] + n1[1]) * d) / k
		if (Math.hypot(mx, my) > MITRE * d) return null
		out.push([ring[i][0] + mx, ring[i][1] + my])
	}
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n
		const dot = (ring[j][0] - ring[i][0]) * (out[j][0] - out[i][0]) + (ring[j][1] - ring[i][1]) * (out[j][1] - out[i][1])
		if (dot <= 0) return null
	}
	return out
}

// Does any edge of the inset rings cross another?
function crossing(rings) {
	const edges = []
	rings.forEach((r, k) => r.forEach((p, i) => edges.push([k, i, r.length, p, r[(i + 1) % r.length]])))
	const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
	for (let x = 0; x < edges.length; x++) {
		for (let y = x + 1; y < edges.length; y++) {
			const [k1, i1, n1, a, b] = edges[x]
			const [k2, i2, , c, d] = edges[y]
			if (k1 === k2 && (Math.abs(i1 - i2) <= 1 || Math.abs(i1 - i2) === n1 - 1)) continue
			if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true
		}
	}
	return false
}

// `pts` is one outline as [[x, y], …] in tiles, `h` the height in metres.
// Returns the roof's frame, or null for a building that keeps a flat roof.
function hipRoof(pts, h, tileM) {
	if (h <= 5 || pts.length < 3) return null
	let longest = 0
	let angle = 0
	for (let i = 0; i < pts.length; i++) {
		const [ax, ay] = pts[i]
		const [bx, by] = pts[(i + 1) % pts.length]
		const len = Math.hypot(bx - ax, by - ay)
		if (len > longest) [longest, angle] = [len, Math.atan2(by - ay, bx - ax)]
	}
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	let u0 = Infinity
	let u1 = -Infinity
	let v0 = Infinity
	let v1 = -Infinity
	let area = 0
	for (let i = 0; i < pts.length; i++) {
		const [x, y] = pts[i]
		const [nx, ny] = pts[(i + 1) % pts.length]
		area += x * ny - nx * y
		const u = x * c + y * s
		const v = -x * s + y * c
		u0 = Math.min(u0, u)
		u1 = Math.max(u1, u)
		v0 = Math.min(v0, v)
		v1 = Math.max(v1, v)
	}
	if (Math.abs(area / 2) < SQUARE_ENOUGH * (u1 - u0) * (v1 - v0)) return null
	const cu = (u0 + u1) / 2
	const cv = (v0 + v1) / 2
	const L = (u1 - u0) / 2
	const W = (v1 - v0) / 2
	const run = Math.min(Math.min(L, W), MAX_RISE / tileM / PITCH)
	return { kind: 'hip', outline: pts, cx: cu * c - cv * s, cy: cu * s + cv * c, c, s, L, W, run, slope: PITCH }
}

// Height of the roof above the eaves at (x, y).
export function roofHeight(roof, x, y) {
	if (roof.kind === 'mansard') return Math.min(distanceToRings(roof.rings, x, y), roof.run) * roof.slope
	const dx = x - roof.cx
	const dy = y - roof.cy
	const u = dx * roof.c + dy * roof.s
	const v = -dx * roof.s + dy * roof.c
	return Math.max(0, Math.min(roof.L - Math.abs(u), roof.W - Math.abs(v), roof.run)) * roof.slope
}

function distanceToRings(rings, x, y) {
	let best = Infinity
	for (const r of rings) {
		for (let i = 0; i < r.length; i++) {
			const [ax, ay] = r[i]
			const [bx, by] = r[(i + 1) % r.length]
			const dx = bx - ax
			const dy = by - ay
			const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
			best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy))
		}
	}
	return best
}

// The roof's faces as convex polygons, anticlockwise, in the same frame as
// the outline: the four slopes and, if there is one, the flat top.
function roofFaces(roof) {
	const { L, W, run: d } = roof
	const local = [
		[
			[-L, -W],
			[L, -W],
			[L - d, -W + d],
			[-L + d, -W + d],
		],
		[
			[L, -W],
			[L, W],
			[L - d, W - d],
			[L - d, -W + d],
		],
		[
			[L, W],
			[-L, W],
			[-L + d, W - d],
			[L - d, W - d],
		],
		[
			[-L, W],
			[-L, -W],
			[-L + d, -W + d],
			[-L + d, W - d],
		],
	]
	if (W - d > 1e-3) {
		local.push([
			[-L + d, -W + d],
			[L - d, -W + d],
			[L - d, W - d],
			[-L + d, W - d],
		])
	}
	const toWorld = ([u, v]) => [roof.cx + u * roof.c - v * roof.s, roof.cy + u * roof.s + v * roof.c]
	return local.map((face) => dedupe(face.map(toWorld))).filter((face) => face.length >= 3)
}

function dedupe(pts) {
	return pts.filter((p, i) => {
		const q = pts[(i + 1) % pts.length]
		return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6
	})
}

// Sutherland–Hodgman: the part of `subject` inside the convex,
// anticlockwise polygon `clip`.
function clipConvex(subject, clip) {
	let out = subject
	for (let i = 0; i < clip.length && out.length; i++) {
		const [ax, ay] = clip[i]
		const [bx, by] = clip[(i + 1) % clip.length]
		const side = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax)
		const input = out
		out = []
		for (let j = 0; j < input.length; j++) {
			const p = input[j]
			const q = input[(j + 1) % input.length]
			const sp = side(p)
			const sq = side(q)
			if (sp >= 0) out.push(p)
			if (sp >= 0 !== sq >= 0) {
				const t = sp / (sp - sq)
				out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
			}
		}
	}
	return out
}
