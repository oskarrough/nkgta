// Walking, cycling, driving and bumping into things.
import { T, SOLID } from './tiles.js'
import { driveCar, speedOf, toWorld } from './car.js'

const RADIUS = 0.3 // tiles
const BIKE_REACH = 1.5 // how close you must be to hop on

export function createPlayer(start) {
	return {
		x: start.x,
		y: start.y,
		dir: 0,
		speed: 0,
		onBike: false,
		car: null,
		bike: { x: start.x + 1.2, y: start.y },
	}
}

export const nearBike = (p) => !p.onBike && !p.car && Math.hypot(p.bike.x - p.x, p.bike.y - p.y) < BIKE_REACH

export function toggleBike(p) {
	if (p.onBike) {
		p.onBike = false
		p.bike.x = p.x
		p.bike.y = p.y
	} else if (nearBike(p)) {
		p.onBike = true
	}
}

// Out of the driver's door on the left, or the right if there's a wall.
export function leaveCar(p, world) {
	const c = p.car
	for (const side of [-1, 1]) {
		const [x, y] = toWorld(c, 0, side * (c.model.width / 2 + 0.4))
		if (SOLID.has(world.tileAt(x, y))) continue
		p.x = x
		p.y = y
		break
	}
	p.car = null
	p.speed = 0
}

export function updatePlayer(p, axis, turbo, world, dt) {
	// In a car: up is gas, down is brake and reverse, left and right steer,
	// space is the handbrake.
	if (p.car) {
		const c = p.car
		driveCar(c, { throttle: -axis.y, turn: axis.x, handbrake: turbo }, world, dt)
		p.x = c.x
		p.y = c.y
		p.dir = c.angle
		p.speed = speedOf(c)
		return
	}
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
