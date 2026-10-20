// Cars: a 2D rigid body on four tyres, after Pat Kerr's 1996 prototype for
// GTA 1 (https://patkerr.co.uk/2d-vehicles/). Each tyre resists rolling a
// little and sliding sideways a lot, both in proportion to its speed; that
// alone makes a car steer, drift and spin. Lengths are tiles, forces are per
// unit of mass.
import { SOLID, T } from './tiles.js'
import { MODELS } from './models.js'

export const { length: LENGTH, width: WIDTH } = MODELS.car // an ordinary car, for spacing traffic
const REVERSE = 0.5
const HANDBRAKE_GRIP = 0.35 // rear sideways grip left with the handbrake on
const HANDBRAKE_ROLLING = 6
const OFF_ROAD = 3 // rolling resistance on grass and earth
const STEP = 1 / 120
const GRAVITY = 9.81 // m/s²

// Everything about a model's shape the physics needs, worked out once.
const shapes = new Map()
function shapeOf(m) {
	if (shapes.has(m)) return shapes.get(m)
	const hl = m.length / 2
	const hw = m.width / 2
	const axle = hl * 0.66
	// Checked against walls: corners and points along each side, no further
	// apart than half a tile, so no building corner slips between them.
	const hull = []
	const n = Math.ceil(m.length / 0.5)
	for (let i = 0; i <= n; i++) hull.push([-hl + (i * m.length) / n, hw], [-hl + (i * m.length) / n, -hw])
	hull.push([hl, 0], [-hl, 0])
	// For bumping into other cars and people: a row of overlapping circles.
	const r = hw
	const k = Math.max(2, Math.ceil((m.length - 2 * r) / (r * 1.2)) + 1)
	const discs = Array.from({ length: k }, (_, i) => -hl + r + (i * (m.length - 2 * r)) / (k - 1))
	const shape = {
		tyres: [
			[axle, -hw * 0.7, true],
			[axle, hw * 0.7, true],
			[-axle, -hw * 0.7, false],
			[-axle, hw * 0.7, false],
		],
		hull,
		discs,
		r,
		inertia: (m.length ** 2 + m.width ** 2) / 12, // a uniform box, per unit of mass
	}
	shapes.set(m, shape)
	return shape
}

