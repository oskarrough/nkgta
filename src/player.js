// Walking, cycling, driving and bumping into things.
import { T, SOLID } from './tiles.js'
import { driveCar, speedOf, toWorld } from './car.js'

const RADIUS = 0.3 // tiles
const BIKE_REACH = 1.5 // how close you must be to hop on
const NUDGE = 0.45 // tiles you get eased sideways round a corner

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
	const step = p.speed * dt
	const fromX = p.x
	const fromY = p.y
	slide(p, Math.cos(p.dir) * step, 0, free)
	slide(p, 0, Math.sin(p.dir) * step, free)
	// Walls cost you the part of your speed that went into them, nothing more.
	if (dt > 0) p.speed = Math.min(p.speed, Math.hypot(p.x - fromX, p.y - fromY) / dt)
}

// Move along one axis. Blocked, look for a gap just to the side and drift
// towards it, so you round corners and find doorways without lining up to
// the pixel. Otherwise stay put against the wall.
function slide(p, dx, dy, free) {
	if (!dx && !dy) return
	if (free(p.x + dx, p.y + dy)) {
		p.x += dx
		p.y += dy
		return
	}
	const pace = Math.abs(dx + dy)
	for (let off = 0.05; off <= NUDGE; off += 0.05) {
		for (const side of [-1, 1]) {
			const ox = dy ? side * off : 0
			const oy = dx ? side * off : 0
			if (free(p.x + ox, p.y + oy) && free(p.x + ox + dx, p.y + oy + dy)) {
				const k = Math.min(1, pace / off)
				p.x += ox * k
				p.y += oy * k
				return
			}
		}
	}
}
