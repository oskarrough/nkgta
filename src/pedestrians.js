// People on foot. No crowd forces: each walks a track, a strip of pavement
// beside a road or a crossing over one arm of a junction, queues behind
// whoever's ahead on it, waits at the kerb to cross, and at the end of one
// track takes another that starts there, or turns round. After the people of
// Slop New York, who also get out of the way: see `dodge`.
import { T } from './tiles.js'
import { offsetLine, pointAt } from './roads.js'
import { LENGTH } from './car.js'
import { pushFromTrunks } from './trees.js'
import { createPets } from './pets.js'

const PAVE = 0.55 // tiles past the kerb people walk
const SPACING = 0.45 // tiles from one person to the next in a queue, centre to centre
const KEEP_RIGHT = 0.15 // tiles off the middle of the track, so people pass each other
const PER_PERSON = 5 // tiles of pavement per person
const MAX = 90
const GAP = 7 // tiles: no car this close before people cross where there are no lights
const PATIENCE = 6 // seconds before they go anyway
const REACH = 1.5 // tiles: how close another track must start to walk on along it

// Getting out of the way of cars and bikes, after Slop New York: every ~120 ms
// each person checks when their path and a vehicle's would meet, tries to stop,
// sprint on, turn back, step aside or dive, and keeps whichever leaves the most
// room. If nothing is clean they leap anyway, far and fast enough to clear it.
const GLANCE = 0.12 // seconds between looks at what's coming
const HORIZON = 2 // seconds ahead they work out
const ALARM = 1.5 // seconds to contact when they move
const MARGIN = 0.35 // tiles added round a vehicle for a person's width
const RUSH = 3 // tiles per second, sprinting
const STEP = { dist: 1, speed: 2.2 }
const DIVE = { dist: 1.8, speed: 7 }
const LEAP_MAX = 14 // tiles per second, fastest a person can throw themselves
const LUNGE = 0.26 // seconds in the air for an ordinary dive
const RISE = 0.6 // seconds to get up off the ground

const walkable = (t) => t === T.SIDEWALK || t === T.GROUND

let streetWorld = null

export function crowdAt(hour, day, street = '') {
	const h = ((hour % 24) + 24) % 24
	const base = h < 5 ? 0.2 : h < 7 ? 0.4 : h < 10 ? 0.75 : h < 19 ? 1 : h < 23 ? 0.75 : 0.4
	const sunday = day === 6 ? 0.65 : 1
	const evening = street === 'Weserstraße' && h >= 18 && h < 24 ? 1.8 : 1
	return base * sunday * evening
}