export function createCar({ x, y, angle = 0, color, speed = 0, model = MODELS.car }) {
	const shape = shapeOf(model)
	return {
		x,
		y,
		angle,
		vx: Math.cos(angle) * speed,
		vy: Math.sin(angle) * speed,
		spin: 0,
		steer: 0,
		model,
		shape,
		color: color ?? model.colors[Math.floor(Math.random() * model.colors.length)],
		braking: false,
		tyres: shape.tyres.map(([lx, ly, front]) => ({ lx, ly, front, skid: false, mark: null })),
		throttle: 0,
		slip: 0,
		impact: 0,
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

// An impulse per unit of this car's mass.
function push(c, ix, iy, px, py) {
	c.vx += ix
	c.vy += iy
	c.spin += ((px - c.x) * iy - (py - c.y) * ix) / c.shape.inertia
}

// controls: throttle −1…1 (negative brakes, then reverses), turn −1…1, handbrake,
// and hold, for a foot on the brake while waiting.
export function driveCar(c, controls, world, dt) {
	c.throttle = controls.throttle ?? 0
	c.slip = 0
	c.impact = 0
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
	const m = c.model
	// Brakes until the car stops, then reverses gently.
	c.braking = (throttle < 0 && forward > 0.1) || hold
	const engine = throttle * (c.braking ? m.brake : throttle < 0 ? m.engine * REVERSE : m.engine)
	// Air resistance, against the direction of travel.
	const speed = Math.hypot(c.vx, c.vy)
	let fx = cos * engine - m.drag * speed * c.vx
	let fy = sin * engine - m.drag * speed * c.vy
	let torque = 0
	// Gravity pulls down the slope, except on a parked car nobody's driving.
	if (world.slopeAt && (throttle || speed > 0.2)) {
		const [sx, sy] = world.slopeAt(c.x, c.y)
		fx -= (GRAVITY / world.tileM) * sx
		fy -= (GRAVITY / world.tileM) * sy
	}

	// Less lock the faster you go, or the front tyres scrub off all your speed.
	const lock = m.steer / (1 + Math.max(0, forward - 2) * m.steerFade)
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
		c.slip = Math.max(c.slip, Math.abs(lateral), c.braking || hand ? Math.abs(rolling) * 0.4 : 0)
		const kr = m.rolling * rough * (hand ? HANDBRAKE_ROLLING : 1)
		const kl = m.lateral * (hand ? HANDBRAKE_GRIP : 1)
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
	c.spin += (torque / c.shape.inertia) * dt
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
		for (const [lx, ly] of c.shape.hull) {
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
	c.impact = Math.max(c.impact, -vn)
	const arm = (px - c.x) * ny - (py - c.y) * nx
	const j = (-(1 + bounce) * vn) / (1 + (arm * arm) / c.shape.inertia)
	push(c, nx * j, ny * j, px, py)
	// Scraping along the wall slows you down.
	const tx = -ny
	const ty = nx
	const vt = vx * tx + vy * ty
	const armT = (px - c.x) * ty - (py - c.y) * tx
	const jt = Math.max(-friction * j, Math.min(friction * j, -vt / (1 + (armT * armT) / c.shape.inertia)))
	push(c, tx * jt, ty * jt, px, py)
}

const discs = (c) => c.shape.discs.map((d) => toWorld(c, d, 0))

// Cars bumping into each other. A bus shoves a Kleinwagen aside; the other
// way round, not so much.
export function collideCars(cars) {
	for (let i = 0; i < cars.length; i++) {
		const a = cars[i]
		for (let j = i + 1; j < cars.length; j++) {
			const b = cars[j]
			const reach = (a.model.length + b.model.length) / 2
			if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) continue
			for (const [ax, ay] of discs(a)) {
				for (const [bx, by] of discs(b)) {
					const dx = ax - bx
					const dy = ay - by
					const d = Math.hypot(dx, dy)
					const touch = a.shape.r + b.shape.r
					if (d >= touch || d === 0) continue
					const nx = dx / d
					const ny = dy / d
					// Each gives way in proportion to the other's mass.
					const share = b.model.mass / (a.model.mass + b.model.mass)
					a.x += nx * (touch - d) * share
					a.y += ny * (touch - d) * share
					b.x -= nx * (touch - d) * (1 - share)
					b.y -= ny * (touch - d) * (1 - share)
					const px = (ax + bx) / 2
					const py = (ay + by) / 2
					const [avx, avy] = pointVelocity(a, px, py)
					const [bvx, bvy] = pointVelocity(b, px, py)
					const vn = (avx - bvx) * nx + (avy - bvy) * ny
					if (vn >= 0) continue
					a.impact = Math.max(a.impact, -vn)
					b.impact = Math.max(b.impact, -vn)
					const armA = (px - a.x) * ny - (py - a.y) * nx
					const armB = (px - b.x) * ny - (py - b.y) * nx
					const ma = a.model.mass
					const mb = b.model.mass
					const k = (-(1 + 0.3) * vn) / (1 / ma + 1 / mb + (armA * armA) / (ma * a.shape.inertia) + (armB * armB) / (mb * b.shape.inertia))
					push(a, (nx * k) / ma, (ny * k) / ma, px, py)
					push(b, (-nx * k) / mb, (-ny * k) / mb, px, py)
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
		const touch = c.shape.r + r
		if (d >= touch || d === 0) continue
		const [vx, vy] = pointVelocity(c, cx, cy)
		impact = Math.max(impact, (vx * dx + vy * dy) / d, 0.001)
		p.x += (dx / d) * (touch - d)
		p.y += (dy / d) * (touch - d)
	}
	return impact
}

// How far (x, y) is from the car's outline, 0 inside.
export function distanceTo(c, x, y) {
	const dx = x - c.x
	const dy = y - c.y
	const u = Math.abs(dx * Math.cos(c.angle) + dy * Math.sin(c.angle)) - c.model.length / 2
	const v = Math.abs(-dx * Math.sin(c.angle) + dy * Math.cos(c.angle)) - c.model.width / 2
	return Math.hypot(Math.max(0, u), Math.max(0, v))
}
