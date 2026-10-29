// Brandwände: the blank side walls of a Berlin block. A wall built against
// the neighbour's has no windows; where the neighbour is lower, or gone and
// its plot empty, that wall stands out above it, bare and rougher. Some
// carry a mural (OSM tourism=artwork, artwork_type=mural), an old painted
// ad or tags. This finds them, from the outlines alone, so it works on any
// picked area; murals.js paints them.

const MIN_H = 10 // metres: lower houses keep their walls as they are
const MIN_LEN = 1 // tiles
const PROBE = [0.3, 0.7] // tiles out from the wall where a neighbour counts as against it
const SHARED = 0.3 // share of the wall that must stand against one
const STREET = 6 // tiles: a wall with a road this far out in front faces the street
const MURAL_REACH = 8 // tiles from a mapped mural to its wall

export function createFirewalls(world) {
	const { buildings, tileM } = world
	const index = grid(buildings.map((b, n) => ({ n, box: bounds(b.rings) })))
	const baseOf = new Map()
	const base = (n) => {
		if (!baseOf.has(n)) {
			let z = Infinity
			for (const r of buildings[n].rings) for (let i = 0; i < r.length; i += 2) z = Math.min(z, world.heightAt(r[i], r[i + 1]))
			baseOf.set(n, Number.isFinite(z) ? z : 0)
		}
		return baseOf.get(n)
	}
	const inside = (n, x, y) => insideRings(x, y, buildings[n].rings)
	const against = (n, x, y) => index(x, y).filter((o) => o.n !== n && inside(o.n, x, y))
	const road = (x, y) => world.tileAt(x, y) === 1 // T.ROAD

	// Every straight run of wall round a building, which way it faces, and
	// whether it's a firewall.
	const runsOf = new Map()
	function runs(n) {
		if (runsOf.has(n)) return runsOf.get(n)
		const b = buildings[n]
		const list = []
		runsOf.set(n, list)
		if (b.h < MIN_H) return list
		for (const r of b.rings) {
			const ring = []
			for (let i = 0; i + 3 < r.length; i += 2) {
				const [ax, ay, bx, by] = [r[i], r[i + 1], r[i + 2], r[i + 3]]
				if (Math.hypot(bx - ax, by - ay) < 0.01) continue
				const last = ring.at(-1)
				const key = keyOf((ax + bx) / 2, (ay + by) / 2)
				if (last && straight(last, bx, by)) {
					last.bx = bx
					last.by = by
					last.keys.push(key)
				} else ring.push({ n, ax, ay, bx, by, keys: [key] })
			}
			for (const w of ring) {
				w.len = Math.hypot(w.bx - w.ax, w.by - w.ay)
				w.ex = (w.bx - w.ax) / w.len
				w.ey = (w.by - w.ay) / w.len
				const mx = (w.ax + w.bx) / 2
				const my = (w.ay + w.by) / 2
				const side = inside(n, mx - w.ey * 0.1, my + w.ex * 0.1) ? -1 : 1
				w.nx = -w.ey * side
				w.ny = w.ex * side
				w.street = [0.7, 2, 3.5, STREET].some((d) => road(mx + w.nx * d, my + w.ny * d))
			}
			ring.forEach((w, k) => {
				if (w.len < MIN_LEN) return
				// Against a neighbour along a good share of it: a party wall,
				// bare from the neighbour's eaves up.
				const steps = Math.max(3, Math.ceil(w.len))
				let hits = 0
				let from = base(n)
				for (let s = 0; s < steps; s++) {
					const t = (s + 0.5) / steps
					const x = w.ax + (w.bx - w.ax) * t
					const y = w.ay + (w.by - w.ay) * t
					const others = PROBE.flatMap((d) => against(n, x + w.nx * d, y + w.ny * d))
					if (!others.length) continue
					hits++
					for (const o of others) from = Math.max(from, base(o.n) + buildings[o.n].h / tileM)
				}
				if (hits / steps >= SHARED) Object.assign(w, { fire: true, from })
				w.prev = ring[(k + ring.length - 1) % ring.length]
				w.next = ring[(k + 1) % ring.length]
			})
			list.push(...ring)
		}
		// A side wall at a gap: a house on a street front, with a neighbour on
		// one side but nothing on the other, shows its bare side down to the ground.
		if (list.some((w) => w.fire)) {
			for (const w of list) {
				if (w.fire || w.street || w.len < MIN_LEN * 2 || !w.prev) continue
				const square = (o) => o.street && Math.abs(o.ex * w.ex + o.ey * w.ey) < 0.5
				if (square(w.prev) || square(w.next)) Object.assign(w, { fire: true, from: base(n), gap: true })
			}
		}
		return list
	}

	// Mapped murals take the nearest tall wall facing them, firewalls first,
	// which becomes a firewall if it wasn't one: real murals cover blank walls.
	for (const m of world.murals ?? []) {
		let best = null
		for (const o of index(m.x, m.y, MURAL_REACH)) {
			for (const w of runs(o.n)) {
				// Never over a shopfront: a firewall, or at least a wall off the street.
				if (w.len < 2 || (w.street && !w.fire)) continue
				const t = Math.max(0, Math.min(w.len, (m.x - w.ax) * w.ex + (m.y - w.ay) * w.ey))
				const dx = m.x - (w.ax + w.ex * t)
				const dy = m.y - (w.ay + w.ey * t)
				const d = Math.hypot(dx, dy)
				if (d > MURAL_REACH || dx * w.nx + dy * w.ny < -1) continue
				const score = d - (w.fire ? 4 : 0) + (w.mural ? 10 : 0)
				if (!best || score < best.score) best = { w, score }
			}
		}
		if (!best) continue
		const { w } = best
		if (!w.fire) Object.assign(w, { fire: true, from: base(w.n) })
		w.mural = m
	}

	const byKey = new Map()
	const keyed = (n) => {
		if (!byKey.has(n)) byKey.set(n, new Map(runs(n).flatMap((w) => (w.fire ? w.keys.map((k) => [k, w]) : []))))
		return byKey.get(n)
	}
	return {
		// The firewall that the wall piece of building n with this midpoint is
		// part of, if it is one. Map coordinates, y down.
		at: (n, x, y) => keyed(n).get(keyOf(x, y)) ?? null,
		// All of building n's firewalls, with `from` the height (tiles over
		// sea level, as it were) they're bare from.
		of: (n) => runs(n).filter((w) => w.fire),
		base,
	}
}

