import { expect, test } from 'bun:test'
import { ghostAt, makeGate } from '../src/race.js'
import { cleanName, nickname, raceFromHash, shareLink } from '../src/race-share.js'

// A race with a best run that curves along for `seconds`, recorded at 10 Hz.
function race(seconds = 30) {
	const frames = Array.from({ length: seconds * 10 }, (_, i) => [10 + i * 0.07, 20 + Math.sin(i / 20) * 3, 0.3 + i * 0.01, 'bike'])
	return {
		id: 'abc123',
		gates: [makeGate(10, 20, 0.3), makeGate(40, 25, 1.2), makeGate(80.55, 22.5, -2)],
		times: [],
		best: { time: seconds, vehicle: 'bike', splits: [12.3, seconds], ghost: { hz: 10, frames } },
	}
}
const open = (url) => raceFromHash(url.slice(url.indexOf('#')))

test('a shared race comes back with its gates, time, splits and a ghost that follows the same line', () => {
	const sent = race()
	const { url, ghost } = shareLink(sent, 'Flinker Pfand-Pirat', 'https://x/')
	expect(ghost).toBe(true)
	const got = open(url)
	expect(got.id).toBe('abc123')
	expect(got.gates.length).toBe(3)
	expect(got.gates[2].x).toBeCloseTo(80.55, 2)
	expect(got.gates[2].angle).toBeCloseTo(-2, 3)
	expect(got.rival.name).toBe('Flinker Pfand-Pirat')
	expect(got.rival.time).toBe(30)
	expect(got.rival.splits).toEqual([12.3, 30])
	for (const t of [0, 7.3, 19, 40]) {
		const a = ghostAt(sent.best.ghost, t)
		const b = ghostAt(got.rival.ghost, t)
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.4)
		expect(b.vehicle).toBe('bike')
	}
})

test('a ghost too long for a link is thinned, and past that dropped, keeping the gates', () => {
	const long = shareLink(race(300), 'A', 'https://x/')
	expect(long.url.length).toBeLessThanOrEqual(4000)
	const huge = shareLink(race(2000), 'A', 'https://x/')
	expect(huge.ghost).toBe(false)
	const got = open(huge.url)
	expect(got.gates.length).toBe(3)
	expect(got.rival.ghost).toBeNull()
	expect(got.rival.time).toBe(2000)
})

test('a race nobody has finished still shares its gates', () => {
	const sent = { ...race(), best: null }
	const got = open(shareLink(sent, 'A').url)
	expect(got.gates.length).toBe(3)
	expect(got.rival).toBeNull()
})

test('garbage links open nothing', () => {
	expect(raceFromHash('')).toBeNull()
	expect(raceFromHash('#race=')).toBeNull()
	expect(raceFromHash('#race=AAAA')).toBeNull()
	expect(raceFromHash('#race=!!!')).toBeNull()
	const { url } = shareLink(race(), 'A')
	expect(raceFromHash(url.slice(url.indexOf('#'), -20))).toBeNull()
})

test('names from strangers lose their markup', () => {
	expect(cleanName('<img onerror=x>Bob')).toBe('img onerror=xBob')
	expect(cleanName('a'.repeat(50)).length).toBe(24)
	expect(open(shareLink(race(), '<b>"Hi"</b>').url).rival.name).toBe('bHi/b')
	expect(nickname(() => 0)).toBe('Flinker Pfand-Pirat')
	expect(nickname(() => 0.5)).toMatch(/^[A-ZÄÖÜ]\S+[re] \S+$/)
})
