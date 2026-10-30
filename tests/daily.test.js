import { expect, test } from 'bun:test'
import { dailyQuizResult, dailyRace, dateKey, saveDailyQuiz, seeded } from '../src/daily.js'
import { quizRounds, streetSpots } from '../src/quiz-rules.js'
import { defaultMap } from './default-map.js'
import { createWorld } from '../src/world.js'
import { T } from '../src/tiles.js'

const world = createWorld(await defaultMap())

test('the day turns over at midnight in Berlin', () => {
	expect(dateKey(new Date('2026-10-30T22:30:00Z'))).toBe('2026-10-30')
	expect(dateKey(new Date('2026-10-30T23:30:00Z'))).toBe('2026-10-31')
})

test('the daily race is the same for everyone and changes with the day', () => {
	const today = dailyRace(world, streetSpots(world), '2026-10-30', 'default')
	expect(dailyRace(world, streetSpots(world), '2026-10-30', 'default')).toEqual(today)
	expect(dailyRace(world, streetSpots(world), '2026-10-31', 'default').gates).not.toEqual(today.gates)
	expect(today.id).toBe('daily-2026-10-30')
})

test('the daily race runs between gates on roads, on different streets', () => {
	for (const date of ['2026-01-01', '2026-06-15', '2026-10-30']) {
		const race = dailyRace(world, streetSpots(world), date, 'default')
		expect(race.gates.length).toBeGreaterThanOrEqual(3)
		for (const [i, g] of race.gates.entries()) {
			expect(world.tileAt(g.x, g.y)).toBe(T.ROAD)
			if (i) expect(world.streetAt(g.x, g.y)).not.toBe(world.streetAt(race.gates[i - 1].x, race.gates[i - 1].y))
		}
	}
})

test('the daily quiz is the same five spots and choices for everyone', () => {
	const streets = new Map(Array.from({ length: 8 }, (_, i) => [`Street ${i}`, [{ street: `Street ${i}`, x: i * 10, y: 2 }]]))
	const today = quizRounds(streets, seeded('quiz|default|2026-10-30'))
	expect(today).toHaveLength(5)
	expect(quizRounds(streets, seeded('quiz|default|2026-10-30'))).toEqual(today)
	expect(quizRounds(streets, seeded('quiz|default|2026-10-31'))).not.toEqual(today)
})

test('your daily quiz score is for today only and keeps the best', () => {
	const store = new Map()
	const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
	saveDailyQuiz(storage, { date: '2026-10-30', score: 4, marks: '✓✓×✓✓' })
	saveDailyQuiz(storage, { date: '2026-10-30', score: 2, marks: '×✓×✓×' })
	expect(dailyQuizResult(storage, '2026-10-30').score).toBe(4)
	expect(dailyQuizResult(storage, '2026-10-31')).toBeNull()
})
