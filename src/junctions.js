// Junctions, where traffic takes turns. Traffic lights where OSM has them;
// elsewhere the bigger road goes first and, between equals, rechts vor links.
import { pointAt } from './roads.js'
import { LENGTH } from './car.js'

const MERGE = 4 // tiles: junction nodes this close are one junction, like a split carriageway
const GREEN = 12 // seconds
const AMBER = 2
const CLEAR = 2 // all red, so the junction empties
const CYCLE = 2 * (GREEN + AMBER + CLEAR)
const APPROACH = 7 // tiles before its stop line a car counts as arriving
const PATIENCE = 4 // seconds a car waits before it goes anyway
const WAVE = 4.6 // tiles/s, about 50 km/h: drive this along a main road and catch the greens

export function createJunctions(edges, signals = []) {
	const junctions = cluster(edges.map((e) => e.to).filter(isJunction))
	const entryOf = new Map() // lane → the junction it runs into
	for (const j of junctions) {
		j.entries = [...j.nodes].flatMap((n) => n.in).filter((e) => !j.nodes.has(e.from) && edges.includes(e))
		const heading = (e) => pointAt(e.lane, e.len).dir
		const across = (a, b) => Math.abs(Math.cos(heading(a) - heading(b))) < 0.7
		for (const e of j.entries) {
			// Stop where the crossing road begins, half a car short of it.
			const crossing = j.entries.filter((o) => across(o, e))
			const r = j.spread + Math.max(...(crossing.length ? crossing : j.entries).map((o) => o.w)) / 2 + 0.3
			let s = e.len
			while (s > 0 && dist(pointAt(e.lane, s), j) < r) s -= 0.25
			e.stop = Math.max(0, s - LENGTH / 2)
			e.heading = heading(e)
			entryOf.set(e, j)
		}
		// The widest road through gets the first green, its cross roads the second.
		const main = j.entries.reduce((a, b) => (b.w > a.w ? b : a), j.entries[0])
		for (const e of j.entries) e.phase = across(e, main) ? 1 : 0
		j.r = j.spread + Math.max(...j.entries.map((e) => e.w)) / 2
		j.signal = signals.some((p) => dist(p, j) < j.r + 5)
		j.offset = main ? waveOffset(j, main.heading) : 0
	}

	let time = 0
	const waited = new WeakMap() // car → seconds stood at a stop line

	// Who's arriving where this frame, and who's already in the middle.
	function update(cars, dt) {
		time += dt
		for (const j of junctions) {
			j.arriving = []
			j.inside = []
		}
		for (const c of cars) {
			for (const j of junctions) if (Math.abs(c.x - j.x) < j.r && Math.abs(c.y - j.y) < j.r && dist(c, j) < j.r) j.inside.push(c)
			if (!c.ai) continue
			const { edge, next, s } = c.ai
			for (const [e, gap] of [
				[edge, edge.stop - s],
				[next, edge.len - s + (next?.stop ?? 0)],
			]) {
				const j = entryOf.get(e)
				if (j && gap > -0.5 && gap < APPROACH) j.arriving.push({ car: c, edge: e, gap })
			}
			const standing = Math.hypot(c.vx, c.vy) < 0.3 && entryOf.has(edge) && edge.stop - s < 1.5
			waited.set(c, standing ? (waited.get(c) ?? 0) + dt : 0)
		}
	}

	const light = (j, e) => signalPhase(time + j.offset + (e.phase * CYCLE) / 2)

	// Should car c stop at the line where lane e meets a junction, `gap` tiles ahead?
	function wait(c, e, gap) {
		const j = entryOf.get(e)
		if (!j || gap < -0.3) return false
		if (j.signal) {
			const state = light(j, e)
			// On amber, stop if you comfortably can.
			const v = Math.hypot(c.vx, c.vy)
			return state === 'red' || (state === 'amber' && gap > (v * v) / (2 * (c.model?.driver?.b ?? 1)))
		}
		if ((waited.get(c) ?? 0) > PATIENCE) return false
		// Something crossing in the middle.
		const crossing = (o) => o !== c && Math.hypot(o.vx, o.vy) > 0.3 && Math.abs(Math.cos(o.angle - e.heading)) < 0.85
		if (j.inside.some(crossing)) return true
		// Someone with right of way on the way in.
		return j.arriving.some((a) => a.car !== c && a.edge !== e && goesFirst(a.edge, e))
	}

	// The traffic lights to draw: one at each stop line, on the kerb.
	function lights() {
		const out = []
		for (const j of junctions) {
			if (!j.signal) continue
			for (const e of j.entries) out.push({ ...pointAt(e.kerb, Math.min(e.len, e.stop + LENGTH / 2)), state: light(j, e) })
		}
		return out
	}

	// Somewhere in or right next to a junction, where nobody should park.
	const near = (x, y, pad) => junctions.some((j) => dist({ x, y }, j) < j.r + pad)

	return { update, wait, lights, near }
}

// Every light runs off one clock: green, amber, then red while the cross
// road has its turn, at t seconds into the cycle.
export function signalPhase(t) {
	const at = ((t % CYCLE) + CYCLE) % CYCLE
	return at < GREEN ? 'green' : at < GREEN + AMBER ? 'amber' : 'red'
}

// Where a junction's lights sit in the cycle: later the further along its main
// road, so the greens roll down the street at WAVE. Both directions of a road
// share one axis, so neighbouring junctions on it agree.
export function waveOffset(p, heading) {
	const axis = ((heading % Math.PI) + Math.PI) % Math.PI
	return -(p.x * Math.cos(axis) + p.y * Math.sin(axis)) / WAVE
}

// Bigger road first. Between equals, whoever comes from the right: their
// heading is ours turned a quarter to the left.
function goesFirst(a, b) {
	if (Math.abs(a.w - b.w) > 0.5) return a.w > b.w
	const turn = Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading))
	return Math.abs(turn + Math.PI / 2) < Math.PI / 4
}

// Three or more roads meet here.
function isJunction(n) {
	return new Set([...n.out.map((e) => e.to), ...n.in.map((e) => e.from)]).size >= 3
}

// Junction nodes close together become one junction, centred between them.
function cluster(nodes) {
	const groups = []
	for (const n of new Set(nodes)) {
		const near = groups.filter((g) => [...g].some((m) => dist(m, n) < MERGE))
		const merged = new Set([n, ...near.flatMap((g) => [...g])])
		for (const g of near) groups.splice(groups.indexOf(g), 1)
		groups.push(merged)
	}
	return groups.map((g) => {
		const x = [...g].reduce((s, n) => s + n.x, 0) / g.size
		const y = [...g].reduce((s, n) => s + n.y, 0) / g.size
		return { x, y, nodes: g, spread: Math.max(...[...g].map((n) => dist(n, { x, y }))) }
	})
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
