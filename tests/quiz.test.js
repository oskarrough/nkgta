import { defaultMap } from './default-map.js'
import { expect, test } from 'bun:test'
import { guessRelation, quizRounds, quizSpots } from '../src/quiz-rules.js'
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

test('equally near alternatives go to the street listed first', () => {
	const at = (street, x, y) => [street, [{ street, x, y }]]
	const streets = new Map([at('A', 50, 0), at('B', 0, 0), at('C', 0, 50), at('D', -50, 0), at('E', 0, -50), at('F', 100, 100)])
	const round = quizRounds(streets, () => 0)[0]
	expect(round.street).toBe('B')
	expect(round.choices.sort()).toEqual(['A', 'B', 'C', 'D'])
})

test('quiz starts on named streets, never buildings or map edges', () => {
	const world = { W: 5, H: 5, tileAt: (x) => (x === 2 ? T.ROAD : T.BUILDING), streetAt: (_, y) => (y === 2 ? 'Karl-Marx-Straße' : '') }
	expect([...quizSpots(world).values()].flat()).toEqual([{ x: 2.5, y: 2.5, street: 'Karl-Marx-Straße' }])
})

test('the shipped map can provide a full quiz', async () => {
	const { createWorld } = await import('../src/world.js')
	const world = createWorld(await defaultMap())
	const rounds = quizRounds(quizSpots(world))
	expect(rounds).toHaveLength(5)
	for (const spot of rounds) expect(world.streetAt(spot.x, spot.y)).toBe(spot.street)
})

test('wrong guess measures to the nearest mapped part of the guessed street, with north up', () => {
	const near = { x: 12, y: 8 }
	expect(guessRelation({ x: 10, y: 10 }, [{ x: 5, y: 15 }, near, { x: 40, y: 10 }], 4)).toEqual({
		closest: near,
		direction: 'nordöstlich',
		metres: 11,
	})
})

test('gate entrances named after their street stay out of the quiz, service-only and mixed streets stay in', async () => {
	const { buildMap } = await import('../src/build-map.js')
	const { createWorld } = await import('../src/world.js')
	let id = 0
	const way = (name, highway, lat) => ({
		type: 'way',
		id: ++id,
		tags: { name, highway },
		nodes: [id * 10, id * 10 + 1],
		geometry: [
			{ lat, lon: 13.4 },
			{ lat, lon: 13.402 },
		],
	})
	const osm = {
		elements: [
			way('Thiemannstraße', 'residential', 52.4997),
			way('Thiemannstraße - Tor 1', 'service', 52.4995),
			way('Thiemannstraße - Tor 4', 'service', 52.4993),
			way('Rütlistraße', 'service', 52.4991),
			way('Weserstraße', 'service', 52.4989),
			way('Weserstraße', 'residential', 52.4987),
		],
	}
	const world = createWorld(buildMap(osm, { north: 52.5, south: 52.4984, west: 13.4, east: 13.402 }, 3))
	expect([...quizSpots(world).keys()].sort()).toEqual(['Rütlistraße', 'Thiemannstraße', 'Weserstraße'])
})
