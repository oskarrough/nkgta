// Traffic: cars driving the road network on the right, parked cars along the
// kerbs where OSM says people park (see kerbs.js), both popping in out of
// sight around the player, GTA 1 style.
import { createCar, driveCar, collideCars, shoveOut, forwardSpeed, speedOf, toWorld, distanceTo, LENGTH } from './car.js'
import { MODELS, pickModel } from './models.js'
import { SOLID, T } from './tiles.js'
import { roadGraph, pointAt, project } from './roads.js'
import { createJunctions } from './junctions.js'
import { createPedestrians, glance, dodgeStep, keepClear } from './pedestrians.js'
import { noParking, parkingSpots, spotHash, standsClear } from './kerbs.js'

const LOOKAHEAD = 1.6 // tiles, plus a bit more per tile/s, and for longer vehicles
const SIGHT = 25 // tiles up the lane a driver watches the car ahead
const PER_CAR = 15 // tiles of lane per moving car
const PARK_REACH = 60 // tiles round the player that parked cars fill, at most
const MAX_PARKED = 160 // the nearest this many spots, at most
const SHOUTS = ['Ey! Mein {}!', 'Hilfe! Polizei!', 'Alter, was soll das?', 'Mein {}! Spinnst du?', 'Na toll.']
const DIVE_SHOUTS = ['Ey!', 'Alter!', 'Spinnst du?']
const SHOUT_RANGE = 12 // tiles: further than this you wouldn't hear it
const BIG_ROAD = 4 // tiles wide: buses keep to these
const CONVOY = { gap: 2.4, colors: ['#f4f3ee', '#f4f3ee', '#111214', '#e8e8e4', '#b8bcc2'] }
// Dodging the player: seconds ahead a driver sees it coming, seconds it keeps
// up what it decided, and tiles/s the player must be doing to count as a
// threat at all. A walk doesn't: stepping in front of a car still stops it.
const DODGE = { notice: 1.8, hold: 1.2, fast: 2.2 }
const CALM = { alarm: 0, reaction: 0, panic: 0, panicAcc: 0, evade: 0, honk: false }