export function createPedestrians(world, junctions) {
	streetWorld = world
	const people = []
	const updatePets = createPets(world)
	const paths = new Map() // edge → its tracks, worked out when first near
	const junctionAt = new Map() // road node → its junction
	const entryJunction = new Map()
	for (const j of junctions.list) {
		for (const n of j.nodes) junctionAt.set(n, j)
		for (const e of j.entries) entryJunction.set(e, j)
	}
	let crosswalks = [] // busy last frame

	function tracksOf(e) {
		if (paths.has(e)) return paths.get(e)
		const ends = [junctionAt.get(e.from), junctionAt.get(e.to)].filter(Boolean)
		const clear = (p) => walkable(world.tileAt(p.x, p.y)) && ends.every((j) => Math.hypot(p.x - j.x, p.y - j.y) > j.r + 0.3)
		const out = []
		const sides = [offsetLine(e.kerb, PAVE)]
		if (!e.twin) sides.push(offsetLine(e.kerb, -(e.w + 0.2 + PAVE))) // one way: the other side too
		for (const line of sides) {
			const len = line.at(-1).s
			let a = null
			for (let s = 0; s <= len + 0.25; s += 0.25) {
				const ok = s <= len && clear(pointAt(line, s))
				if (ok && a === null) a = s
				if (!ok && a !== null) {
					if (s - 0.25 - a > 3) out.push({ line, a, b: s - 0.25, street: world.streetAt?.(e.mid.x, e.mid.y) ?? '' })
					a = null
				}
			}
		}
		const j = entryJunction.get(e)
		if (j && e.stop !== undefined) {
			const p = pointAt(e.lane, Math.min(e.len - 0.1, e.stop + LENGTH / 2 + 0.45))
			const nx = -Math.sin(p.dir)
			const ny = Math.cos(p.dir)
			const mid = e.twin ? e.w / 4 : 0
			const half = e.w / 2 + PAVE
			const from = { x: p.x - nx * (mid - half), y: p.y - ny * (mid - half), s: 0 }
			const to = { x: p.x - nx * (mid + half), y: p.y - ny * (mid + half), s: 2 * half }
			if (walkable(world.tileAt(from.x, from.y)) && walkable(world.tileAt(to.x, to.y))) {
				e.crosswalk = { line: [from, to], a: 0, b: 2 * half, edge: e, busy: 0 }
				out.push(e.crosswalk)
			}
		}
		paths.set(e, out)
		return out
	}

	// Lights where there are some. Otherwise a gap in the traffic, counting
	// cars waiting to go, so a stream of people doesn't hold them up for good,
	// or, after a while waiting, just go: the cars will stop.
	function mayCross(track, waited, cars) {
		const lit = junctions.walk(track.edge)
		if (lit !== undefined) return lit
		if (waited > PATIENCE) return true
		const mid = pointAt(track.line, (track.a + track.b) / 2)
		return !cars.some((c) => c.ai && Math.abs(c.x - mid.x) < GAP && Math.abs(c.y - mid.y) < GAP)
	}

	function update(dt, near, cars, hidden, ring, budget, scare = null, hour = 11, day = 0) {
		for (let i = people.length - 1; i >= 0; i--) {
			const p = people[i]
			if (Math.hypot(p.x - ring.x, p.y - ring.y) > ring.max + 5 && hidden(p.x, p.y)) people.splice(i, 1)
		}
		const tracks = near.flatMap(tracksOf)
		const weight = (t) => (t.b - t.a) * (t.edge ? 2 : 1) * crowdAt(hour, day, t.street)
		const pavement = tracks.reduce((s, t) => s + (t.edge ? 0 : weight(t)), 0)
		const target = Math.min(MAX, pavement / PER_PERSON)
		for (let i = people.length - 1; i >= 0 && people.length > target; i--) {
			if (hidden(people[i].x, people[i].y)) people.splice(i, 1)
		}
		for (let i = 0; i < budget && people.length < target; i++) spawn(tracks, hidden, ring, weight)

		const next = (p) => {
			const end = pointAt(p.track.line, p.way > 0 ? p.track.b : p.track.a)
			const options = []
			for (const t of tracks) {
				if (t === p.track || (t.edge && p.track.edge)) continue
				for (const [s, way] of [
					[t.a, 1],
					[t.b, -1],
				]) {
					const q = pointAt(t.line, s)
					if (Math.hypot(q.x - end.x, q.y - end.y) < REACH) options.push({ track: t, s, way })
				}
			}
			return options[Math.floor(Math.random() * options.length)]
		}
		for (const c of crosswalks) c.busy = 0
		walk(people, dt, (t, waited) => mayCross(t, waited, cars), next, scare)
		if (scare) for (const p of people) keepClear(p, scare.threats, scare.ok)
		updatePets(people, dt, cars, scare)
		crosswalks = people.filter((p) => p.track.edge && !p.kerb).map((p) => p.track)
		for (const c of crosswalks) c.busy++
	}

	function spawn(tracks, hidden, ring, weight) {
		if (!tracks.length) return
		for (let tries = 0; tries < 10; tries++) {
			let r = Math.random() * tracks.reduce((s, t) => s + weight(t), 0)
			const track = tracks.find((t) => (r -= weight(t)) <= 0) ?? tracks.at(-1)
			const way = Math.random() < 0.5 ? 1 : -1
			const s = track.edge ? (way > 0 ? track.a : track.b) : track.a + Math.random() * (track.b - track.a)
			const at = pointAt(track.line, s)
			if (Math.hypot(at.x - ring.x, at.y - ring.y) > ring.max || !hidden(at.x, at.y)) continue
			if (people.some((o) => o.track === track && Math.abs(o.s - s) < SPACING)) continue
			people.push(
				place({
					track,
					s,
					way,
					v: 0,
					pref: 0.4 + Math.random() * 0.15,
					stride: 0,
					pause: 0,
					kerb: !!track.edge,
					spot: (Math.random() - 0.5) * 0.7,
					seed: Math.random(), // what they look like
				}),
			)
			return
		}
	}

	return { people, update }
}

export function walk(people, dt, mayCross, next = () => null, scare = null) {
	for (let i = 0; i < people.length; i++) {
		const p = people[i]
		const t = p.track
		if (p.dodge) {
			dodgeStep(p, dt, scare)
			place(p)
			continue
		}
		if (p.off) relax(p, dt)
		if (scare) {
			const left = p.way > 0 ? t.b - p.s : p.s - t.a
			const room = p.kerb ? { ahead: 0, back: 0 } : { ahead: left, back: t.b - t.a - left }
			glance(p, dt, scare, room)
		}
		p.waited = p.kerb ? (p.waited ?? 0) + dt : 0
		if (p.kerb && p.pause <= 0 && mayCross(t, p.waited)) p.kerb = false
		if (!t.edge && p.pause <= 0 && Math.random() < dt * 0.02) p.pause = 2 + Math.random() * 5
		p.pause = Math.max(0, p.pause - dt)

		let ahead = Infinity
		for (let k = 0; k < people.length; k++) {
			const o = people[k]
			if (k === i || o.track !== t || o.way !== p.way || o.pause > 0 || o.dodge) continue
			const d = (o.s - p.s) * p.way
			if (d > 0 || (d === 0 && k < i)) ahead = Math.min(ahead, d) // side by side: the first goes first
		}
		const end = p.way > 0 ? t.b : t.a
		const left = (end - p.s) * p.way
		const want = p.flee
			? p.flee.stop
				? 0
				: RUSH
			: p.kerb || p.pause > 0
				? 0
				: Math.min(p.pref, Math.max(0, (ahead - SPACING) * 1.5), left < 0.01 ? 0 : p.pref)
		const snap = p.flee ? 8 : 0
		p.v += Math.max(-(3 + snap) * dt, Math.min((1.5 + snap) * dt, want - p.v))
		if (p.flee && (p.flee.t -= dt) < 0) p.flee = null
		p.s = Math.max(t.a, Math.min(t.b, p.s + p.v * p.way * dt))

		if (left < 0.01) {
			const on = next(p)
			if (on) Object.assign(p, on, { kerb: !!on.track.edge })
			else Object.assign(p, { way: -p.way, v: 0, kerb: !!t.edge, pause: 2 + Math.random() * 6 }) // nowhere to go: back, after a moment
		}
		p.stride = p.v > 0.05 ? p.stride + p.v * dt * 11 : Math.round(p.stride / Math.PI) * Math.PI
		place(p)
	}
}

function place(p) {
	const at = pointAt(p.track.line, p.s)
	const side = p.track.edge ? p.spot : p.way * (p.pause > 0 ? 0.35 : KEEP_RIGHT)
	p.x = at.x - Math.sin(at.dir) * side + (p.off?.x ?? 0)
	p.y = at.y + Math.cos(at.dir) * side + (p.off?.y ?? 0)
	if (streetWorld) pushFromTrunks(p, streetWorld)
	p.dir = p.dodge ? p.dodge.dir : p.way > 0 ? at.dir : at.dir + Math.PI
	return p
}

