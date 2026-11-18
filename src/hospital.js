import { nearestTile, T, SOLID } from './tiles.js'

import { nearestPlace } from './places.js'

const REACH = 8 // tiles out from the campus edge to look for pavement

export const nearestHospital = (pois, x, y) => nearestPlace(pois, x, y, Infinity, 'hospital')

export function hospitalDoor(ring, tileAt) {
	if (!ring?.length) return null
	let cx = 0
	let cy = 0
	for (const p of ring) {
		cx += p.x
		cy += p.y
	}
	cx /= ring.length
	cy /= ring.length
	let best = null
	let bestD = Infinity
	const n = ring.length
	for (let i = 0; i < n; i++) {
		const a = ring[i]
		const b = ring[(i + 1) % n]
		const len = Math.hypot(b.x - a.x, b.y - a.y)
		const steps = Math.max(1, Math.ceil(len * 2))
		for (let s = 0; s < steps; s++) {
			const t = s / steps
			const x = a.x + (b.x - a.x) * t
			const y = a.y + (b.y - a.y) * t
			const ox = x - cx
			const oy = y - cy
			const ol = Math.hypot(ox, oy) || 1
			const nx = ox / ol
			const ny = oy / ol
			for (let d = 0.4; d <= REACH; d += 0.4) {
				const px = x + nx * d
				const py = y + ny * d
				if (tileAt(px, py) !== T.SIDEWALK) continue
				const street = [-2, -1, 0, 1, 2].some((dx) => [-2, -1, 0, 1, 2].some((dy) => tileAt(px + dx, py + dy) === T.ROAD))
				const score = d + (street ? 0 : 4)
				if (score < bestD) {
					bestD = score
					best = { x: px, y: py, dir: Math.atan2(-ny, -nx) }
				}
				break
			}
		}
	}
	return best ?? walkableNear(cx, cy, tileAt, { x: cx, y: cy, dir: 0 })
}

function walkableNear(x, y, tileAt, fallback) {
	return (
		nearestTile((x | 0) + 0.5, (y | 0) + 0.5, 39, (px, py) =>
			SOLID.has(tileAt(px, py)) ? null : { x: px, y: py, dir: Math.atan2(y - py, x - px) },
		) ?? fallback
	)
}

export function hospitalWake(pois, x, y, tileAt) {
	const h = nearestHospital(pois, x, y)
	if (!h) return null
	const at = walkableNear(h.x, h.y, tileAt, h)
	return { x: at.x, y: at.y, dir: h.dir ?? at.dir ?? 0 }
}
