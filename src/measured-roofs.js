// Optional Berlin LoD2 surfaces, already clipped to the OSM footprint.
// Exact outlines are the keys: rebuilding/reordering the map cannot put a
// neighbour's roof on a building. Unmatched and picked areas keep their roofs.
export function applyMeasuredRoofs(map, data) {
	if (!data || data.tileM !== map.tileM || JSON.stringify(data.bbox) !== JSON.stringify(map.bbox)) return
	const byOutline = new Map(data.buildings.map((b) => [JSON.stringify(b.rings), b]))
	for (const b of map.buildings) {
		const measured = byOutline.get(JSON.stringify(b.rings))
		if (measured) {
			b.h = measured.h
			b.roof = { kind: 'measured', faces: measured.faces }
		}
	}
}

export function planeOf(ring) {
	const p = ring[0]
	let best = null,
		largest = 1e-6
	for (let i = 1; i < ring.length - 1; i++) {
		const q = ring[i],
			r = ring[i + 1]
		const ux = q[0] - p[0],
			uy = q[1] - p[1],
			uz = q[2] - p[2]
		const vx = r[0] - p[0],
			vy = r[1] - p[1],
			vz = r[2] - p[2]
		const det = ux * vy - uy * vx
		if (Math.abs(det) <= largest) continue
		largest = Math.abs(det)
		const a = (uz * vy - uy * vz) / det,
			b = (ux * vz - uz * vx) / det
		best = [a, b, p[2] - a * p[0] - b * p[1]]
	}
	return best
}

const prepared = new WeakMap()
function facesOf(roof) {
	if (!prepared.has(roof))
		prepared.set(
			roof,
			roof.faces.map((rings) => ({ rings, plane: planeOf(rings[0]) })),
		)
	return prepared.get(roof)
}

function inside(ring, x, y) {
	let yes = false
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[i],
			b = ring[j]
		if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes
	}
	return yes
}

// Boundary points use the nearest edge (rounding and survey slivers can
// place a wall a fraction outside a face). Never extrapolate a distant slope.
export function measuredHeight(roof, x, y) {
	let nearest = Infinity,
		height = 0
	for (const { rings, plane } of facesOf(roof)) {
		if (!plane) continue
		const z = (px, py) => plane[0] * px + plane[1] * py + plane[2]
		if (rings.reduce((yes, r) => yes !== inside(r, x, y), false)) return z(x, y)
		for (const ring of rings) {
			for (let i = 0; i < ring.length; i++) {
				const a = ring[i],
					b = ring[(i + 1) % ring.length]
				const dx = b[0] - a[0],
					dy = b[1] - a[1]
				const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
				const px = a[0] + t * dx,
					py = a[1] + t * dy
				const d = (px - x) ** 2 + (py - y) ** 2
				if (d < nearest) [nearest, height] = [d, z(px, py)]
			}
		}
	}
	return height
}

// A gable's ridge can meet the middle of a long wall. Split there so the
// wall reaches the ridge instead of leaving a triangular hole beneath it.
export function splitRoofWalls(parts, roof) {
	const edges = roof.faces.flatMap((poly) => poly.flatMap((r) => r.map((a, i) => [a, r[(i + 1) % r.length]])))
	const split = (ring) =>
		ring.flatMap((a, i) => {
			const b = ring[(i + 1) % ring.length]
			const dx = b.x - a.x,
				dy = b.y - a.y
			const cuts = [0]
			for (const [p, q] of edges) {
				const ex = q[0] - p[0],
					ey = q[1] - p[1]
				const det = dx * ey - dy * ex
				if (Math.abs(det) < 1e-8) continue
				const px = p[0] - a.x,
					py = p[1] - a.y
				const t = (px * ey - py * ex) / det
				const u = (px * dy - py * dx) / det
				if (t > 1e-5 && t < 1 - 1e-5 && u >= -1e-4 && u <= 1.0001) cuts.push(t)
			}
			return cuts
				.sort((x, y) => x - y)
				.filter((t, i, all) => !i || t - all[i - 1] > 1e-5)
				.map((t) => a.clone().lerp(b, t))
		})
	return parts.map(({ outer, holes }) => ({ outer: split(outer), holes: holes.map(split) }))
}

// Vertical faces between a high roof and a lower annex/terrace. Ordinary
// sloped neighbours meet without a step; external walls are built elsewhere.
export function roofSteps(roof) {
	const steps = []
	for (const { rings, plane } of facesOf(roof)) {
		if (!plane) continue
		for (const ring of rings) {
			const area = ring.reduce((s, a, i) => {
				const b = ring[(i + 1) % ring.length]
				return s + a[0] * b[1] - b[0] * a[1]
			}, 0)
			for (let i = 0; i < ring.length; i++) {
				const a = ring[i],
					b = ring[(i + 1) % ring.length]
				const dx = b[0] - a[0],
					dy = b[1] - a[1],
					len = Math.hypot(dx, dy)
				if (len < 0.01) continue
				const nx = (dy / len) * Math.sign(area),
					ny = (-dx / len) * Math.sign(area)
				const x = (a[0] + b[0]) / 2 + nx * 0.001,
					y = (a[1] + b[1]) / 2 + ny * 0.001
				const neighbour = facesOf(roof).find((f) => f.plane && f.rings.reduce((yes, r) => yes !== inside(r, x, y), false))
				if (!neighbour) continue
				const low = (p) => neighbour.plane[0] * p[0] + neighbour.plane[1] * p[1] + neighbour.plane[2]
				if ((a[2] + b[2] - low(a) - low(b)) / 2 < 0.03) continue
				steps.push({ a, b, za: Math.min(a[2], low(a)), zb: Math.min(b[2], low(b)), nx, ny })
			}
		}
	}
	return steps
}
