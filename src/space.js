import { T } from './tiles.js'

const RAYS = 16
const REACH = 12 // tiles, how far a wall still counts (36 m)
const STEP = 0.5 // tiles between samples along a ray
const TURN = 0.2 // radians, keeps the rays off the grid's axes
const DIRECTIONS = Array.from({ length: RAYS }, (_, i) => {
	const a = TURN + (i / RAYS) * Math.PI * 2
	return { x: Math.cos(a), y: Math.sin(a) }
})
const smoothstep = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return t * t * (3 - 2 * t)
}

// How enclosed (x, y) is, 0 open to 1 shut in: each ray that meets a wall
// counts for more the nearer the wall is.
export function enclosure(world, x, y) {
	let total = 0
	for (const dir of DIRECTIONS) {
		for (let d = STEP; d <= REACH; d += STEP)
			if (world.tileAt(x + dir.x * d, y + dir.y * d) === T.BUILDING) {
				total += 1 - d / REACH
				break
			}
	}
	// An ordinary street is a canyon of two walls; only a yard or a passage shuts in.
	return smoothstep(0.3, 0.75, total / RAYS)
}

// Ignore walls right at either end: a radio or listener can stand in a doorway.
const SKIRT = 2 // tiles around each end
const THICK = 3 // tiles of wall for the full effect
export function muffling(world, from, to) {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const len = Math.hypot(dx, dy)
	let wall = 0
	for (let d = SKIRT; d < len - SKIRT; d += STEP) {
		if (world.tileAt(from.x + (dx * d) / len, from.y + (dy * d) / len) !== T.BUILDING) continue
		wall += STEP
		if (wall >= THICK) return 1
	}
	return wall / THICK
}

// A kite needs grass around its runway and a clear launch radius, not just sky over a street.
export function kiteSpace(world, x, y) {
	let grass = 0
	for (const radius of [2, 5, 9]) {
		for (const dir of DIRECTIONS) {
			const t = world.tileAt(x + dir.x * radius, y + dir.y * radius)
			if (t === T.BUILDING || t === T.WATER || t === T.ROAD || t === T.PRIVATE) return false
			if (t === T.GRASS || t === T.PITCH) grass++
		}
	}
	return grass >= 8
}
