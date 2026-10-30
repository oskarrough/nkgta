import { expect, test } from 'bun:test'
import { findRoute } from '../src/route.js'
import { T } from '../src/tiles.js'

// A grid from rows of letters: . ground, s sidewalk, # building.
function city(rows) {
	const kinds = { '.': T.GROUND, s: T.SIDEWALK, '#': T.BUILDING }
	const H = rows.length
	const W = rows[0].length
	return { W, H, tileAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.BUILDING : kinds[rows[y | 0][x | 0]]) }
}

test('a route goes round a wall, not through it', () => {
	const world = city(['sssssss', 's#####s', 's#####s', 'sssssss'])
	const route = findRoute(world, { x: 0.5, y: 1.5 }, { x: 6.5, y: 1.5 }, 1)
	expect(route.at(0)).toEqual({ x: 0.5, y: 1.5 })
	expect(route.at(-1)).toEqual({ x: 6.5, y: 1.5 })
	for (const p of route) expect(world.tileAt(p.x, p.y)).not.toBe(T.BUILDING)
})

test('it prefers the street to a courtyard shortcut', () => {
	const world = city(['sssssssss', 's.......s', 'sssssssss'])
	const route = findRoute(world, { x: 0.5, y: 0.5 }, { x: 8.5, y: 0.5 }, 1)
	expect(route.every((p) => world.tileAt(p.x, p.y) === T.SIDEWALK)).toBe(true)
})

test('a door in a wall can be the goal', () => {
	const world = city(['sssss', 's###s', 'sssss'])
	const route = findRoute(world, { x: 0.5, y: 0.5 }, { x: 2.5, y: 1.5 }, 1)
	expect(route.at(-1)).toEqual({ x: 2.5, y: 1.5 })
})

test('no route when the goal is walled in or too far', () => {
	const walled = city(['sssss', 's###s', 's#s#s', 's###s', 'sssss'])
	expect(findRoute(walled, { x: 0.5, y: 0.5 }, { x: 2.5, y: 2.5 }, 1)).toBeNull()
	const far = city(['s'.repeat(1000)])
	expect(findRoute(far, { x: 0.5, y: 0.5 }, { x: 900.5, y: 0.5 })).toBeNull()
})
