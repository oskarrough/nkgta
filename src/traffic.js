// Traffic: cars driving the road network on the right, parked cars along the
// kerbs, both popping in out of sight around the player, GTA 1 style.
import { createCar, driveCar, collideCars, shoveOut, forwardSpeed, speedOf, toWorld, distanceTo, LENGTH, WIDTH } from './car.js'
import { SOLID } from './tiles.js'
import { roadGraph, pointAt, project } from './roads.js'
import { createJunctions } from './junctions.js'

// Silver, black, white, grey, dark blue, red, dark green, Berlin taxi ivory.
const COLORS = ['#b8bcc2', '#1d1f22', '#e8e8e4', '#6b6f75', '#23365c', '#a3231f', '#2f4a3a', '#ede6c8']
const LOOKAHEAD = 1.6 // tiles, plus a bit more per tile/s
const PER_CAR = 15 // tiles of lane per moving car
const PER_PARKED = 12 // tiles of kerb per parked car
const SHOUTS = ['Ey! Mein Auto!', 'Hilfe! Polizei!', 'Alter, was soll das?', 'Mein Auto! Spinnst du?', 'Na toll.']

export function createTraffic(world) {
	const edges = roadGraph(world)
	const signals = []
	for (let i = 0; i < (world.signals?.length ?? 0); i += 2) signals.push({ x: world.signals[i], y: world.signals[i + 1] })
	const junctions = createJunctions(edges, signals)
	const cars = []
	const peds = [] // drivers thrown out of their cars, running off
	let started = false

	function pick(list, weight) {
		let r = Math.random() * list.reduce((s, e) => s + weight(e), 0)
		for (const e of list) if ((r -= weight(e)) <= 0) return e
		return list.at(-1)
	}

	function fits(x, y, angle) {
		if (cars.some((c) => Math.hypot(c.x - x, c.y - y) < LENGTH * 1.3)) return false
		const probe = { x, y, angle }
		for (const [u, v] of [
			[1, 1],
			[1, -1],
			[-1, 1],
			[-1, -1],
		]) {
			const [px, py] = toWorld(probe, (u * LENGTH) / 2, (v * WIDTH) / 2)
			if (SOLID.has(world.tileAt(px, py))) return false
		}
		return true
	}

	// A spot on a random lane (or kerb) inside the ring, out of sight.
	function spawn(near, ring, view, parked) {
		for (let tries = 0; tries < 20; tries++) {
			const edge = pick(near, (e) => e.len)
			const s = Math.random() * edge.len
			const p = pointAt(parked ? edge.kerb : edge.lane, s)
			const d = Math.hypot(p.x - ring.x, p.y - ring.y)
			if (d > ring.max || d < 3 || (started && inView(view, p.x, p.y, 2))) continue
			if (!fits(p.x, p.y, p.dir)) continue
			const color = COLORS[Math.floor(Math.random() * COLORS.length)]
			const car = createCar({ x: p.x, y: p.y, angle: p.dir, color, speed: parked ? 0 : edge.speed * 0.8 })
			if (!parked) car.ai = { edge, next: nextEdge(edge), s, stuck: 0, reversing: 0, blocked: 0, ignore: 0 }
			cars.push(car)
			return
		}
	}

	function aiControls(c, player, dt) {
		const ai = c.ai
		ai.s = project(ai.edge.lane, c.x, c.y)
		if (ai.s > ai.edge.len - 0.3) {
			if (!ai.next) return null
			ai.edge = ai.next
			ai.next = nextEdge(ai.edge)
			ai.s = project(ai.edge.lane, c.x, c.y)
		}
		const fwd = forwardSpeed(c)
		const cos = Math.cos(c.angle)
		const sin = Math.sin(c.angle)
		const local = (x, y) => [(x - c.x) * cos + (y - c.y) * sin, -(x - c.x) * sin + (y - c.y) * cos]

		// Steer for a point a little way up the lane.
		const target = along(ai, LOOKAHEAD + Math.max(0, fwd) * 0.5)
		const [tx, ty] = local(target.x, target.y)
		const aim = Math.atan2(ty, tx)

		// Slow for bends ahead, and for anything in the way.
		const bend = along(ai, 3 + fwd)
		const turnAhead = Math.abs(Math.atan2(Math.sin(bend.dir - c.angle), Math.cos(bend.dir - c.angle)))
		let want = ai.edge.speed * Math.max(0.35, 1 - turnAhead / 1.6)
		if (Math.abs(aim) > 1) want = Math.min(want, 1.2)

		// Red lights and right of way, at this lane's stop line or the next one's.
		for (const [e, gap] of [
			[ai.edge, ai.edge.stop - ai.s],
			[ai.next, ai.edge.len - ai.s + (ai.next?.stop ?? 0)],
		]) {
			if (e?.stop === undefined || !junctions.wait(c, e, gap)) continue
			want = Math.min(want, gap > 0.1 ? Math.sqrt(4 * (gap - 0.1)) : 0)
		}

		ai.ignore = Math.max(0, ai.ignore - dt)
		let blocked = false
		if (!ai.ignore) {
			const others = [...cars.filter((o) => o !== c), player.car ? null : player].filter(Boolean)
			for (const o of others) {
				const [ox, oy] = local(o.x, o.y)
				if (ox <= 0 || ox > LENGTH + 2 + fwd * 1.2 || Math.abs(oy) > WIDTH * 1.3) continue
				want = Math.min(want, Math.max(0, (ox - LENGTH - 0.3) * 1.2))
				blocked = true
			}
		}
		// Two cars waiting on each other: after a while one just goes.
		ai.blocked = blocked && fwd < 0.2 ? ai.blocked + dt : 0
		if (ai.blocked > 3 + Math.random()) ai.ignore = 1.5

		// Wedged against something: back up a little.
		ai.stuck = !blocked && want > 1 && Math.abs(fwd) < 0.2 ? ai.stuck + dt : 0
		if (ai.stuck > 1.5) ai.reversing = 1.2
		if (ai.reversing > 0) {
			ai.reversing -= dt
			return { throttle: -1, turn: -Math.sign(aim) }
		}

		return {
			throttle: Math.max(-1, Math.min(1, (want - fwd) * 1.5)),
			hold: want < 0.3,
			turn: Math.max(-1, Math.min(1, aim * 2.5)),
		}
	}

	// Lanes running into the edge of the map lead nowhere.
	function nextEdge(edge) {
		const out = edge.to.out.filter((e) => e !== edge.twin)
		const onMap = out.filter((e) => !e.to.off)
		const choices = onMap.length ? onMap : out
		return choices.length ? choices[Math.floor(Math.random() * choices.length)] : edge.twin
	}

	// Walk the route ahead of the car, onto the next lane if need be.
	function along(ai, ahead) {
		const s = ai.s + ahead
		if (s <= ai.edge.len || !ai.next) return pointAt(ai.edge.lane, Math.min(s, ai.edge.len))
		return pointAt(ai.next.lane, Math.min(s - ai.edge.len, ai.next.len))
	}

	function update(dt, player, view) {
		const ring = {
			x: player.x,
			y: player.y,
			max: Math.hypot(view.x1 - view.x0, view.y1 - view.y0) / 2 + 20,
		}
		const near = edges.filter((e) => Math.hypot(e.mid.x - ring.x, e.mid.y - ring.y) < ring.max)
		const laneLength = near.reduce((s, e) => s + e.len, 0)

		// Out of sight and far away: gone, unless it's a car you've driven.
		for (let i = cars.length - 1; i >= 0; i--) {
			const c = cars[i]
			if (c.kept || inView(view, c.x, c.y, 4) || Math.hypot(c.x - ring.x, c.y - ring.y) < ring.max + 10) continue
			cars.splice(i, 1)
		}
		const moving = cars.filter((c) => c.ai).length
		const parked = cars.length - moving
		if (near.length) {
			// All at once on the first frame, then a couple per frame.
			for (let i = 0, n = started ? 2 : 999; i < n && moving + i < Math.min(80, laneLength / PER_CAR); i++) spawn(near, ring, view, false)
			for (let i = 0, n = started ? 2 : 999; i < n && parked + i < Math.min(60, laneLength / 2 / PER_PARKED); i++)
				spawn(near, ring, view, true)
		}
		started = true
		junctions.update(cars, dt)

		for (let i = cars.length - 1; i >= 0; i--) {
			const c = cars[i]
			if (c === player.car) continue
			if (c.ai) {
				const controls = aiControls(c, player, dt)
				if (controls) driveCar(c, controls, world, dt)
				else cars.splice(i, 1) // a dead end
			} else if (speedOf(c) > 0.01 || Math.abs(c.spin) > 0.01) {
				driveCar(c, { handbrake: true }, world, dt)
			}
		}
		collideCars(cars)
		// How hard the player got hit, if they're on foot or on the bike.
		let hit = 0
		if (!player.car) for (const c of cars) hit = Math.max(hit, shoveOut(c, player, 0.3))

		for (let i = peds.length - 1; i >= 0; i--) {
			const p = peds[i]
			if ((p.t -= dt) < 0) peds.splice(i, 1)
			const nx = p.x + Math.cos(p.dir) * 2.2 * dt
			const ny = p.y + Math.sin(p.dir) * 2.2 * dt
			if (SOLID.has(world.tileAt(nx, ny))) p.dir += 1.5
			else Object.assign(p, { x: nx, y: ny })
		}
		return hit
	}

	// A car close enough to get into, and slow enough to jump.
	function enterable(x, y) {
		let best = null
		let bestD = 0.8
		for (const c of cars) {
			const d = distanceTo(c, x, y)
			if (d < bestD && speedOf(c) < 1.5) [best, bestD] = [c, d]
		}
		return best
	}

	// Into the driver's seat. Whoever was driving gets out and legs it.
	function steal(c, say) {
		if (c.ai) {
			const [x, y] = toWorld(c, 0, -WIDTH / 2 - 0.35)
			peds.push({ x, y, dir: c.angle - Math.PI / 2 + (Math.random() - 0.5), t: 4 })
			say(SHOUTS[Math.floor(Math.random() * SHOUTS.length)])
			c.ai = null
		}
		c.kept = true
	}

	return { cars, peds, update, enterable, steal, lights: junctions.lights }
}

const inView = (v, x, y, pad) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad
