// Walking, cycling and bumping into things.
import { T, SOLID } from './tiles.js'

const RADIUS = 0.3 // tiles
const BIKE_REACH = 1.5 // how close you must be to hop on

export function createPlayer(start) {
	return {
		x: start.x,
		y: start.y,
		dir: 0,
		speed: 0,
		onBike: false,
		bike: { x: start.x + 1.2, y: start.y },
	}
}

export const nearBike = (p) => !p.onBike && Math.hypot(p.bike.x - p.x, p.bike.y - p.y) < BIKE_REACH

export function toggleBike(p) {
	if (p.onBike) {
		p.onBike = false
		p.bike.x = p.x
		p.bike.y = p.y
	} else if (nearBike(p)) {
		p.onBike = true
	}
}

export function updatePlayer(p, axis, turbo, world, dt) {
	const here = world.tileAt(p.x, p.y)
	// Tiles per second. One tile is 3 m.
	let max = p.onBike ? 3.6 : 1.6
	if (p.onBike && (here === T.GRASS || here === T.GROUND)) max *= 0.55
	if (p.onBike && here === T.CYCLEWAY) max *= 1.2
	const boost = turbo ? 10 : 1
	max *= boost

	if (axis.x || axis.y) {
		let diff = Math.atan2(axis.y, axis.x) - p.dir
		diff = Math.atan2(Math.sin(diff), Math.cos(diff))
		p.dir += diff * Math.min(1, dt * (p.onBike ? 6 : 14))
		p.speed += dt * (p.onBike ? 4 : 12) * boost
	} else {
		p.speed = Math.max(0, p.speed - dt * (p.onBike ? 3 : 14) * boost)
	}
	p.speed = Math.min(p.speed, max)

	const solid = (x, y) => SOLID.has(world.tileAt(x, y))
	const free = (x, y) =>
		!solid(x - RADIUS, y - RADIUS) && !solid(x + RADIUS, y - RADIUS) && !solid(x - RADIUS, y + RADIUS) && !solid(x + RADIUS, y + RADIUS)
	const nx = p.x + Math.cos(p.dir) * p.speed * dt
	const ny = p.y + Math.sin(p.dir) * p.speed * dt
	if (free(nx, p.y)) p.x = nx
	else p.speed *= 0.5
	if (free(p.x, ny)) p.y = ny
	else p.speed *= 0.5
}