// When the vehicle `c`, driving straight on, would first touch someone who
// does `legs`: [vx, vy, seconds] each, standing still after. Infinity if
// never, within the horizon. Both move in straight lines, so this is a swept
// box test in the vehicle's frame, not a guess at samples.
export function contact(from, legs, c) {
	const cos = Math.cos(c.angle)
	const sin = Math.sin(c.angle)
	let u = (from.x - c.x) * cos + (from.y - c.y) * sin
	let v = (from.y - c.y) * cos - (from.x - c.x) * sin
	const hu = c.model.length / 2 + MARGIN
	const hv = c.model.width / 2 + MARGIN
	const total = legs.reduce((s, l) => s + l[2], 0)
	let t = 0
	for (const [wx, wy, d] of total < HORIZON ? [...legs, [0, 0, HORIZON - total]] : legs) {
		const ru = (wx - c.vx) * cos + (wy - c.vy) * sin
		const rv = (wy - c.vy) * cos - (wx - c.vx) * sin
		let enter = 0
		let exit = d
		for (const [pos, rate, h] of [
			[u, ru, hu],
			[v, rv, hv],
		]) {
			if (Math.abs(rate) < 1e-6) {
				if (Math.abs(pos) > h) exit = -1
				continue
			}
			const a = (-h - pos) / rate
			const b = (h - pos) / rate
			enter = Math.max(enter, Math.min(a, b))
			exit = Math.min(exit, Math.max(a, b))
		}
		if (enter <= exit) return t + enter
		u += ru * d
		v += rv * d
		t += d
	}
	return Infinity
}

// What `from`, facing `heading` at `speed` with `room` tiles of way on ahead
// and back, should do about `threats` (anything with x, y, vx, vy, angle and
// model.length/width). Nothing (null) if they'd be missed anyway. Otherwise
// the choice: { kind: 'stop' | 'ahead' | 'back' | 'step' | 'dive', vx, vy,
// seconds }. `ok(x, y)` says where they may land.
export function dodge(from, heading, speed, room, threats, ok = () => true) {
	const [hx, hy] = heading
	const near = threats.filter((c) => Math.hypot(c.x - from.x, c.y - from.y) < 4 + Math.hypot(c.vx, c.vy) * HORIZON)
	const worst = (legs) => near.reduce((m, c) => Math.min(m, contact(from, legs, c)), Infinity)
	const going = speed > 0.05 ? [[hx * speed, hy * speed, Math.max(0.01, room.ahead / speed)]] : []
	const risk = worst(going)
	if (risk > ALARM) return null

	const c = near.reduce((a, b) => (contact(from, going, b) < contact(from, going, a) ? b : a))
	const lateral = [-Math.sin(c.angle), Math.cos(c.angle)]
	const side = (n, dist, v) => {
		const legs = [[n[0] * v, n[1] * v, dist / v]]
		return ok(from.x + n[0] * dist * 0.5, from.y + n[1] * dist * 0.5) && ok(from.x + n[0] * dist, from.y + n[1] * dist) ? legs : null
	}
	const options = [{ kind: 'stop', legs: [] }]
	if (room.ahead > 0.5) options.push({ kind: 'ahead', legs: [[hx * RUSH, hy * RUSH, room.ahead / RUSH]] })
	if (room.back > 0.5) options.push({ kind: 'back', legs: [[-hx * RUSH, -hy * RUSH, room.back / RUSH]] })
	for (const [kind, spec, axis] of [
		['step', STEP, [-hy, hx]],
		['dive', DIVE, lateral],
	])
		for (const k of [1, -1]) {
			const n = [axis[0] * k, axis[1] * k]
			const legs = side(n, spec.dist, spec.speed)
			if (legs) options.push({ kind, legs, vx: n[0] * spec.speed, vy: n[1] * spec.speed, seconds: spec.dist / spec.speed })
		}
	let best = options[0]
	best.score = worst(best.legs)
	for (const o of options.slice(1)) {
		o.score = worst(o.legs)
		if (o.score > best.score + (o.kind === 'dive' ? 0.1 : 0.03)) best = o
	}
	if (best.score < Infinity) {
		const v = (from.y - c.y) * Math.cos(c.angle) - (from.x - c.x) * Math.sin(c.angle)
		for (const k of [1, -1]) {
			const n = [lateral[0] * k, lateral[1] * k]
			const dist = Math.max(DIVE.dist, c.model.width / 2 + MARGIN + 0.15 + v * -k)
			const seconds = Math.max(dist / LEAP_MAX, Math.min(LUNGE, risk * 0.7))
			const leap = {
				kind: 'dive',
				legs: [[n[0] * (dist / seconds), n[1] * (dist / seconds), seconds]],
				vx: n[0] * (dist / seconds),
				vy: n[1] * (dist / seconds),
				seconds,
			}
			if (!ok(from.x + n[0] * dist, from.y + n[1] * dist)) continue
			leap.score = worst(leap.legs)
			if (leap.score > best.score) best = leap
		}
	}
	return best
}

