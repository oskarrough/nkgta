import { expect, test } from 'bun:test'

globalThis.location ??= { search: '' }
const { radarRotation, radarPoint } = await import('../src/minimap.js')
const player = { x: 300, y: 200 }

test('north stays up overhead regardless of player heading', () => {
	const rotation = radarRotation(1.7, false)
	const north = radarPoint({ x: 300, y: 190 }, player, rotation)
	expect(north.x).toBeCloseTo(0)
	expect(north.y).toBeLessThan(0)
})

test('ahead stays up in chase view for every cardinal heading', () => {
	for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
		const ahead = { x: player.x + 10 * Math.cos(heading), y: player.y + 10 * Math.sin(heading) }
		const point = radarPoint(ahead, player, radarRotation(heading, true))
		expect(point.x).toBeCloseTo(0)
		expect(point.y).toBeLessThan(0)
	}
})

test('distant places stay inside the rim; coincident places do not produce NaN', () => {
	const point = radarPoint({ x: -10000, y: 10000 }, player, 0.8)
	expect(Math.hypot(point.x, point.y)).toBeCloseTo(37)
	const here = radarPoint(player, player, 0)
	expect(here.x).toBe(0)
	expect(here.y).toBe(0)
})