export function createTraffic(world, say = () => {}) {
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
	let shouted = 0 // seconds since someone last yelled at you
	let convoyIn = 20 // seconds until the next wedding convoy comes round
	let mover = null // the player as something that could hit a car, this frame
	const blocked = noParking(world)
	const spotsOf = new Map() // lane → its parking spots, worked out once it's near
	let spots = [] // the spots in reach, nearest first
	let spotsAt = null // where the player was when they were gathered

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

	// A spot on a random lane inside the ring, out of sight.
	function spawn(near, ring, view) {
		for (let tries = 0; tries < 20; tries++) {
			const edge = pick(near, (e) => e.len)
			const s = Math.random() * edge.len
			const p = pointAt(edge.lane, s)
			const d = Math.hypot(p.x - ring.x, p.y - ring.y)
			if (d > ring.max || d < 3 || (started && inView(view, p.x, p.y, 2))) continue
			const model = pickModel(edge.rank >= BIG_ROAD)
			if (!fits(p.x, p.y, p.dir, model)) continue
			const car = createCar({ x: p.x, y: p.y, angle: p.dir, model, speed: edge.speed * 0.8 })
			if (model === MODELS.bus && busLines.length) car.line = busLines[Math.floor(Math.random() * busLines.length)]
			car.ai = { edge, next: nextEdge(edge, model), s, stuck: 0, reversing: 0, blocked: 0, ignore: 0, dwell: 0, ...CALM }
			cars.push(car)
			return
		}
	}

	// Parked cars stand in fixed spots along the kerbs, the nearest ones
	// filled out of sight. The same spot always holds the same car, unless
	// it's been driven off.
	function park(ring, view, reach) {
		if (!spotsAt || Math.hypot(spotsAt.x - ring.x, spotsAt.y - ring.y) > 4 || spotsAt.reach !== reach) {
			spots = []
			for (const e of edges) {
				if (Math.hypot(e.mid.x - ring.x, e.mid.y - ring.y) > reach + e.len / 2) continue
				if (!spotsOf.has(e)) spotsOf.set(e, parkingSpots(e, blocked, BIG_ROAD))
				for (const spot of spotsOf.get(e)) if (Math.hypot(spot.x - ring.x, spot.y - ring.y) < reach) spots.push(spot)
			}
			spots.sort((a, b) => Math.hypot(a.x - ring.x, a.y - ring.y) - Math.hypot(b.x - ring.x, b.y - ring.y))
			spots.length = Math.min(spots.length, MAX_PARKED)
			spotsAt = { x: ring.x, y: ring.y, reach }
		}
		for (const spot of spots) {
			if ((spot.car && !spot.car.gone) || (started && inView(view, spot.x, spot.y, 2))) continue
			const r = spotHash(spot.seed, 1)
			const model = r < 0.2 ? MODELS.suv : r < 0.23 ? MODELS.lambo : MODELS.car
			if (!standsClear(world, spot.x, spot.y, spot.angle, model)) continue
			const color = model.colors[Math.floor(spotHash(spot.seed, 2) * model.colors.length)]
			spot.car = createCar({ x: spot.x, y: spot.y, angle: spot.angle, model, color })
			cars.push(spot.car)
		}
	}

	// A wedding convoy: a string of cars nose to tail up one lane, out of sight,
	// the bride's white car in front. Each takes the turn the first one to reach
	// a lane took, so they stay together.
	function spawnConvoy(near, ring, view) {
		const span = (CONVOY.colors.length - 1) * CONVOY.gap + 1
		const long = near.filter((e) => e.len > span)
		for (let tries = 0; long.length && tries < 40; tries++) {
			const edge = long[Math.floor(Math.random() * long.length)]
			const s0 = span + Math.random() * (edge.len - span)
			const string = CONVOY.colors.map((color, k) => {
				const s = s0 - k * CONVOY.gap
				return { s, color, p: pointAt(edge.lane, s), model: k && Math.random() < 0.4 ? MODELS.suv : MODELS.car }
			})
			const unfit = ({ p, model }) =>
				Math.hypot(p.x - ring.x, p.y - ring.y) > ring.max || (started && inView(view, p.x, p.y, 2)) || !fits(p.x, p.y, p.dir, model)
			if (string.some(unfit)) continue
			const turns = new Map()
			for (const { s, color, p, model } of string) {
				const car = createCar({ x: p.x, y: p.y, angle: p.dir, model, color, speed: edge.speed * 0.6 })
				car.convoy = turns
				car.ai = { edge, next: nextEdge(edge, model, turns), s, stuck: 0, reversing: 0, blocked: 0, ignore: 0, dwell: 0, ...CALM }
				cars.push(car)
			}
			return true
		}
		return false
	}

	function aiControls(c, player, dt) {
		const ai = c.ai
		ai.s = project(ai.edge.lane, c.x, c.y)
		if (ai.s > ai.edge.len - 0.3) {
			if (!ai.next) return null
			ai.edge = ai.next
			ai.next = nextEdge(ai.edge, c.model, c.convoy)
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
			const close = (o) => o !== c && Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 16
			const others = [...cars.filter(close), player.car ? null : player, ...walkers.people].filter(Boolean)
			for (const o of others) {
				const [ox, oy] = local(o.x, o.y)
				// The other one's size seen along our heading and across it.
				const turned = (o.angle ?? o.dir ?? 0) - c.angle
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

		// About to be hit: stamp on the brake or floor it, and swerve.
		react(c, dt)
		if (ai.panic > 0) {
			const swerve = Math.atan2(ty + ai.evade, tx)
			const turn = Math.max(-1, Math.min(1, swerve * 2.5))
			if (ai.panicAcc < 0) return fwd > 0.3 ? { throttle: -1, turn } : { throttle: 0, hold: true, turn }
			if (acc > -d.b) return { throttle: 1, turn }
			return { throttle: pedal(m, acc, fwd), turn }
		}

		// Standing and meaning to stay: foot on the brake.
		const hold = fwd < 0.3 && acc < d.a * 0.1
		return {
			throttle: hold ? Math.max(-1, Math.min(1, -fwd * 1.5)) : pedal(m, acc, fwd),
			hold,
			turn: Math.max(-1, Math.min(1, aim * 2.5)),
		}
	}

	// Dodging the player, as people do: late, and without second thoughts. A
	// driver who sees the player about to hit it reacts only once that has
	// lasted its reaction time, then commits to what `dodge` says for a while,
	// and for as long as the player still comes at it.
	function react(c, dt) {
		const ai = c.ai
		ai.honk = false
		const t = mover ? threatTime(c, mover) : Infinity
		if (ai.panic > 0) {
			ai.panic -= dt
			if (t < DODGE.notice) ai.panic = Math.max(ai.panic, 0.4)
			return
		}
		if (t >= DODGE.notice) {
			ai.alarm = 0
			return
		}
		if (!ai.alarm) ai.reaction = 0.25 + Math.random() * 0.4
		ai.alarm += dt
		if (ai.alarm < ai.reaction) return
		const free = (x, y) => !SOLID.has(world.tileAt(x, y)) && !cars.some((o) => o !== c && o !== mover.car && distanceTo(o, x, y) === 0)
		const { acc, evade } = dodge(c, mover, free)
		ai.alarm = 0
		ai.panic = DODGE.hold
		ai.panicAcc = acc
		ai.evade = evade
		ai.honk = forwardSpeed(c) > 1 && (acc < 0 || evade !== 0)
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
	// the big roads where they can. A convoy (its `turns`) goes where its first
	// car went.
	function nextEdge(edge, model, turns) {
		if (turns?.has(edge)) return turns.get(edge)
		const out = edge.to.out.filter((e) => e !== edge.twin)
		const onMap = out.filter((e) => !e.to.off)
		let choices = onMap.length ? onMap : out
		const big = choices.filter((e) => e.rank >= BIG_ROAD)
		if (model === MODELS.bus && big.length) choices = big
		const next = choices.length ? choices[Math.floor(Math.random() * choices.length)] : edge.twin
		turns?.set(edge, next)
		return next
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
		const reach = Math.min(ring.max, PARK_REACH)
		for (let i = cars.length - 1; i >= 0; i--) {
			const c = cars[i]
			if (c.kept || inView(view, c.x, c.y, 4) || Math.hypot(c.x - ring.x, c.y - ring.y) < (c.ai ? ring.max : reach) + 10) continue
			cars.splice(i, 1)
			c.gone = true
		}
		const moving = cars.filter((c) => c.ai).length
		if (near.length) {
			// All at once on the first frame, then a couple per frame.
			for (let i = 0, n = started ? 2 : 999; i < n && moving + i < Math.min(80, laneLength / PER_CAR); i++) spawn(near, ring, view)
		}
		park(ring, view, reach)
		// One wedding convoy at a time, the next one to two and a half minutes after.
		if (near.length && !cars.some((c) => c.convoy) && (convoyIn -= dt) < 0)
			convoyIn = spawnConvoy(near, ring, view) ? 60 + Math.random() * 90 : 5
		started = true
		junctions.update(cars, dt)
		mover = moverOf(player)

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

		// Anything that could run people over: vehicles at speed, yours or a
		// car off the road (the rest keep to their lanes, and people to theirs).
		shouted += dt
		const threats = cars.filter(
			(c) =>
				speedOf(c) >= 1.5 && (!c.ai || world.tileAt(c.x, c.y) !== T.ROAD || world.tileAt(c.x + c.vx * 0.5, c.y + c.vy * 0.5) !== T.ROAD),
		)
		if (player.onBike && !player.down && player.speed >= 1.5)
			threats.push({
				x: player.x,
				y: player.y,
				vx: Math.cos(player.dir) * player.speed,
				vy: Math.sin(player.dir) * player.speed,
				angle: player.dir,
				model: { length: 0.5, width: 0.25 },
			})
		const scare = {
			threats,
			ok: (x, y) => !SOLID.has(world.tileAt(x, y)),
			shout: (p) => {
				if (shouted < 3 || Math.hypot(p.x - player.x, p.y - player.y) > SHOUT_RANGE) return
				shouted = 0
				say(DIVE_SHOUTS[Math.floor(Math.random() * DIVE_SHOUTS.length)])
			},
		}

		for (let i = runners.length - 1; i >= 0; i--) {
			const p = runners[i]
			if ((p.t -= dt) < 0) runners.splice(i, 1)
			if (p.dodge) {
				dodgeStep(p, dt, scare)
				keepClear(p, threats, scare.ok)
				continue
			}
			glance(p, dt, scare, { ahead: 6, back: 6 })
			if (p.flee && (p.flee.t -= dt) < 0) p.flee = null
			const pace = p.flee ? (p.flee.stop ? 0 : 3.4) : 2.2
			const nx = p.x + Math.cos(p.dir) * pace * dt
			const ny = p.y + Math.sin(p.dir) * pace * dt
			if (SOLID.has(world.tileAt(nx, ny))) p.dir += 1.5
			else Object.assign(p, { x: nx, y: ny })
			keepClear(p, threats, scare.ok)
		}
		walkers.update(dt, near, cars, (x, y) => first || !inView(view, x, y, 2), ring, first ? 999 : 6, scare)
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
			runners.push({ x, y, dir: c.angle - Math.PI / 2 + (Math.random() - 0.5), t: 4, seed: Math.random() })
			say(SHOUTS[Math.floor(Math.random() * SHOUTS.length)].replace('{}', c.model.noun))
			c.ai = null
			c.convoy = null
		} else say(c.line ? `${c.model.name} ${c.line}` : c.model.name)
		c.kept = true
	}

	// Sends the next wedding convoy round now, for trying it out.
	const convoy = () => (convoyIn = 0)

	return { cars, peds, update, enterable, steal, convoy, lights: junctions.lights }
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

// The player as something coming at a car: where, how fast, which way and
// how big. Only quick enough counts.
export function moverOf(p) {
	const c = p.car
	const vx = c ? c.vx : Math.cos(p.dir) * p.speed
	const vy = c ? c.vy : Math.sin(p.dir) * p.speed
	if (Math.hypot(vx, vy) < DODGE.fast) return null
	return { x: p.x, y: p.y, vx, vy, angle: c ? c.angle : p.dir, length: c?.model.length ?? 0.6, width: c?.model.width ?? 0.6, car: c }
}

// Seconds until `p` would hit car c (with a little margin), both keeping on
// straight as they go; Infinity if not within DODGE.notice. Where it hits
// goes in `threat`: p ahead of c's centre and to its side then, and p's
// speed across c's heading.
const threat = { ahead: 0, aside: 0, across: 0 }
export function threatTime(c, p) {
	const dx = p.x - c.x
	const dy = p.y - c.y
	if (Math.abs(dx) > 40 || Math.abs(dy) > 40) return Infinity
	const cos = Math.cos(c.angle)
	const sin = Math.sin(c.angle)
	const ahead = dx * cos + dy * sin
	const aside = -dx * sin + dy * cos
	const along = (p.vx - c.vx) * cos + (p.vy - c.vy) * sin
	const across = (p.vx - c.vx) * -sin + (p.vy - c.vy) * cos
	// p's half size along and across c's heading, as it is turned
	const turned = p.angle - c.angle
	const reach = [
		c.model.length / 2 + (Math.abs(Math.cos(turned)) * p.length + Math.abs(Math.sin(turned)) * p.width) / 2 + 0.2,
		c.model.width / 2 + (Math.abs(Math.sin(turned)) * p.length + Math.abs(Math.cos(turned)) * p.width) / 2 + 0.2,
	]
	let enter = 0
	let exit = DODGE.notice
	for (const [at, rate, r] of [
		[ahead, along, reach[0]],
		[aside, across, reach[1]],
	]) {
		if (Math.abs(rate) < 1e-6) {
			if (Math.abs(at) >= r) return Infinity
			continue
		}
		const t0 = (-r - at) / rate
		const t1 = (r - at) / rate
		enter = Math.max(enter, Math.min(t0, t1))
		exit = Math.min(exit, Math.max(t0, t1))
	}
	if (enter >= exit) return Infinity
	threat.ahead = ahead + along * enter
	threat.aside = aside + across * enter
	threat.across = across
	return enter
}

// What a driver does about `p` coming at it: brake (acc -1) if p would hit
// its front half, floor it (1) if its rear half, where braking only makes
// it worse. Moving, it also swerves, tiles to the side (+ is local +y):
// away from where p will be a moment after, or the other way if there's
// more room there. `free(x, y)` says if the car fits at a point.
export function dodge(c, p, free) {
	threatTime(c, p)
	const acc = threat.ahead < 0 ? 1 : -1
	if (forwardSpeed(c) < 1) return { acc, evade: 0 }
	const later = threat.aside + threat.across * 0.5
	const side = Math.abs(later) < 0.3 ? 1 : -Math.sign(later)
	const room = swerveRoom(c, side, free)
	const other = swerveRoom(c, -side, free)
	return { acc, evade: other > room ? -side * other : side * room }
}

// How far to one side of where it is c can swerve: well over, a little, or
// not at all, as far as its corners fit there and a little way ahead.
function swerveRoom(c, side, free) {
	const m = c.model
	const ahead = m.length / 2 + Math.max(0, forwardSpeed(c)) * 0.6
	for (const r of [1, 0.5]) {
		const off = side * (r + m.width / 2)
		if ([-m.length / 2, 0, ahead].every((a) => free(...toWorld(c, a, off)))) return r
	}
	return 0
}

const inView = (v, x, y, pad) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad
