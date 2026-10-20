import { expect, test } from 'bun:test'
import { createPlayer, updatePlayer } from '../src/player.js'
import { T } from '../src/tiles.js'

const world = { tileAt: () => T.ROAD }
const input = (x, y) => ({ steer: () => ({ x, y }), axis: () => ({ x, y }), turbo: () => false })

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
	updatePlayer(p, { axis: () => ({ x: 0, y: -1 }), turbo: () => false }, world, 0.1)
	expect(p.y).toBeLessThan(10)
	expect(p.dir).toBeCloseTo(-Math.PI / 2)
})
