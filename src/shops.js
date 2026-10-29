import { SOLID, T } from './tiles.js'
import { placeName } from './places.js'
import { isCutCorner } from './corners.js'

const KINDS = new Set(['spaeti', 'doener', 'imbiss', 'cafe', 'bar', 'restaurant', 'bikeshop', 'supermarket', 'bakery', 'pharmacy'])
const REACH = 6 // how far a place may be from its facade, tiles
const STAND = [0.35, 0.6, 0.9, 1.2] // where you might stand at the door, out from the wall, tiles
const MARGIN = 0.6 // door at least this far from a corner, tiles
const SPACING = 1.8 // doors on one facade at least this far apart, tiles
const AT_DOOR = { along: 0.75, out: 0.8 } // how close to where you stand counts as at the door
const CELL = 16 // tiles: walls are filed in a grid of these, so a place only checks the ones near it
// Kiosks, Spätis and Eckkneipen take the cut corner if it's within this many
// tiles more than their nearest front.
const CORNER = new Set(['spaeti', 'bar', 'imbiss', 'doener', 'cafe', 'bakery'])
const CORNER_PULL = 1.5

export function findShops(world) {
	const free = (x, y) => !SOLID.has(world.tileAt(x, y))
	const facadeOf = facades(world)
	const shops = []
	for (const p of world.pois) {
		if (!KINDS.has(p.kind)) continue
		let best = facadeOf(p.x, p.y, p.kind)
		if (best?.seg?.taken) best = best.front
		if (!best) continue
		if (best.seg) best.seg.taken = true
		const { x, y, nx, ny, ex, ey, out, room } = best
		shops.push({ place: p, name: placeName(p), kind: p.kind, x, y, nx, ny, ex, ey, out, room, stand: { x: x + nx * out, y: y + ny * out } })
	}

	// Two shops in one shopfront: step their doors apart along the wall, if
	// there's still somewhere to stand.
	for (let i = 0; i < shops.length; i++) {
		for (let j = i + 1; j < shops.length; j++) {
			// Doors on one facade within SPACING are under 2 tiles apart.
			if (Math.abs(shops[i].x - shops[j].x) > 2 || Math.abs(shops[i].y - shops[j].y) > 2) continue
			const t = alongFacade(shops[i], shops[j])
			if (t === null || Math.abs(t) >= SPACING) continue
			// Along the first one's wall, which may run the other way to the second's.
			const { ex, ey } = shops[i]
			const step = ((SPACING - Math.abs(t)) / 2) * (t < 0 ? -1 : 1)
			for (const [s, k] of [
				[shops[i], -step],
				[shops[j], step],
			]) {
				const stand = { x: s.stand.x + ex * k, y: s.stand.y + ey * k }
				if (!free(stand.x, stand.y) || free(s.x + ex * k - s.nx * 0.5, s.y + ey * k - s.ny * 0.5)) continue
				Object.assign(s, { x: s.x + ex * k, y: s.y + ey * k, stand })
			}
		}
	}
	return shops
}

// Shops as plain numbers for map.json, worked out once when the map is
// built: per shop its place's index, then x, y, nx, ny, ex, ey, out and room.
export function packShops(shops, pois) {
	const index = new Map(pois.map((p, i) => [p, i]))
	const round = (v) => Math.round(v * 1e4) / 1e4
	return shops.flatMap((s) => [index.get(s.place), ...[s.x, s.y, s.nx, s.ny, s.ex, s.ey, s.out, s.room].map(round)])
}

// The map's shops, packed when it was built, or found now for older maps.
export function shopsOf(world) {
	if (!world.shops) return findShops(world)
	const shops = []
	for (let i = 0; i < world.shops.length; i += 9) {
		const [n, x, y, nx, ny, ex, ey, out, room] = world.shops.slice(i, i + 9)
		const p = world.pois[n]
		shops.push({ place: p, name: placeName(p), kind: p.kind, x, y, nx, ny, ex, ey, out, room, stand: { x: x + nx * out, y: y + ny * out } })
	}
	return shops
}

// Where a place at (x, y) meets the street: the nearest stretch of wall
// that opens onto somewhere walkable, the spot on it, which way is out and
// where to stand, and its building `n`, `s` along a wall `len` long.
export function facades(world) {
	const free = (x, y) => !SOLID.has(world.tileAt(x, y))
	const walls = world.buildings.map((b) => {
		const segs = []
		let x0 = Infinity
		let y0 = Infinity
		let x1 = -Infinity
		let y1 = -Infinity
		for (const r of b.rings) {
			const first = segs.length
			for (let i = 0; i + 3 < r.length; i += 2) {
				// Outlines come in short pieces; a straight run is one wall.
				const last = segs.at(-1)
				if (last && i > 0 && straight(last, r[i + 2], r[i + 3])) {
					last[2] = r[i + 2]
					last[3] = r[i + 3]
				} else segs.push([r[i], r[i + 1], r[i + 2], r[i + 3]])
				x0 = Math.min(x0, r[i])
				y0 = Math.min(y0, r[i + 1])
				x1 = Math.max(x1, r[i])
				y1 = Math.max(y1, r[i + 1])
			}
			const ring = segs.slice(first)
			const dir = ([ax, ay, bx, by]) => [bx - ax, by - ay]
			ring.forEach((seg, k) => {
				const before = ring[(k + ring.length - 1) % ring.length]
				const after = ring[(k + 1) % ring.length]
				if (ring.length > 3 && isCutCorner(dir(before), dir(seg), dir(after), world.tileM)) seg.corner = true
			})
		}
		return { segs, x0, y0, x1, y1 }
	})
	walls.forEach((w, n) => (w.n = n))
	const cells = new Map()
	walls.forEach((w, i) => {
		for (let cy = Math.floor(w.y0 / CELL); cy <= Math.floor(w.y1 / CELL); cy++) {
			for (let cx = Math.floor(w.x0 / CELL); cx <= Math.floor(w.x1 / CELL); cx++) {
				const key = cy * 65536 + cx
				if (!cells.has(key)) cells.set(key, [])
				cells.get(key).push(i)
			}
		}
	})
	function wallsNear(x, y) {
		const near = new Set()
		for (let cy = Math.floor((y - REACH) / CELL); cy <= Math.floor((y + REACH) / CELL); cy++) {
			for (let cx = Math.floor((x - REACH) / CELL); cx <= Math.floor((x + REACH) / CELL); cx++) {
				for (const i of cells.get(cy * 65536 + cx) ?? []) near.add(i)
			}
		}
		return [...near].sort((a, b) => a - b).map((i) => walls[i])
	}

	// A place of `kind` may be pulled onto a cut corner; `front` is then the
	// best spot off it.
	return (px, py, kind) => {
		let best = null
		let front = null
		for (const w of wallsNear(px, py)) {
			if (px < w.x0 - REACH || px > w.x1 + REACH || py < w.y0 - REACH || py > w.y1 + REACH) continue
			for (const seg of w.segs) {
				const [ax, ay, bx, by] = seg
				const len = Math.hypot(bx - ax, by - ay)
				if (len < MARGIN * 2 + 0.4 && !seg.corner) continue
				const ex = (bx - ax) / len
				const ey = (by - ay) / len
				const s = seg.corner ? len / 2 : Math.max(MARGIN, Math.min(len - MARGIN, (px - ax) * ex + (py - ay) * ey))
				const x = ax + ex * s
				const y = ay + ey * s
				const d = Math.hypot(px - x, py - y)
				if (d > REACH || (best && front && d >= Math.max(best.d, front.d))) continue
				// Outward is whichever side you can stand on; a wall with both or
				// neither free is a party wall or a courtyard nook.
				for (const side of [1, -1]) {
					const nx = -ey * side
					const ny = ex * side
					if (free(x - nx * 0.5, y - ny * 0.5)) continue
					// The tiles round off the outline, so stand on the first free spot.
					const out = STAND.find((o) => free(x + nx * o, y + ny * o) && free(x + nx * (o + 0.6), y + ny * (o + 0.6)))
					if (out === undefined) continue
					const street = world.tileAt(x + nx * (out + 0.6), y + ny * (out + 0.6)) === T.SIDEWALK
					const score = d + out + (street ? 0 : 2) - (seg.corner && CORNER.has(kind) ? CORNER_PULL : 0)
					const spot = { d: score, x, y, nx, ny, ex, ey, out, room: Math.min(s, len - s), n: w.n, s, len, street, seg: seg.corner && seg }
					if (!best || score < best.d) best = spot
					if (!seg.corner && (!front || score < front.d)) front = spot
				}
			}
		}
		if (best) best.front = front
		return best
	}
}

// How far along a's wall b's door is, if they share a facade, else null.
export function alongFacade(a, b) {
	if (a.nx * b.nx + a.ny * b.ny < 0.95) return null
	const dx = b.x - a.x
	const dy = b.y - a.y
	if (Math.abs(dx * a.nx + dy * a.ny) > 0.5) return null
	return dx * a.ex + dy * a.ey
}

// Does carrying wall [ax, ay, bx, by] on to (x, y) keep it within about 8°?
function straight([ax, ay, bx, by], x, y) {
	const ux = bx - ax
	const uy = by - ay
	const vx = x - bx
	const vy = y - by
	const lu = Math.hypot(ux, uy)
	const lv = Math.hypot(vx, vy)
	return lu > 0 && lv > 0 && (ux * vx + uy * vy) / (lu * lv) > 0.99
}

export function shopAt(shops, x, y) {
	let best = null
	let bestD = Infinity
	for (const s of shops) {
		const dx = x - s.stand.x
		const dy = y - s.stand.y
		const out = dx * s.nx + dy * s.ny
		const along = Math.abs(dx * s.ex + dy * s.ey)
		// All the way back to the wall: pressed against the door still counts.
		if (out < -s.out - 0.1 || out > AT_DOOR.out || along > AT_DOOR.along) continue
		if (Math.abs(out) + along < bestD) [best, bestD] = [s, Math.abs(out) + along]
	}
	return best
}