const keyOf = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`

// Does carrying the run on to (x, y) keep it within about 8°?
function straight(w, x, y) {
	const ux = w.bx - w.ax
	const uy = w.by - w.ay
	const vx = x - w.bx
	const vy = y - w.by
	const lu = Math.hypot(ux, uy)
	const lv = Math.hypot(vx, vy)
	return lu > 0 && lv > 0 && (ux * vx + uy * vy) / (lu * lv) > 0.99
}

function bounds(rings) {
	const box = [Infinity, Infinity, -Infinity, -Infinity]
	for (const r of rings) {
		for (let i = 0; i < r.length; i += 2) {
			box[0] = Math.min(box[0], r[i])
			box[1] = Math.min(box[1], r[i + 1])
			box[2] = Math.max(box[2], r[i])
			box[3] = Math.max(box[3], r[i + 1])
		}
	}
	return box
}

// Even-odd over flat [x, y, …] rings, so a courtyard is outside.
function insideRings(x, y, rings) {
	let hit = false
	for (const r of rings) {
		for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
			const ay = r[i + 1]
			const by = r[j + 1]
			if (ay > y !== by > y && x < r[i] + ((y - ay) / (by - ay)) * (r[j] - r[i])) hit = !hit
		}
	}
	return hit
}

// Buildings filed by their boxes in a grid; a lookup gives those whose box
// is within `reach` of a point.
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
	return (x, y, reach = 0) => {
		const near = new Set()
		for (let cy = Math.floor((y - reach) / size); cy <= Math.floor((y + reach) / size); cy++) {
			for (let cx = Math.floor((x - reach) / size); cx <= Math.floor((x + reach) / size); cx++) {
				for (const it of cells.get(cy * 65536 + cx) ?? []) near.add(it)
			}
		}
		return [...near].filter(({ box }) => x >= box[0] - reach && x <= box[2] + reach && y >= box[1] - reach && y <= box[3] + reach)
	}
}
