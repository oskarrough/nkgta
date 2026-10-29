import { expect, test } from 'bun:test'
import { quizLine, quizRounds, quizSpots } from '../src/quiz-rules.js'
import { T } from '../src/tiles.js'

test('five different streets, each with the right answer and its three nearest alternatives', () => {
	const streets = new Map(Array.from({ length: 8 }, (_, i) => [`Street ${i}`, [{ street: `Street ${i}`, x: i * 10, y: 2 }]]))
	const rounds = quizRounds(streets, () => 0.4)
	expect(rounds).toHaveLength(5)
	expect(new Set(rounds.map((r) => r.street)).size).toBe(5)
	for (const round of rounds) {
		expect(new Set(round.choices).size).toBe(4)
		expect(round.choices).toContain(round.street)
		const nearby = [...streets.values()]
			.flat()
			.filter((s) => s.street !== round.street)
			.sort((a, b) => Math.abs(a.x - round.x) - Math.abs(b.x - round.x))
			.slice(0, 3)
			.map((s) => s.street)
		expect(round.choices.filter((s) => s !== round.street).sort()).toEqual(nearby.sort())
	}
	expect(quizRounds(new Map([...streets].slice(0, 4)))).toEqual([])
})

test('quiz starts on named streets, never buildings or map edges', () => {
	const world = { W: 5, H: 5, tileAt: (x) => (x === 2 ? T.ROAD : T.BUILDING), streetAt: (_, y) => (y === 2 ? 'Karl-Marx-Straße' : '') }
	expect([...quizSpots(world).values()].flat()).toEqual([{ x: 2.5, y: 2.5, street: 'Karl-Marx-Straße' }])
})

test('feedback is exactly one plain line, including skips and picked areas', () => {
	expect(quizLine({ street: 'Weserstraße', x: 20.5, y: 31.5 }, null, 12.34, '1,2,3,4')).toBe(
		'quiz: Weserstraße | answer skip | 12.3 s | area 1,2,3,4 | 20.5,31.5',
	)
})

test('the shipped map can provide a full quiz', async () => {
	const { decodeMap } = await import('../src/map-codec.js')
	const { createWorld } = await import('../src/world.js')
	const world = createWorld(decodeMap(await Bun.file('public/map.json').json()))
	const rounds = quizRounds(quizSpots(world))
	expect(rounds).toHaveLength(5)
	for (const spot of rounds) expect(world.streetAt(spot.x, spot.y)).toBe(spot.street)
})
