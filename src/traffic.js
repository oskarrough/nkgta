// Traffic: cars driving the road network on the right, parked cars along the
// kerbs, both popping in out of sight around the player, GTA 1 style.
import { createCar, driveCar, collideCars, shoveOut, forwardSpeed, speedOf, toWorld, distanceTo, LENGTH } from './car.js'
import { MODELS, pickModel } from './models.js'
import { SOLID } from './tiles.js'
import { roadGraph, pointAt, project } from './roads.js'
import { createJunctions } from './junctions.js'
import { createPedestrians } from './pedestrians.js'

const LOOKAHEAD = 1.6 // tiles, plus a bit more per tile/s, and for longer vehicles
const SIGHT = 25 // tiles up the lane a driver watches the car ahead
const PER_CAR = 15 // tiles of lane per moving car
const PER_PARKED = 12 // tiles of kerb per parked car
const SHOUTS = ['Ey! Mein {}!', 'Hilfe! Polizei!', 'Alter, was soll das?', 'Mein {}! Spinnst du?', 'Na toll.']
const BIG_ROAD = 4 // tiles wide: buses keep to these

export function createTraffic(world) {
	const edges = roadGraph(world)
	const signals = []
	for (let i = 0; i < (world.signals?.length ?? 0); i += 2) signals.push({ x: world.signals[i], y: world.signals[i + 1] })
	const junctions = createJunctions(edges, signals)
	const cars = []
	const busStops = (world.transit ?? []).filter((t) => t.kind === 'bus')
	const busLines = [...new Set(busStops.flatMap((t) => t.lines))]
	const walkers = createPedestrians(world, junctions)
	const runners = [] // drivers thrown out of their cars, running off
	const peds = [] // everyone on foot, for drawing
	let started = false

	function pick(list, weight) {
		let r = Math.random() * list.reduce((s, e) => s + weight(e), 0)
		for (const e of list) if ((r -= weight(e)) <= 0) return e
		return list.at(-1)
	}

	function fits(x, y, angle, model) {
		if (cars.some((c) => Math.hypot(c.x - x, c.y - y) < (c.model.length + model.length) / 2 + 0.4)) return false
		const probe = { x, y, angle }
		for (const [u, v] of [
			[1, 1],
			[1, -1],
			[-1, 1],
			[-1, -1],
		]) {
			const [px, py] = toWorld(probe, (u * model.length) / 2, (v * model.width) / 2)
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
			if (parked && junctions.near(p.x, p.y, 2)) continue
			const model = pickModel(!parked && edge.w >= BIG_ROAD)
			if (!fits(p.x, p.y, p.dir, model)) continue
			const car = createCar({ x: p.x, y: p.y, angle: p.dir, model, speed: parked ? 0 : edge.speed * 0.8 })
			if (model === MODELS.bus && busLines.length) car.line = busLines[Math.floor(Math.random() * busLines.length)]
			if (!parked) car.ai = { edge, next: nextEdge(edge, model), s, stuck: 0, reversing: 0, blocked: 0, ignore: 0, dwell: 0 }
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
			ai.next = nextEdge(ai.edge, c.model)
			ai.s = project(ai.edge.lane, c.x, c.y)
		}
		const fwd = forwardSpeed(c)
		const cos = Math.cos(c.angle)
		const sin = Math.sin(c.angle)
		const local = (x, y) => [(x - c.x) * cos + (y - c.y) * sin, -(x - c.x) * sin + (y - c.y) * cos]

		// Steer for a point a little way up the lane.
		const m = c.model
		const target = along(ai, LOOKAHEAD + Math.max(0, fwd) * 0.5 + (m.length - LENGTH) * 0.6)
		const [tx, ty] = local(target.x, target.y)
		const aim = Math.atan2(ty, tx)

		// The speed this driver likes here, less for bends ahead.
		const bend = along(ai, 3 + fwd)
		const turnAhead = Math.abs(Math.atan2(Math.sin(bend.dir - c.angle), Math.cos(bend.dir - c.angle)))
		let v0 = ai.edge.speed * m.pace * Math.max(0.35, 1 - turnAhead / 1.6)
		if (Math.abs(aim) > 1) v0 = Math.min(v0, 1.2)

		// Then brake for whatever's ahead, the hardest of them wins.
		const d = m.driver
		let worst = 0
		// Red lights and right of way, at this lane's stop line or the next one's:
		// a stopped car at the line. Stop lines are drawn for an ordinary car;
		// anything longer stops sooner.
		const longer = (m.length - LENGTH) / 2
		for (const [e, gap] of [
			[ai.edge, ai.edge.stop - ai.s - longer],
			[ai.next, ai.edge.len - ai.s + (ai.next?.stop ?? 0) - longer],
		]) {
			if (e?.stop === undefined || !junctions.wait(c, e, gap)) continue
			worst = Math.min(worst, stopAt(d, fwd, gap))
		}
		// People crossing the road we turn into: wait at the line, not in the
		// middle of the junction.
		const line = ai.edge.stop - ai.s - longer
		if (ai.next?.twin?.crosswalk?.busy && line > -0.3) worst = Math.min(worst, stopAt(d, fwd, line))

		// The car ahead in this lane or the next, however far up the road.
		for (const o of cars) {
			if (!o.ai || o === c) continue
			const ahead = o.ai.edge === ai.edge ? o.ai.s - ai.s : o.ai.edge === ai.next ? ai.edge.len - ai.s + o.ai.s : 0
			if (ahead <= 0 || ahead > SIGHT) continue
			worst = Math.min(worst, follow(d, fwd, ahead - (m.length + o.model.length) / 2, forwardSpeed(o)))
		}

		// And anything right in front: crossing, oncoming, parked badly, on foot.
		ai.ignore = Math.max(0, ai.ignore - dt)
		let blocked = false
		let standoff = false // blocked by someone crossing, coming the other way, or not driving at all
		if (!ai.ignore) {
			const others = [...cars.filter((o) => o !== c), player.car ? null : player, ...walkers.people].filter(Boolean)
			for (const o of others) {
				const [ox, oy] = local(o.x, o.y)
				// The other one's size seen along our heading and across it.
				const turned = (o.angle ?? o.dir) - c.angle
				const ol = (o.model?.length ?? 0.6) / 2
				const ow = (o.model?.width ?? 0.6) / 2
				const deep = Math.abs(Math.cos(turned)) * ol + Math.abs(Math.sin(turned)) * ow
				const wide = Math.abs(Math.sin(turned)) * ol + Math.abs(Math.cos(turned)) * ow
				const clear = ox - m.length / 2 - deep
				if (ox <= 0 || clear > 2 + fwd * 1.2 || Math.abs(oy) > m.width / 2 + wide + 0.1) continue
				const towards = (o.vx ?? 0) * cos + (o.vy ?? 0) * sin // its speed along our way
				worst = Math.min(worst, follow(d, fwd, clear - 0.3, towards))
				blocked = true
				// People crossing get all the time they need.
				if (!o.track && (Math.cos(turned) < 0.7 || (o.model && !o.ai && o !== player.car))) standoff = true
			}
		}
		if (m === MODELS.bus) worst = Math.min(worst, stopAt(d, fwd, busStop(c, local, dt)))
		const acc = freeRoad(d, fwd, v0) + worst

		// Two cars waiting on each other: after a while one just goes. A queue
		// is not a standoff; that just waits.
		ai.blocked = standoff && fwd < 0.2 ? ai.blocked + dt : 0
		if (ai.blocked > 3 + Math.random()) ai.ignore = 1.5

		// Wedged against something: back up a little.
		ai.stuck = !blocked && acc > d.a / 2 && Math.abs(fwd) < 0.2 ? ai.stuck + dt : 0
		if (ai.stuck > 1.5) ai.reversing = 1.2
		if (ai.reversing > 0) {
			ai.reversing -= dt
			return { throttle: -1, turn: -Math.sign(aim) }
		}

		// Standing and meaning to stay: foot on the brake.
		const hold = fwd < 0.3 && acc < d.a * 0.1
		return {
			throttle: hold ? Math.max(-1, Math.min(1, -fwd * 1.5)) : pedal(m, acc, fwd),
			hold,
			turn: Math.max(-1, Math.min(1, aim * 2.5)),
		}
	}

	// Buses pull in at each stop on their side of the road, open up for a
	// few seconds, and go on. How far to the next place to stop.
	function busStop(c, local, dt) {
		const ai = c.ai
		if (ai.dwell > 0) {
			ai.dwell -= dt
			return 0
		}
		for (const stop of busStops) {
			if (stop === ai.served || Math.abs(stop.x - c.x) > 6 || Math.abs(stop.y - c.y) > 6) continue
			const [ox, oy] = local(stop.x, stop.y)
			if (ox < -0.5 || ox > 6 || oy < 0 || oy > 3.5) continue
			if (ox < 0.6 && speedOf(c) < 0.3) {
				ai.dwell = 4
				ai.served = stop
			}
			return ox - 0.3
		}
		return Infinity
	}

	// Lanes running into the edge of the map lead nowhere, and buses keep to
	// the big roads where they can.
	function nextEdge(edge, model) {
		const out = edge.to.out.filter((e) => e !== edge.twin)
		const onMap = out.filter((e) => !e.to.off)
		let choices = onMap.length ? onMap : out
		const big = choices.filter((e) => e.w >= BIG_ROAD)
		if (model === MODELS.bus && big.length) choices = big
		return choices.length ? choices[Math.floor(Math.random() * choices.length)] : edge.twin
	}

	// Walk the route ahead of the car, onto the next lane if need be.
	function along(ai, ahead) {
		const s = ai.s + ahead
		if (s <= ai.edge.len || !ai.next) return pointAt(ai.edge.lane, Math.min(s, ai.edge.len))
		return pointAt(ai.next.lane, Math.min(s - ai.edge.len, ai.next.len))
	}

	function update(dt, player, view) {
		const first = !started
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

		for (let i = runners.length - 1; i >= 0; i--) {
			const p = runners[i]
			if ((p.t -= dt) < 0) runners.splice(i, 1)
			const nx = p.x + Math.cos(p.dir) * 2.2 * dt
			const ny = p.y + Math.sin(p.dir) * 2.2 * dt
			if (SOLID.has(world.tileAt(nx, ny))) p.dir += 1.5
			else Object.assign(p, { x: nx, y: ny })
		}
		walkers.update(dt, near, cars, (x, y) => first || !inView(view, x, y, 2), ring, first ? 999 : 6)
		peds.length = 0
		peds.push(...runners, ...walkers.people)
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
			const [x, y] = toWorld(c, 0, -c.model.width / 2 - 0.35)
			runners.push({ x, y, dir: c.angle - Math.PI / 2 + (Math.random() - 0.5), t: 4 })
			say(SHOUTS[Math.floor(Math.random() * SHOUTS.length)].replace('{}', c.model.noun))
			c.ai = null
		} else say(c.line ? `${c.model.name} ${c.line}` : c.model.name)
		c.kept = true
	}

	return { cars, peds, update, enterable, steal, lights: junctions.lights }
}

