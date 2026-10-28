import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { walk, dodge, contact, keepClear, glance, dodgeStep } from '../src/pedestrians.js'
import { mayWalk, signalPhase } from '../src/junctions.js'

// No one stops to look at their phone mid-test.
const random = Math.random
beforeAll(() => (Math.random = () => 0.5))
afterAll(() => (Math.random = random))

const line = (len) => [
	{ x: 0, y: 0, s: 0 },
	{ x: len, y: 0, s: len },
]
const person = (track, s, way, pref = 0.5) => ({ track, s, way, v: 0, pref, stride: 0, pause: 0, kerb: !!track.edge, spot: 0 })

describe('people on foot', () => {
	test('a fast walker queues behind a slow one', () => {
		const track = { line: line(30), a: 0, b: 30 }
		const slow = person(track, 3, 1, 0.25)
		const fast = person(track, 0, 1, 0.6)
		let closest = Infinity
		for (let t = 0; t < 30; t += 1 / 60) {
			walk([slow, fast], 1 / 60)
			closest = Math.min(closest, slow.s - fast.s)
		}
		expect(closest).toBeGreaterThan(0.35)
		expect(slow.s - fast.s).toBeLessThan(0.7) // caught up
	})

	test('waits at the kerb, then crosses one after another', () => {
		const track = { line: line(4), a: 0, b: 4, edge: {} }
		const crowd = [person(track, 0, 1), person(track, 0, 1), person(track, 0, 1)]
		let open = false
		for (let t = 0; t < 5; t += 1 / 60) walk(crowd, 1 / 60, () => open)
		for (const p of crowd) expect(p.s).toBe(0)

		open = true
		const left = crowd.map(() => null)
		for (let t = 0; t < 20; t += 1 / 60) {
			walk(crowd, 1 / 60, () => open)
			crowd.forEach((p, i) => (left[i] ??= p.s > 0.05 ? t : null))
			if (t > 12) open = false
		}
		expect(left[1]).toBeGreaterThan(left[0] + 0.3)
		expect(left[2]).toBeGreaterThan(left[1] + 0.3)
		// Across, turned round, and waiting at the far kerb.
		for (const p of crowd) expect([p.s, p.way, p.kerb]).toEqual([4, -1, true])
	})

	test('walks on along the next track at the end of one', () => {
		const a = { line: line(2), a: 0, b: 2 }
		const b = { line: line(5), a: 0, b: 5 }
		const p = person(a, 1.5, 1)
		for (let t = 0; t < 4; t += 1 / 60)
			walk(
				[p],
				1 / 60,
				() => true,
				() => ({ track: b, s: 0, way: 1 }),
			)
		expect(p.track).toBe(b)
		expect(p.s).toBeGreaterThan(1)
	})

	test('people only step off while the cars they cross are held at red', () => {
		for (const phase of [0, 1])
			for (let t = 0; t < 64; t += 0.1) {
				if (!mayWalk(t + ((1 - phase) * 32) / 2)) continue
				// Red now and for the 10 s it takes to cross a wide road after.
				for (let later = 0; later <= 10; later += 0.5) expect(signalPhase(t + later + (phase * 32) / 2)).toBe('red')
			}
	})
})

// A car `gap` tiles up the road from the origin, heading for it at `speed`,
// `offset` tiles off line.
const car = (gap, speed, offset = 0, angle = 0) => ({
	x: -gap,
	y: offset,
	angle,
	vx: Math.cos(angle) * speed,
	vy: Math.sin(angle) * speed,
	model: { length: 1.3, width: 0.64 },
})
const inside = (p, c) => {
	const u = (p.x - c.x) * Math.cos(c.angle) + (p.y - c.y) * Math.sin(c.angle)
	const v = (p.y - c.y) * Math.cos(c.angle) - (p.x - c.x) * Math.sin(c.angle)
	return Math.abs(u) < c.model.length / 2 && Math.abs(v) < c.model.width / 2
}

describe('getting out of the way', () => {
	test('a car coming straight at someone standing still: they get out of its path', () => {
		const from = { x: 0, y: 0 }
		const choice = dodge(from, [0, 1], 0, { ahead: 5, back: 5 }, [car(8, 6)])
		expect(choice).not.toBeNull()
		expect(contact(from, choice.legs, car(8, 6))).toBe(Infinity)
	})

	test("a car that's missing them anyway changes nothing", () => {
		expect(dodge({ x: 0, y: 3 }, [0, 1], 0.5, { ahead: 5, back: 5 }, [car(8, 6)])).toBeNull()
		expect(dodge({ x: 0, y: 0 }, [0, 1], 0.5, { ahead: 5, back: 5 }, [car(8, 0.5)])).toBeNull()
	})

	test('no way out in time still ends in a leap that clears the car', () => {
		// Walls both ways along the track, a car 3 tiles away at 12 tiles/s:
		// stopping, sprinting and stepping all fail, so it has to be a throw.
		for (const offset of [-0.3, 0, 0.3]) {
			const c = car(3, 12, offset)
			const choice = dodge({ x: 0, y: 0 }, [0, 1], 0, { ahead: 0, back: 0 }, [c])
			expect(choice.kind).toBe('dive')
			expect(contact({ x: 0, y: 0 }, choice.legs, c)).toBe(Infinity)
		}
	})

	test('nobody is ever under a car, whatever its speed or line', () => {
		const track = { line: line(40), a: 0, b: 40 }
		for (const speed of [2, 5, 9, 14])
			for (const offset of [-0.5, 0, 0.5])
				for (const angle of [0, 0.4, Math.PI / 2])
					for (const gap of [4, 10]) {
						const p = person(track, 20, 1)
						p.x = 20
						p.y = 0
						p.dir = 0
						const c = car(gap, speed, offset, angle)
						c.x += 20
						const scare = { threats: [c], ok: () => true }
						for (let t = 0; t < 4; t += 1 / 120) {
							c.x += c.vx / 120
							c.y += c.vy / 120
							walk([p], 1 / 120, () => true, undefined, scare)
							expect(inside(p, c)).toBe(false)
						}
					}
	})

	test('and if one slips through, they pop out of its side', () => {
		const p = { x: 0.1, y: 0.05, dir: 0 }
		keepClear(p, [car(0, 5)])
		expect(inside(p, car(0, 5))).toBe(false)
	})

	test('a dive lies there a beat, gets up and sometimes shouts', () => {
		const p = {
			x: 0,
			y: 0,
			dir: Math.PI / 2,
			dodge: { age: 0, vx: 7, vy: 0, dir: 0, keep: Math.PI / 2, lunge: 0.26, lie: 0.5, total: 1.4, shout: true },
		}
		const shouts = []
		const scare = { ok: () => true, shout: (who) => shouts.push(who) }
		let flat = 0
		for (let t = 0; t < 2; t += 1 / 60) {
			if (p.dodge) dodgeStep(p, 1 / 60, scare)
			flat = Math.max(flat, p.lie)
		}
		expect(flat).toBe(1)
		expect(p.lie).toBe(0)
		expect(p.dodge).toBeNull()
		expect(p.x).toBeCloseTo(1.82, 1) // the lunge carried them aside
		expect(p.dir).toBe(Math.PI / 2)
		expect(shouts).toEqual([p])
	})

	test('a driver thrown out of their car dodges too', () => {
		const runner = { x: 0, y: 0, dir: Math.PI / 2, t: 4 }
		const c = car(6, 8)
		c.y = 0.1
		const scare = { threats: [c], ok: () => true }
		let acted = false
		for (let t = 0; t < 2; t += 1 / 120) {
			c.x += c.vx / 120
			glance(runner, 1 / 120, scare, { ahead: 6, back: 6 })
			if (runner.dodge) dodgeStep(runner, 1 / 120, scare)
			expect(inside(runner, c)).toBe(false)
			acted ||= !!(runner.dodge || runner.flee)
		}
		expect(acted).toBe(true)
	})
})
