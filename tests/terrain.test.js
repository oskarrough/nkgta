import { expect, test } from 'bun:test'
import { createTerrain } from '../src/terrain.js'
import { toBase64 } from '../src/map-codec.js'
import { createCar, driveCar, forwardSpeed } from '../src/car.js'
import { createPlayer, updatePlayer } from '../src/player.js'
import { T } from '../src/tiles.js'

const map = { tileM: 3, bbox: { south: 1, west: 2, north: 3, east: 4 } }
// Two by two heights, CELL tiles apart: 0 m along the top, 6 m along the bottom.
const json = (extra = {}) => ({
	...map,
	cell: 4,
	w: 2,
	h: 2,
	base: 30,
	cm: toBase64(new Uint8Array(new Uint16Array([0, 0, 600, 600]).buffer)),
	...extra,
})

test('no terrain, or terrain made for another area, is flat', () => {
	for (const terrain of [
		createTerrain(null, map),
		createTerrain(json({ tileM: 2 }), map),
		createTerrain(json({ bbox: { ...map.bbox, east: 5 } }), map),
	]) {
		expect(terrain.flat).toBe(true)
		expect(terrain.heightAt(1, 1)).toBe(0)
		expect(terrain.slopeAt(1, 1)).toEqual([0, 0])
	}
})

test('heights are in tiles, between the grid points', () => {
	const terrain = createTerrain(json(), map)
	expect(terrain.flat).toBe(false)
	expect(terrain.heightAt(0, 0)).toBeCloseTo(0)
	expect(terrain.heightAt(2, 4)).toBeCloseTo(2) // 6 m is two tiles
	expect(terrain.heightAt(2, 2)).toBeCloseTo(1)
	const [sx, sy] = terrain.slopeAt(2, 2)
	expect(sx).toBeCloseTo(0)
	expect(sy).toBeCloseTo(0.5)
})

// Ground rising towards +x by `grade` tiles per tile.
const hill = (grade) => ({ tileAt: () => T.ROAD, tileM: 3, heightAt: (x) => x * grade, slopeAt: () => [grade, 0] })

test('a parked car stays put on a hill; a rolling one runs on downhill', () => {
	const parked = createCar({ x: 10, y: 10 })
	for (let i = 0; i < 120; i++) driveCar(parked, { handbrake: true }, hill(0.08), 1 / 60)
	expect(parked.x).toBeCloseTo(10)

	const coast = (world) => {
		const c = createCar({ x: 10, y: 10, speed: 3 })
		for (let i = 0; i < 120; i++) driveCar(c, {}, world, 1 / 60)
		return forwardSpeed(c)
	}
	expect(coast(hill(-0.08))).toBeGreaterThan(coast(hill(0)))
	expect(coast(hill(0.08))).toBeLessThan(coast(hill(0)))
})

test('cycling uphill is slower than downhill', () => {
	const ride = (grade) => {
		const p = createPlayer({ x: 10, y: 10 })
		p.onBike = true
		for (let i = 0; i < 60; i++) updatePlayer(p, { axis: () => ({ x: 1, y: 0 }) }, hill(grade), 1 / 30)
		return p.x - 10
	}
	expect(ride(0.06)).toBeLessThan(ride(0))
	expect(ride(-0.06)).toBeGreaterThan(ride(0))
})
