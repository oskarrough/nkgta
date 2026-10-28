import { describe, expect, test } from 'bun:test'
import { enclosure, muffling } from '../src/space.js'
import { shape } from '../src/music.js'
import { T } from '../src/tiles.js'

// A grid from rows of letters: # building, . ground, ~ water.
const grid = (rows) => ({
	tileAt: (x, y) => {
		const c = rows[Math.floor(y)]?.[Math.floor(x)]
		return c === undefined || c === '#' ? T.BUILDING : c === '~' ? T.WATER : T.GROUND
	},
})
const open = grid(Array.from({ length: 60 }, () => '.'.repeat(60)))
const yard = grid(
	Array.from({ length: 60 }, (_, y) => (y < 27 || y > 31 ? '#'.repeat(60) : `${'#'.repeat(27)}${'.'.repeat(5)}${'#'.repeat(28)}`)),
)
const street = grid(Array.from({ length: 60 }, (_, y) => (y > 26 && y < 33 ? '.'.repeat(60) : '#'.repeat(60))))

describe('enclosure', () => {
	test('an open field is dry', () => expect(enclosure(open, 30, 30)).toBe(0))
	test('water is not a wall', () => expect(enclosure(grid(Array.from({ length: 60 }, () => '~'.repeat(60))), 30, 30)).toBe(0))
	test('a courtyard is shut in', () => expect(enclosure(yard, 29.5, 29.5)).toBeGreaterThan(0.9))
	test('a street open along its length is mostly dry', () => expect(enclosure(street, 30, 30)).toBeLessThan(0.4))
})

describe('muffling', () => {
	const wall = grid(Array.from({ length: 30 }, () => `${'.'.repeat(10)}#####${'.'.repeat(15)}`))
	test('clear air is clear', () => expect(muffling(open, { x: 5, y: 5 }, { x: 25, y: 5 })).toBe(0))
	test('a building in the way muffles', () => expect(muffling(wall, { x: 4, y: 5 }, { x: 25, y: 5 })).toBe(1))
	test('the wall a source sits in does not count', () =>
		expect(muffling(grid(['#'.repeat(3) + '.'.repeat(30)]), { x: 1, y: 0.5 }, { x: 25, y: 0.5 })).toBe(0))
})

describe('shape behind a wall', () => {
	test('walls take level and brightness off', () => {
		const clear = shape('bar', 6)
		const walled = shape('bar', 6, false, false, 1)
		expect(walled.level).toBeLessThan(clear.level)
		expect(walled.cutoff).toBeLessThan(clear.cutoff / 2)
	})
})
