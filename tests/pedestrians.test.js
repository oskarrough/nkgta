import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { walk } from '../src/pedestrians.js'
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
