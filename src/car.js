// Cars: a 2D rigid body on four tyres, after Pat Kerr's 1996 prototype for
// GTA 1 (https://patkerr.co.uk/2d-vehicles/). Each tyre resists rolling a
// little and sliding sideways a lot, both in proportion to its speed; that
// alone makes a car steer, drift and spin. Lengths are tiles, forces are per
// unit of mass.
import { SOLID, T } from './tiles.js'

export const LENGTH = 1.5 // 4.5 m
export const WIDTH = 0.66
const INERTIA = (LENGTH ** 2 + WIDTH ** 2) / 12 // a uniform box, per unit of mass
const ENGINE = 3.4 // tiles/s², about 1 g
const REVERSE = 0.5
const ROLLING = 0.08 // per tyre, per second: top speed ENGINE / (4 × ROLLING), about 100 km/h
const LATERAL = 1.2
const STEER = 0.55 // radians at full lock, standing still
const STEER_FADE = 0.25 // per tile/s above 2
const HANDBRAKE_GRIP = 0.35 // rear sideways grip left with the handbrake on
const HANDBRAKE_ROLLING = 6
const OFF_ROAD = 3 // rolling resistance on grass and earth
const STEP = 1 / 120

const TYRES = [
	[0.5, -0.23, true],
	[0.5, 0.23, true],
	[-0.5, -0.23, false],
	[-0.5, 0.23, false],
]
// Where the body is checked against walls: corners and the middle of each side.
const HULL = [
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
].map(([u, v]) => [(u * LENGTH) / 2, (v * WIDTH) / 2])
// For bumping into other cars and people: three overlapping circles.
const DISCS = [-0.42, 0, 0.42]
const DISC_R = WIDTH / 2

export function createCar({ x, y, angle = 0, color = '#888', speed = 0 }) {
	return {
		x,
		y,
		angle,
		vx: Math.cos(angle) * speed,
		vy: Math.sin(angle) * speed,
		spin: 0,
		steer: 0,
		color,
		braking: false,
		tyres: TYRES.map(([lx, ly, front]) => ({ lx, ly, front, skid: false, mark: null })),
		marks: [], // skid mark segments [x0, y0, x1, y1] waiting to be painted
	}
}

// Car-local to world, and the velocity of a world point riding on the car.
export const toWorld = (c, lx, ly) => [
	c.x + lx * Math.cos(c.angle) - ly * Math.sin(c.angle),
	c.y + lx * Math.sin(c.angle) + ly * Math.cos(c.angle),
]
const pointVelocity = (c, px, py) => [c.vx - c.spin * (py - c.y), c.vy + c.spin * (px - c.x)]
export const forwardSpeed = (c) => c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle)
export const speedOf = (c) => Math.hypot(c.vx, c.vy)

function push(c, ix, iy, px, py) {
	c.vx += ix
	c.vy += iy
	c.spin += ((px - c.x) * iy - (py - c.y) * ix) / INERTIA
}

// controls: throttle −1…1 (negative brakes, then reverses), turn −1…1, handbrake,
// and hold, for a foot on the brake while waiting.
export function driveCar(c, controls, world, dt) {
	const steps = Math.ceil(dt / STEP)
	for (let i = 0; i < steps; i++) step(c, controls, world, dt / steps)

	// Rear tyres sliding sideways leave marks.
	for (const t of c.tyres) {
		const [x, y] = toWorld(c, t.lx, t.ly)
		if (t.skid && t.mark) c.marks.push([t.mark[0], t.mark[1], x, y])
		t.mark = t.skid ? [x, y] : null
	}
}

function step(c, { throttle = 0, turn = 0, handbrake = false, hold = false }, world, dt) {
	const cos = Math.cos(c.angle)
	const sin = Math.sin(c.angle)
	const forward = c.vx * cos + c.vy * sin
	// Brakes at full force until the car stops, then reverses gently.
	c.braking = (throttle < 0 && forward > 0.1) || hold
	const engine = throttle * ENGINE * (throttle < 0 && !c.braking ? REVERSE : 1)
	let fx = cos * engine
	let fy = sin * engine
	let torque = 0

	// Less lock the faster you go, or the front tyres scrub off all your speed.
	const lock = STEER / (1 + Math.max(0, forward - 2) * STEER_FADE)
	c.steer += (turn * lock - c.steer) * Math.min(1, dt * 12)
	const ground = world.tileAt(c.x, c.y)
	const rough = ground === T.GROUND || ground === T.GRASS ? OFF_ROAD : 1
	for (const t of c.tyres) {
		const [px, py] = toWorld(c, t.lx, t.ly)
		const [vx, vy] = pointVelocity(c, px, py)
		const heading = c.angle + (t.front ? c.steer : 0)
		const rx = Math.cos(heading)
		const ry = Math.sin(heading)
		const rolling = vx * rx + vy * ry
		const lateral = vx * -ry + vy * rx
		const hand = handbrake && !t.front
		const kr = ROLLING * rough * (hand ? HANDBRAKE_ROLLING : 1)
		const kl = LATERAL * (hand ? HANDBRAKE_GRIP : 1)
		// Hysteresis, so marks don't flicker on and off at the threshold.
		t.skid = !t.front && Math.abs(lateral) > (t.skid ? 0.5 : 0.9)
		const tx = -kr * rolling * rx + kl * lateral * ry
		const ty = -kr * rolling * ry - kl * lateral * rx
		fx += tx
		fy += ty
		torque += (px - c.x) * ty - (py - c.y) * tx
	}

	// Semi-implicit Euler: velocity first, then position.
	c.vx += fx * dt
	c.vy += fy * dt
	c.spin += (torque / INERTIA) * dt
	c.x += c.vx * dt
	c.y += c.vy * dt
	c.angle += c.spin * dt
	hitWalls(c, world)
}

// Push the hull out of buildings and water, tile by tile, with a bounce that
// accounts for where it hit, so clipping a corner spins the car.
function hitWalls(c, world) {
	const solid = (x, y) => SOLID.has(world.tileAt(x, y))
	for (let pass = 0; pass < 3; pass++) {
		let hit = false
		for (const [lx, ly] of HULL) {
			const [px, py] = toWorld(c, lx, ly)
			if (!solid(px, py)) continue
			hit = true
			const tx = Math.floor(px)
			const ty = Math.floor(py)
			const fx = px - tx
			const fy = py - ty
			// Out through the nearest side that isn't another wall.
			const exits = [
				[-1, 0, fx],
				[1, 0, 1 - fx],
				[0, -1, fy],
				[0, 1, 1 - fy],
			].filter(([nx, ny]) => !solid(tx + nx + 0.5, ty + ny + 0.5))
			if (!exits.length) {
				const [vx, vy] = pointVelocity(c, px, py)
				exits.push(Math.abs(vx) > Math.abs(vy) ? [-Math.sign(vx), 0, 0.05] : [0, -Math.sign(vy), 0.05])
			}
			const [nx, ny, depth] = exits.reduce((a, b) => (b[2] < a[2] ? b : a))
			c.x += nx * (depth + 0.001)
			c.y += ny * (depth + 0.001)
			impulse(c, px + nx * depth, py + ny * depth, nx, ny, 0.3, 0.3)
		}
		if (!hit) break
	}
}

// Bounce one car off something immovable at point p with normal n.
function impulse(c, px, py, nx, ny, bounce, friction) {
	const [vx, vy] = pointVelocity(c, px, py)
	const vn = vx * nx + vy * ny
	if (vn >= 0) return
	const arm = (px - c.x) * ny - (py - c.y) * nx
	const j = (-(1 + bounce) * vn) / (1 + (arm * arm) / INERTIA)
	push(c, nx * j, ny * j, px, py)
	// Scraping along the wall slows you down.
	const tx = -ny
	const ty = nx
	const vt = vx * tx + vy * ty
	const armT = (px - c.x) * ty - (py - c.y) * tx
	const jt = Math.max(-friction * j, Math.min(friction * j, -vt / (1 + (armT * armT) / INERTIA)))
	push(c, tx * jt, ty * jt, px, py)
}

const discs = (c) => DISCS.map((d) => toWorld(c, d, 0))

// Cars bumping into each other, all the same mass.
export function collideCars(cars) {
	for (let i = 0; i < cars.length; i++) {
		const a = cars[i]
		for (let j = i + 1; j < cars.length; j++) {
			const b = cars[j]
			if (Math.abs(a.x - b.x) > LENGTH || Math.abs(a.y - b.y) > LENGTH) continue
			for (const [ax, ay] of discs(a)) {
				for (const [bx, by] of discs(b)) {
					const dx = ax - bx
					const dy = ay - by
					const d = Math.hypot(dx, dy)
					if (d >= DISC_R * 2 || d === 0) continue
					const nx = dx / d
					const ny = dy / d
					const overlap = (DISC_R * 2 - d) / 2
					a.x += nx * overlap
					a.y += ny * overlap
					b.x -= nx * overlap
					b.y -= ny * overlap
					const px = (ax + bx) / 2
					const py = (ay + by) / 2
					const [avx, avy] = pointVelocity(a, px, py)
					const [bvx, bvy] = pointVelocity(b, px, py)
					const vn = (avx - bvx) * nx + (avy - bvy) * ny
					if (vn >= 0) continue
					const armA = (px - a.x) * ny - (py - a.y) * nx
					const armB = (px - b.x) * ny - (py - b.y) * nx
					const k = (-(1 + 0.3) * vn) / (2 + (armA * armA + armB * armB) / INERTIA)
					push(a, nx * k, ny * k, px, py)
					push(b, -nx * k, -ny * k, px, py)
				}
			}
		}
	}
}

// Shove a person (or bike) at (x, y) with radius r out of the car. Returns
// how fast the car was coming at them, 0 if it missed.
export function shoveOut(c, p, r) {
	let impact = 0
	for (const [cx, cy] of discs(c)) {
		const dx = p.x - cx
		const dy = p.y - cy
		const d = Math.hypot(dx, dy)
		if (d >= DISC_R + r || d === 0) continue
		const [vx, vy] = pointVelocity(c, cx, cy)
		impact = Math.max(impact, (vx * dx + vy * dy) / d, 0.001)
		p.x += (dx / d) * (DISC_R + r - d)
		p.y += (dy / d) * (DISC_R + r - d)
	}
	return impact
}

// How far (x, y) is from the car's outline, 0 inside.
export function distanceTo(c, x, y) {
	const dx = x - c.x
	const dy = y - c.y
	const u = Math.abs(dx * Math.cos(c.angle) + dy * Math.sin(c.angle)) - LENGTH / 2
	const v = Math.abs(-dx * Math.sin(c.angle) + dy * Math.cos(c.angle)) - WIDTH / 2
	return Math.hypot(Math.max(0, u), Math.max(0, v))
}
