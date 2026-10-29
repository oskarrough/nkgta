import { expect, test } from 'bun:test'
import { clock, crossing, ghostAt, loadRaces, makeGate, saveRaces, startRun, stepRun, submit } from '../src/race.js'

// Three gates along a straight street running east.
const race = () => ({ gates: [makeGate(0, 0, 0), makeGate(10, 0, 0), makeGate(20, 0, 0)] })
const pose = (x) => ({ x, y: 0, angle: 0, vehicle: 'bike' })

// Rides east at `speed` tiles a second in 60 fps frames until the run is done.
function ride(run, speed) {
	const events = []
	let x = 0
	while (!run.done && run.t < 60) {
		const from = { x, y: 0 }
		x += speed / 60
		const e = stepRun(run, from, { x, y: 0 }, 1 / 60, pose(x))
		if (e) events.push(e)
	}
	return events
}

test('gates reach to the walls, and a move across one counts either way', () => {
	const wall = (x, y) => y > 1.5
	const g = makeGate(5, 0, 0, wall)
	expect(g.right).toBe(1.5)
	expect(g.left).toBe(4)
	expect(crossing(g, 4, 0, 6, 0)).toBeCloseTo(0.5)
	expect(crossing(g, 6, 1, 4, 1)).toBeCloseTo(0.5)
	expect(crossing(g, 4, 3, 6, 3)).toBeNull()
	expect(crossing(g, 6, 0, 7, 0)).toBeNull()
})

test('gates are taken in order; skipping one does not count', () => {
	const run = startRun(race(), 'bike')
	// Straight past B's spot without crossing B: from far north to the finish.
	expect(stepRun(run, { x: 15, y: -10 }, { x: 21, y: 0 }, 0.1, pose(21))).toBeNull()
	expect(run.next).toBe(1)
	const e = stepRun(run, { x: 9, y: 0 }, { x: 11, y: 0 }, 0.1, pose(11))
	expect(e.gate).toBe(1)
	expect(e.finish).toBe(false)
})

test('splits land between frames, and the second run is timed against the best', () => {
	const r = race()
	const first = startRun(r, 'bike')
	const events = ride(first, 5)
	expect(events.map((e) => e.gate)).toEqual([1, 2])
	expect(events[0].time).toBeCloseTo(2, 1)
	expect(events[1].time).toBeCloseTo(4, 1)
	expect(events[0].delta).toBeNull()
	expect(submit(r, first)).toEqual({ place: 0, best: true })

	const faster = startRun(r, 'lambo')
	const [b, c] = ride(faster, 10)
	expect(b.delta).toBeCloseTo(-1, 1)
	expect(c.finish).toBe(true)
	expect(submit(r, faster)).toEqual({ place: 0, best: true })
	expect(r.best.vehicle).toBe('lambo')

	const slow = startRun(r, 'foot')
	ride(slow, 2.5)
	expect(submit(r, slow)).toEqual({ place: 2, best: false })
	expect(r.times.map((t) => t.vehicle)).toEqual(['lambo', 'bike', 'foot'])
	expect(r.best.time).toBeCloseTo(2, 1)
})

test('the ghost records at 10 Hz and plays back where you were at that time', () => {
	const r = race()
	const run = startRun(r, 'bike')
	ride(run, 5)
	submit(r, run)
	const frames = r.best.ghost.frames
	expect(frames.length).toBeGreaterThanOrEqual(40)
	expect(frames.length).toBeLessThanOrEqual(42)
	expect(ghostAt(r.best.ghost, 1).x).toBeCloseTo(5, 0)
	expect(ghostAt(r.best.ghost, 1.05).x).toBeCloseTo(5.25, 0)
	expect(ghostAt(r.best.ghost, 99).x).toBeCloseTo(frames.at(-1)[0])
	expect(ghostAt(r.best.ghost, 1).vehicle).toBe('bike')
})

test('races survive a save per area', () => {
	const store = new Map()
	const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
	saveRaces(storage, null, [race()])
	expect(loadRaces(storage, null)).toHaveLength(1)
	expect(loadRaces(storage, '1,2,3,4')).toHaveLength(0)
	expect(clock(62.346)).toBe('1:02.35')
	expect(clock(9.5)).toBe('9.50')
	expect(clock(59.999)).toBe('1:00.00')
})
