// People on foot. No crowd forces: each walks a track, a strip of pavement
// beside a road or a crossing over one arm of a junction, queues behind
// whoever's ahead on it, waits at the kerb to cross, and at the end of one
// track takes another that starts there, or turns round. After the people of
// Slop New York.
import { T } from './tiles.js'
import { offsetLine, pointAt } from './roads.js'
import { LENGTH } from './car.js'

const PAVE = 0.55 // tiles past the kerb people walk
const SPACING = 0.45 // tiles from one person to the next in a queue, centre to centre
const KEEP_RIGHT = 0.15 // tiles off the middle of the track, so people pass each other
const PER_PERSON = 5 // tiles of pavement per person
const MAX = 90
const GAP = 7 // tiles: no car this close before people cross where there are no lights
const PATIENCE = 6 // seconds before they go anyway
const REACH = 1.5 // tiles: how close another track must start to walk on along it

const walkable = (t) => t === T.SIDEWALK || t === T.GROUND

export function createPedestrians(world, junctions) {
	const people = []
	const paths = new Map() // edge → its tracks, worked out when first near
	const junctionAt = new Map() // road node → its junction
	const entryJunction = new Map()
	for (const j of junctions.list) {
		for (const n of j.nodes) junctionAt.set(n, j)
		for (const e of j.entries) entryJunction.set(e, j)
	}
	let crosswalks = [] // busy last frame

	// Stretches of pavement alongside lane e, clear of the junctions at
	// either end, and the crossing over its arm where it runs into one.
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
					if (s - 0.25 - a > 3) out.push({ line, a, b: s - 0.25 })
					a = null
				}
			}
		}
		const j = entryJunction.get(e)
		if (j && e.stop !== undefined) {
			// Just past the stop line, from this kerb straight across to the other.
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

	function update(dt, near, cars, hidden, ring, budget) {
		// Off out of sight and far away.
		for (let i = people.length - 1; i >= 0; i--) {
			const p = people[i]
			if (Math.hypot(p.x - ring.x, p.y - ring.y) > ring.max + 5 && hidden(p.x, p.y)) people.splice(i, 1)
		}
		const tracks = near.flatMap(tracksOf)
		const pavement = tracks.reduce((s, t) => s + (t.edge ? 0 : t.b - t.a), 0)
		for (let i = 0; i < budget && people.length < Math.min(MAX, pavement / PER_PERSON); i++) spawn(tracks, hidden, ring)

		// On at the end of a track: across the road, or along the next stretch.
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
		walk(people, dt, (t, waited) => mayCross(t, waited, cars), next)
		crosswalks = people.filter((p) => p.track.edge && !p.kerb).map((p) => p.track)
		for (const c of crosswalks) c.busy++
	}

	function spawn(tracks, hidden, ring) {
		if (!tracks.length) return
		for (let tries = 0; tries < 10; tries++) {
			let r = Math.random() * tracks.reduce((s, t) => s + (t.b - t.a) * (t.edge ? 2 : 1), 0)
			const track = tracks.find((t) => (r -= (t.b - t.a) * (t.edge ? 2 : 1)) <= 0) ?? tracks.at(-1)
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
				}),
			)
			return
		}
	}

	return { people, update }
}

// One step for everyone: walk on, queue, wait at the kerb, cross. `mayCross`
// says whether a crossing's open, `next` finds a track to go on along.
export function walk(people, dt, mayCross, next = () => null) {
	for (let i = 0; i < people.length; i++) {
		const p = people[i]
		const t = p.track
		p.waited = p.kerb ? (p.waited ?? 0) + dt : 0
		if (p.kerb && p.pause <= 0 && mayCross(t, p.waited)) p.kerb = false
		// Stop for a bit now and then, stepped aside: on the phone, at a window.
		if (!t.edge && p.pause <= 0 && Math.random() < dt * 0.02) p.pause = 2 + Math.random() * 5
		p.pause = Math.max(0, p.pause - dt)

		let ahead = Infinity
		for (let k = 0; k < people.length; k++) {
			const o = people[k]
			if (k === i || o.track !== t || o.way !== p.way || o.pause > 0) continue
			const d = (o.s - p.s) * p.way
			if (d > 0 || (d === 0 && k < i)) ahead = Math.min(ahead, d) // side by side: the first goes first
		}
		const end = p.way > 0 ? t.b : t.a
		const left = (end - p.s) * p.way
		const want = p.kerb || p.pause > 0 ? 0 : Math.min(p.pref, Math.max(0, (ahead - SPACING) * 1.5), left < 0.01 ? 0 : p.pref)
		p.v += Math.max(-3 * dt, Math.min(1.5 * dt, want - p.v))
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

// Where someone stands: on their side of the pavement, a step aside to stop,
// anywhere along the kerb to cross.
function place(p) {
	const at = pointAt(p.track.line, p.s)
	const side = p.track.edge ? p.spot : p.way * (p.pause > 0 ? 0.35 : KEEP_RIGHT)
	p.x = at.x - Math.sin(at.dir) * side
	p.y = at.y + Math.cos(at.dir) * side
	p.dir = p.way > 0 ? at.dir : at.dir + Math.PI
	return p
}
