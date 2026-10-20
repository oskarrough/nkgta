// Walking, cycling, driving and bumping into things.
import { T, SOLID } from './tiles.js'
import { driveCar, speedOf, toWorld } from './car.js'

const RADIUS = 0.3 // tiles
const BIKE_REACH = 1.5 // how close you must be to hop on
const SUBSTEP = 0.1 // most tiles moved between wall checks, well under RADIUS
const NUDGE = 0.45 // tiles you get eased sideways round a corner you hit head on

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

export function updatePlayer(p, input, world, dt) {
	// In a car: up is gas, down is brake and reverse, left and right steer,
	// space is the handbrake. Touch asks the same question through `drive`.
	if (p.car) {
		const c = p.car
		driveCar(c, input.drive(c), world, dt)
		p.x = c.x
		p.y = c.y
		p.dir = c.angle
		p.speed = speedOf(c)
		return
	}
	const steering = input.steer?.()
	const axis = steering || input.axis()
	const turbo = input.turbo()
	const here = world.tileAt(p.x, p.y)
	// Tiles per second. One tile is 3 m, and a thumbstick pushed only part
	// of the way walks that much slower.
	const push = steering ? Math.abs(axis.y) : Math.min(1, Math.hypot(axis.x, axis.y))
	let max = (p.onBike ? 3.6 : 1.6) * push
	if (p.onBike && (here === T.GRASS || here === T.GROUND)) max *= 0.55
	if (p.onBike && here === T.CYCLEWAY) max *= 1.2
	// Uphill is slower going, on foot a little, on the bike a lot; downhill
	// is quicker.
	const back = steering && steering.y > 0 ? -1 : 1
	const [sx, sy] = world.slopeAt?.(p.x, p.y) ?? [0, 0]
	const grade = (sx * Math.cos(p.dir) + sy * Math.sin(p.dir)) * back
	max *= Math.max(0.45, Math.min(1.35, 1 - grade * (p.onBike ? 5 : 2.5)))
	const boost = turbo ? 10 : 1
	max *= boost

	if (steering) p.dir += steering.x * dt * (p.onBike ? 2.5 : 3.5)
	if (push) {
		let diff = steering ? 0 : Math.atan2(axis.y, axis.x) - p.dir
		diff = Math.atan2(Math.sin(diff), Math.cos(diff))
		p.dir += diff * Math.min(1, dt * (p.onBike ? 6 : 14))
		p.speed += dt * (p.onBike ? 4 : 12) * boost
	} else {
		p.speed = Math.max(0, p.speed - dt * (p.onBike ? 3 : 14) * boost)
	}
	p.speed = Math.min(p.speed, max)

	const step = p.speed * dt * (steering ? -steering.y : 1)
	const fromX = p.x
	const fromY = p.y
	const n = Math.ceil(Math.abs(step) / SUBSTEP)
	const ex = Math.cos(p.dir) * Math.sign(step)
	const ey = Math.sin(p.dir) * Math.sign(step)
	for (let i = 0; i < n; i++) {
		p.x += (ex * Math.abs(step)) / n
		p.y += (ey * Math.abs(step)) / n
		pushOut(p, world)
	}
	// Hardly got anywhere: a corner dead ahead. Drift towards whichever side
	// has room to go on.
	const pace = Math.abs(step)
	if (pace > 0 && (p.x - fromX) * ex + (p.y - fromY) * ey < pace * 0.3) {
		search: for (let off = 0.05; off <= NUDGE; off += 0.05) {
			for (const side of [-1, 1]) {
				const sx = p.x - ey * side * off
				const sy = p.y + ex * side * off
				if (clear(sx, sy, world) && clear(sx + ex * pace, sy + ey * pace, world)) {
					const k = Math.min(1, pace / off)
					p.x += (sx - p.x) * k
					p.y += (sy - p.y) * k
					break search
				}
			}
		}
	}
	// Sliding along a wall keeps your pace; only a wall you can't get round
	// stops you. Trimming to the distance made every frame would compound,
	// and a bike grazing a wall would grind to a halt.
	const made = Math.hypot(p.x - fromX, p.y - fromY)
	if (dt > 0 && made < pace * 0.25) p.speed = Math.min(p.speed, made / dt)
}

// You're round: a wall pushes you straight out of it, and what's left of
// your step carries on along it. Rasterised diagonals, all steps, feel like
// one slanted wall, and you round corners and find doorways without
// lining up to the pixel.
// No wall within RADIUS of (x, y).
function clear(x, y, world) {
	for (let ty = Math.floor(y - RADIUS); ty <= Math.floor(y + RADIUS); ty++) {
		for (let tx = Math.floor(x - RADIUS); tx <= Math.floor(x + RADIUS); tx++) {
			if (!SOLID.has(world.tileAt(tx, ty))) continue
			if (Math.hypot(x - Math.max(tx, Math.min(tx + 1, x)), y - Math.max(ty, Math.min(ty + 1, y))) < RADIUS) return false
		}
	}
	return true
}

function pushOut(p, world) {
	for (let pass = 0; pass < 3; pass++) {
		let moved = false
		for (let ty = Math.floor(p.y - RADIUS); ty <= Math.floor(p.y + RADIUS); ty++) {
			for (let tx = Math.floor(p.x - RADIUS); tx <= Math.floor(p.x + RADIUS); tx++) {
				if (!SOLID.has(world.tileAt(tx, ty))) continue
				// The nearest point of the tile, and how far into it you are.
				const dx = p.x - Math.max(tx, Math.min(tx + 1, p.x))
				const dy = p.y - Math.max(ty, Math.min(ty + 1, p.y))
				const d = Math.hypot(dx, dy)
				if (d >= RADIUS) continue
				if (d > 1e-6) {
					p.x += (dx / d) * (RADIUS - d)
					p.y += (dy / d) * (RADIUS - d)
				} else {
					// Centre inside the tile: out the nearest side.
					const sides = [
						[tx - RADIUS - p.x, 0],
						[tx + 1 + RADIUS - p.x, 0],
						[0, ty - RADIUS - p.y],
						[0, ty + 1 + RADIUS - p.y],
					]
					const [ox, oy] = sides.reduce((a, b) => (Math.hypot(...b) < Math.hypot(...a) ? b : a))
					p.x += ox
					p.y += oy
				}
				moved = true
			}
		}
		if (!moved) return
	}
}