// The Intelligent Driver Model (Treiber, 2000) decides how hard to press gas
// and brake; the tyres still do the driving. `d` is the driver (see models.js),
// v our speed. On an empty road, ease up to the speed v0:
export const freeRoad = (d, v, v0) => d.a * (1 - (Math.max(0, v) / Math.max(v0, 0.1)) ** 4)

// ...and brake for something `gap` tiles ahead, bumper to bumper, going at `lead`:
// keep s0 standing and T seconds moving, more when closing in fast.
export function follow(d, v, gap, lead, s0 = d.s0, T = d.T) {
	const want = s0 + Math.max(0, v * T + (v * (v - lead)) / (2 * Math.sqrt(d.a * d.b)))
	return -d.a * (want / Math.max(gap, 0.05)) ** 2
}

// A line to stop at is a car standing there, with no time gap to keep.
export const stopAt = (d, v, gap) => follow(d, v, gap, 0, 0.1, 0)

// From the acceleration wanted to the pedal: overcome drag and rolling
// resistance on top (see car.js), then gas or brake.
export function pedal(m, acc, v) {
	const need = acc + m.drag * v * Math.abs(v) + 4 * m.rolling * v
	return Math.max(-1, Math.min(1, need / (need > 0 ? m.engine : m.brake)))
}

const inView = (v, x, y, pad) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad
