// Shops you can walk into: every shop-like place that sits on a facade, with
// its door on the nearest stretch of wall that opens onto somewhere walkable.
import { SOLID, T } from './tiles.js'
import { placeName } from './places.js'

const KINDS = new Set(['spaeti', 'doener', 'imbiss', 'cafe', 'bar', 'restaurant', 'bikeshop', 'supermarket', 'bakery', 'pharmacy'])
const REACH = 6 // how far a place may be from its facade, tiles
const STAND = [0.35, 0.6, 0.9, 1.2] // where you might stand at the door, out from the wall, tiles
const MARGIN = 0.6 // door at least this far from a corner, tiles
const SPACING = 1.8 // doors on one facade at least this far apart, tiles
const AT_DOOR = { along: 0.75, out: 0.8 } // how close to where you stand counts as at the door

export function findShops(world) {
	const free = (x, y) => !SOLID.has(world.tileAt(x, y))
	// Each building's walls as segments, with a bounding box to skip the far ones.
	const walls = world.buildings.map((b) => {
		const segs = []
		let x0 = Infinity
		let y0 = Infinity
		let x1 = -Infinity
		let y1 = -Infinity
		for (const r of b.rings) {
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
		}
		return { segs, x0, y0, x1, y1 }
	})

	const shops = []
	for (const p of world.pois) {
		if (!KINDS.has(p.kind)) continue
		let best = null
		for (const w of walls) {
			if (p.x < w.x0 - REACH || p.x > w.x1 + REACH || p.y < w.y0 - REACH || p.y > w.y1 + REACH) continue
			for (const [ax, ay, bx, by] of w.segs) {
				const len = Math.hypot(bx - ax, by - ay)
				if (len < MARGIN * 2 + 0.4) continue
				const ex = (bx - ax) / len
				const ey = (by - ay) / len
				const s = Math.max(MARGIN, Math.min(len - MARGIN, (p.x - ax) * ex + (p.y - ay) * ey))
				const x = ax + ex * s
				const y = ay + ey * s
				const d = Math.hypot(p.x - x, p.y - y)
				if (d > REACH || (best && d >= best.d)) continue
				// Outward is whichever side you can stand on; a wall with both or
				// neither free is a party wall or a courtyard nook.
				for (const side of [1, -1]) {
					const nx = -ey * side
					const ny = ex * side
					if (free(x - nx * 0.5, y - ny * 0.5)) continue
					// The tiles round off the outline, so stand on the first free spot.
					const out = STAND.find((o) => free(x + nx * o, y + ny * o) && free(x + nx * (o + 0.6), y + ny * (o + 0.6)))
					if (out === undefined) continue
					// Pavement beats a courtyard.
					const street = world.tileAt(x + nx * (out + 0.6), y + ny * (out + 0.6)) === T.SIDEWALK
					const score = d + out + (street ? 0 : 2)
					if (!best || score < best.d) best = { d: score, x, y, nx, ny, ex, ey, out, room: Math.min(s, len - s) }
				}
			}
		}
		if (!best) continue
		const { x, y, nx, ny, ex, ey, out, room } = best
		shops.push({ place: p, name: placeName(p), kind: p.kind, x, y, nx, ny, ex, ey, out, room, stand: { x: x + nx * out, y: y + ny * out } })
	}

	// Two shops in one shopfront: step their doors apart along the wall, if
	// there's still somewhere to stand.
	for (let i = 0; i < shops.length; i++) {
		for (let j = i + 1; j < shops.length; j++) {
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

// The shop whose door you're standing at, if any.
export function shopAt(shops, x, y) {
	let best = null
	let bestD = Infinity
	for (const s of shops) {
		const dx = x - s.stand.x
		const dy = y - s.stand.y
		const out = dx * s.nx + dy * s.ny
		const along = Math.abs(dx * s.ex + dy * s.ey)
		if (out < -0.4 || out > AT_DOOR.out || along > AT_DOOR.along) continue
		if (Math.abs(out) + along < bestD) [best, bestD] = [s, Math.abs(out) + along]
	}
	return best
}
