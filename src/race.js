// Races between gates you drop yourself. A gate is a line between two posts
// across wherever you stood, facing the way you were going; a race is gates
// A, B, C… taken in order, by any route. This module is the rules and the
// bookkeeping, no drawing: crossing a gate, the clock, splits against your
// best, the leaderboard, and the ghost of your best run, recorded at 10 Hz.

export const GHOST_HZ = 10
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const WIDEST = 4 // tiles from the middle to a post, at most
const NARROWEST = 0.8
const KEEP = 10 // times on a race's leaderboard

export const letter = (i) => LETTERS[i] ?? String(i + 1)

// A gate where you stand, its posts pushed out to the walls on either side
// (or WIDEST), so it fills a street and fits a Durchfahrt.
export function makeGate(x, y, angle, solid = () => false) {
	const nx = -Math.sin(angle)
	const ny = Math.cos(angle)
	const reach = (side) => {
		let d = 0
		while (d < WIDEST && !solid(x + nx * side * (d + 0.25), y + ny * side * (d + 0.25))) d += 0.25
		return Math.max(NARROWEST, d)
	}
	return { x: round(x), y: round(y), angle: round(angle, 3), left: reach(-1), right: reach(1) }
}

// The two posts, left then right as you drive through.
export function postsOf(g) {
	const nx = -Math.sin(g.angle)
	const ny = Math.cos(g.angle)
	return [
		[g.x - nx * g.left, g.y - ny * g.left],
		[g.x + nx * g.right, g.y + ny * g.right],
	]
}

// How far along a move from a to b it crosses the gate's line, 0…1, or null.
// Either way through counts: the gates fix the order, not the path.
export function crossing(g, ax, ay, bx, by) {
	const [[px, py], [qx, qy]] = postsOf(g)
	const rx = bx - ax
	const ry = by - ay
	const sx = qx - px
	const sy = qy - py
	const den = rx * sy - ry * sx
	if (Math.abs(den) < 1e-9) return null
	const t = ((px - ax) * sy - (py - ay) * sx) / den
	const u = ((px - ax) * ry - (py - ay) * rx) / den
	return t >= 0 && t <= 1 && u >= -0.1 && u <= 1.1 ? t : null
}

// A run of `race`, in `vehicle` ('foot', 'bike' or a car model's key).
export function startRun(race, vehicle) {
	return { race, vehicle, t: 0, next: 1, splits: [], ghost: { hz: GHOST_HZ, frames: [] }, done: false }
}

// One frame of a run: the clock moves on, the ghost gets its frames, and if
// the move from `from` to `to` crossed the next gate, says which, when, and
// how that compares with the best run there (negative: ahead).
export function stepRun(run, from, to, dt, pose) {
	if (run.done) return null
	const t0 = run.t
	run.t += dt
	record(run.ghost, run.t, pose)
	const gate = run.race.gates[run.next]
	const k = crossing(gate, from.x, from.y, to.x, to.y)
	if (k === null) return null
	const time = t0 + dt * k
	const i = run.next
	run.splits.push(time)
	const best = run.race.best?.splits[i - 1]
	run.next++
	run.done = run.next >= run.race.gates.length
	return { gate: i, time, delta: best === undefined ? null : time - best, finish: run.done }
}

// A frame for every tick of the ghost's clock up to t.
export function record(ghost, t, { x, y, angle, vehicle }) {
	while (ghost.frames.length <= t * ghost.hz) ghost.frames.push([round(x), round(y), round(angle, 3), vehicle])
}

// Where the ghost was at t, between its frames; it waits at the finish.
export function ghostAt(ghost, t) {
	const frames = ghost?.frames
	if (!frames?.length) return null
	const f = Math.max(0, t * ghost.hz)
	const i = Math.min(frames.length - 1, Math.floor(f))
	const a = frames[i]
	const b = frames[Math.min(frames.length - 1, i + 1)]
	const k = Math.min(1, f - i)
	const turn = Math.atan2(Math.sin(b[2] - a[2]), Math.cos(b[2] - a[2]))
	return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, angle: a[2] + turn * k, vehicle: a[3] }
}

// A finished run onto the leaderboard; the best one keeps its splits and
// ghost. Returns its place (0 is first) and whether it's a new best.
export function submit(race, run) {
	const time = round(run.t, 3)
	const entry = { time, vehicle: run.vehicle, at: Date.now() }
	race.times = [...(race.times ?? []), entry].sort((a, b) => a.time - b.time).slice(0, KEEP)
	const best = !race.best || time < race.best.time
	if (best) race.best = { time, vehicle: run.vehicle, splits: run.splits.map((s) => round(s, 3)), ghost: run.ghost }
	return { place: race.times.indexOf(entry), best }
}

// Seconds as 1:02.34, or 12.34 under a minute.
export function clock(seconds) {
	const s = Math.round(seconds * 100) / 100
	const m = Math.floor(s / 60)
	const rest = (s - m * 60).toFixed(2).padStart(5, '0')
	return m ? `${m}:${rest}` : rest.replace(/^0(?=\d)/, '')
}

// +1.20 behind, −0.85 ahead.
export const gap = (d) => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`

// Races are kept per map area, with their best times and ghosts.
const keyOf = (area) => `nk-rennen:${area ?? 'default'}`

export function loadRaces(storage, area) {
	try {
		const races = JSON.parse(storage.getItem(keyOf(area)) ?? '[]')
		return Array.isArray(races) ? races.filter((r) => r?.gates?.length >= 2) : []
	} catch {
		return []
	}
}

export function saveRaces(storage, area, races) {
	try {
		storage.setItem(keyOf(area), JSON.stringify(races))
	} catch {
		// Full or blocked storage: the races last until the tab closes.
	}
}

function round(v, places = 2) {
	const f = 10 ** places
	return Math.round(v * f) / f
}
