import { expect, test } from 'bun:test'
import { createPlayer, updatePlayer } from '../src/player.js'
import { T } from '../src/tiles.js'

const world = { tileAt: () => T.ROAD }
const input = (x, y) => ({ steer: () => ({ x, y }), axis: () => ({ x, y }) })

for (const onBike of [false, true]) {
	test(`overhead ${onBike ? 'cycling' : 'walking'} follows facing and backs up without turning`, () => {
		const p = createPlayer({ x: 10, y: 10 })
		p.onBike = onBike
		p.dir = Math.PI / 2
		updatePlayer(p, input(0, -1), world, 0.1)
		expect(p.y).toBeGreaterThan(10)
		expect(p.x).toBeCloseTo(10)
		const y = p.y
		updatePlayer(p, input(0, 1), world, 0.1)
		expect(p.y).toBeLessThan(y)
		expect(p.dir).toBeCloseTo(Math.PI / 2)
		const before = { x: p.x, y: p.y }
		updatePlayer(p, input(1, 0), world, 0.1)
		expect(p.dir).toBeGreaterThan(Math.PI / 2)
		expect(p.x).toBe(before.x)
		expect(p.y).toBe(before.y)
	})
}

test('directional movement still follows its world axis', () => {
	const p = createPlayer({ x: 10, y: 10 })
	updatePlayer(p, { axis: () => ({ x: 0, y: -1 }) }, world, 0.1)
	expect(p.y).toBeLessThan(10)
	expect(p.dir).toBeCloseTo(-Math.PI / 2)
})

// A one-tile path rasterised on the diagonal: a staircase of tiles.
const staircase = {
	tileAt: (x, y) => (Math.floor(y) - Math.floor(x) === 0 || Math.floor(y) - Math.floor(x) === 1 ? T.SIDEWALK : T.BUILDING),
}
const ride = (world, x, y, frames = 180) => {
	const p = createPlayer({ x: 5.5, y: 5.5 })
	p.onBike = true
	for (let i = 0; i < frames; i++) updatePlayer(p, { axis: () => ({ x, y }) }, world, 1 / 60)
	return p
}

test('a bike rides a diagonal staircase path without grinding to a halt', () => {
	const p = ride(staircase, Math.SQRT1_2, Math.SQRT1_2)
	expect(Math.hypot(p.x - 5.5, p.y - 5.5)).toBeGreaterThan(7)
	expect(staircase.tileAt(p.x, p.y)).toBe(T.SIDEWALK)
})

test('grazing a wall keeps your pace', () => {
	const corridor = { tileAt: (x, y) => (Math.floor(y) === 5 ? T.SIDEWALK : T.BUILDING) }
	const p = ride(corridor, 0.97, 0.24)
	expect(p.speed).toBeGreaterThan(3)
	expect(p.y).toBeLessThanOrEqual(5.7 + 1e-9)
})
