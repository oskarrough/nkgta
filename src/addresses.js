import { facades } from './shops.js'

const LOOK = 14 // tiles out from a door to find its street's carriageway
const AROUND = 5 // tiles: an address point inside the block tries this far round for a door

export function findAddresses(world, raw) {
	const facadeOf = facades(world)

	const faces = (spot, street) => {
		for (let k = spot.out + 0.5; k < LOOK; k += 0.5) {
			const name = world.streetAt(spot.x + spot.nx * k, spot.y + spot.ny * k)
			if (name) return name === street
		}
		return false
	}
	const best = (points, street, from) => {
		let found = null
		let d = Infinity
		for (const [x, y] of points) {
			const spot = facadeOf(x, y)
			if (!spot || !faces(spot, street)) continue
			const dd = Math.hypot(spot.x - from.x, spot.y - from.y)
			if (dd < d) [found, d] = [spot, dd]
		}
		return found
	}
	const seen = new Set()
	const doors = []

	for (const a of [...raw].sort((p, q) => !!p.ring - !!q.ring)) {
		const key = `${a.street}|${a.number}`
		if (seen.has(key)) continue
		let spot
		if (a.ring) {
			const mids = a.ring.slice(1).map((p, i) => [(p.x + a.ring[i].x) / 2, (p.y + a.ring[i].y) / 2])
			const cx = a.ring.reduce((s, p) => s + p.x, 0) / a.ring.length
			const cy = a.ring.reduce((s, p) => s + p.y, 0) / a.ring.length
			spot = best(mids, a.street, { x: cx, y: cy })
		} else {
			const here = facadeOf(a.x, a.y)
			spot =
				here && faces(here, a.street)
					? here
					: best(
							Array.from({ length: 8 }, (_, i) => [a.x + Math.cos(i * 0.785) * AROUND, a.y + Math.sin(i * 0.785) * AROUND]),
							a.street,
							a,
						)
		}
		if (!spot) continue
		seen.add(key)
		const { x, y, nx, ny, out } = spot
		doors.push({ street: a.street, number: a.number, x, y, nx, ny, out })
	}
	return doors
}

export function packAddresses(doors) {
	const streets = [...new Set(doors.map((d) => d.street))]
	const index = new Map(streets.map((s, i) => [s, i]))
	const r = (v, k = 10) => Math.round(v * k) / k
	return {
		streets,
		doors: doors.flatMap((d) => [index.get(d.street), r(d.x), r(d.y), r(d.nx, 1000), r(d.ny, 1000), r(d.out)]),
		numbers: doors.map((d) => d.number),
	}
}

export function addressesOf(world) {
	const packed = world.addresses
	if (!packed) return []
	return packed.numbers.map((number, i) => {
		const [s, x, y, nx, ny, out] = packed.doors.slice(i * 6, i * 6 + 6)
		return { street: packed.streets[s], number, x, y, nx, ny, stand: { x: x + nx * out, y: y + ny * out } }
	})
}
