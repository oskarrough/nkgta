// Pitched roofs. A building that is close enough to a rectangle gets a hip
// roof over its oriented bounding box: four slopes up from the eaves, and a
// flat top where the building is too deep for the slopes to meet. The slopes
// are clipped to the real outline, so the roof covers exactly the walls.
// Shared by the roof texture, which leaves out its painted ridge for these,
// and the 3D scene, which builds them.

const PITCH = 1 // rise per run: 45°, like most Altbau roofs
const MAX_RISE = 6 // metres, after which the top is flat
const SQUARE_ENOUGH = 0.9 // outline area over bounding box area

// `pts` is one outline as [[x, y], …] in tiles, `h` the height in metres.
// Returns the roof's frame, or null for a building that keeps a flat roof.
export function hipRoof(pts, h, tileM) {
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
	return { cx: cu * c - cv * s, cy: cu * s + cv * c, c, s, L, W, run, slope: PITCH }
}

// Height of the roof above the eaves at (x, y).
export function roofHeight(roof, x, y) {
	const dx = x - roof.cx
	const dy = y - roof.cy
	const u = dx * roof.c + dy * roof.s
	const v = -dx * roof.s + dy * roof.c
	return Math.max(0, Math.min(roof.L - Math.abs(u), roof.W - Math.abs(v), roof.run)) * roof.slope
}

// The roof's faces as convex polygons, anticlockwise, in the same frame as
// the outline: the four slopes and, if there is one, the flat top.
export function roofFaces(roof) {
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
export function clipConvex(subject, clip) {
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