// Look up now and then, and if something's coming, do something about it.
// For anyone with a heading `p.dir`, a `p.v` and `p.x/y`; `room` is how far
// they could go either way. `scare` is { threats, ok, shout }.
export function glance(p, dt, scare, room) {
	p.look = (p.look ?? Math.random() * GLANCE) - dt
	if (p.look > 0 || !scare.threats.length) return
	p.look = GLANCE
	const heading = [Math.cos(p.dir), Math.sin(p.dir)]
	const choice = dodge(p, heading, p.flee?.stop ? 0 : (p.v ?? RUSH), room, scare.threats, scare.ok)
	if (!choice) return
	if (choice.kind === 'step' || choice.kind === 'dive') {
		const lie = choice.kind === 'dive' ? 0.45 + Math.random() * 0.4 : 0
		p.dodge = {
			age: 0,
			vx: choice.vx,
			vy: choice.vy,
			dir: Math.atan2(choice.vy, choice.vx),
			keep: p.dir,
			lunge: choice.seconds,
			lie,
			total: choice.seconds + lie + (lie ? RISE : 0.15),
			shout: lie > 0 && Math.random() < 0.6,
		}
		p.flee = null
		p.v = 0
		return
	}
	if (choice.kind === 'back') {
		if (p.track) p.way = -p.way
		else p.dir += Math.PI
	}
	p.flee = { stop: choice.kind === 'stop', t: 0.8 }
}

function shift(p, dx, dy, ok) {
	if (!ok(p.x + dx, p.y + dy)) return
	if (p.track) p.off = { x: (p.off?.x ?? 0) + dx, y: (p.off?.y ?? 0) + dy }
	p.x += dx
	p.y += dy
}

export function dodgeStep(p, dt, scare) {
	const d = p.dodge
	const before = d.age
	d.age += dt
	const flying = Math.max(0, Math.min(d.age, d.lunge) - before)
	if (flying > 0) shift(p, d.vx * flying, d.vy * flying, scare?.ok ?? (() => true))
	const up = d.lunge + d.lie
	p.lie = d.lie ? (d.age < up ? Math.min(1, d.age / (d.lunge + 0.1)) : Math.max(0, 1 - (d.age - up) / RISE)) : 0
	if (!p.track) p.dir = d.dir
	if (d.shout && before < up && d.age >= up) scare?.shout?.(p)
	if (d.age >= d.total) {
		if (!p.track) p.dir = d.keep
		p.dodge = null
		p.lie = 0
	}
}

function relax(p, dt) {
	const d = Math.hypot(p.off.x, p.off.y)
	if (d < 0.02) p.off = null
	else {
		const k = Math.max(0, d - 1.2 * dt) / d
		p.off.x *= k
		p.off.y *= k
	}
}

// Whatever happens, nobody stays under a wheel: someone inside a vehicle's
// outline pops out of its side.
export function keepClear(p, threats, ok = () => true) {
	for (const c of threats) {
		const cos = Math.cos(c.angle)
		const sin = Math.sin(c.angle)
		const u = (p.x - c.x) * cos + (p.y - c.y) * sin
		const v = (p.y - c.y) * cos - (p.x - c.x) * sin
		if (Math.abs(u) > c.model.length / 2 + 0.1 || Math.abs(v) > c.model.width / 2 + 0.1) continue
		const out = (c.model.width / 2 + 0.25) * (v < 0 ? -1 : 1) - v
		shift(p, -sin * out, cos * out, ok)
	}
}
