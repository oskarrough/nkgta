// The space you're standing in, for the ears. The walk grid knows every wall,
// so a handful of rays over building tiles tells a Hinterhof or a Durchfahrt
// from an open street from Tempelhofer Feld. Water doesn't count: it doesn't
// stop sound.
import { T } from './tiles.js'

const RAYS = 16
const REACH = 12 // tiles, how far a wall still counts (36 m)
const STEP = 0.5 // tiles between samples along a ray
const TURN = 0.2 // radians, keeps the rays off the grid's axes
const ANGLES = Array.from({ length: RAYS }, (_, i) => TURN + (i / RAYS) * Math.PI * 2)
const smoothstep = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return t * t * (3 - 2 * t)
}

// How enclosed (x, y) is, 0 open to 1 shut in: each ray that meets a wall
// counts for more the nearer the wall is.
export function enclosure(world, x, y) {
	let total = 0
	for (const a of ANGLES) {
		const dx = Math.cos(a) * STEP
		const dy = Math.sin(a) * STEP
		for (let d = STEP; d <= REACH; d += STEP)
			if (world.tileAt(x + dx * (d / STEP), y + dy * (d / STEP)) === T.BUILDING) {
				total += 1 - d / REACH
				break
			}
	}
	// An ordinary street is a canyon of two walls; only a yard or a passage shuts in.
	return smoothstep(0.3, 0.75, total / RAYS)
}

// How much building stands between a source and the listener, 0 clear to 1
// well muffled. The wall a source sits in doesn't count, nor the one you're
// standing in the door of.
const SKIRT = 2 // tiles around each end
const THICK = 3 // tiles of wall for the full effect
export function muffling(world, from, to) {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const len = Math.hypot(dx, dy)
	let wall = 0
	for (let d = SKIRT; d < len - SKIRT; d += STEP)
		if (world.tileAt(from.x + (dx * d) / len, from.y + (dy * d) / len) === T.BUILDING) wall += STEP
	return Math.min(1, wall / THICK)
}
