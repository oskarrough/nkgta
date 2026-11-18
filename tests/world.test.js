import { expect, test } from 'bun:test'
import { createWorld } from '../src/world.js'

test('street searches keep row order within a ring and stop at the map edge', () => {
	const world = createWorld({
		w: 4,
		h: 3,
		bbox: {},
		streetOf: [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0],
		streets: ['', 'North', 'South'],
	})
	expect(world.nearestStreet(3, 1, 1)).toBe('North')
	expect(world.nearestStreet(0, 1, 1)).toBe('')
})
