import { expect, test } from 'bun:test'
import { T } from '../src/tiles.js'
import { hospitalDoor, hospitalWake, nearestHospital } from '../src/hospital.js'

const sidewalk = (x, y) => (y >= 10 && y < 12 ? T.SIDEWALK : T.BUILDING)

test('the nearest hospital is the one you wake at', () => {
	const pois = [
		{ kind: 'cafe', x: 0, y: 0 },
		{ kind: 'hospital', name: 'Urban', x: 10, y: 10, dir: 1 },
		{ kind: 'hospital', name: 'Far', x: 80, y: 80, dir: 2 },
	]
	expect(nearestHospital(pois, 12, 11).name).toBe('Urban')
	expect(hospitalWake(pois, 12, 11, sidewalk)).toEqual({ x: 10.5, y: 10.5, dir: 1 })
})

test('an area with no hospital keeps you where you were going', () => {
	expect(nearestHospital([{ kind: 'cafe', x: 1, y: 1 }], 0, 0)).toBe(null)
	expect(hospitalWake([], 3, 4, sidewalk)).toBe(null)
})

test('a hospital campus door stands on the pavement outside, facing in', () => {
	const ring = [
		{ x: 4, y: 4 },
		{ x: 8, y: 4 },
		{ x: 8, y: 8 },
		{ x: 4, y: 8 },
		{ x: 4, y: 4 },
	]
	const door = hospitalDoor(ring, sidewalk)
	expect(door.y).toBeGreaterThanOrEqual(10)
	expect(door.y).toBeLessThan(12)
	expect(Math.sin(door.dir)).toBeLessThan(0)
})

test('a door on the street beats a courtyard of the same campus', () => {
	const ring = [
		{ x: 5, y: 5 },
		{ x: 9, y: 5 },
		{ x: 9, y: 9 },
		{ x: 5, y: 9 },
		{ x: 5, y: 5 },
	]
	const tileAt = (x, y) => {
		if (y >= 11 && y < 13) return T.SIDEWALK
		if (y >= 13 && y < 15) return T.ROAD
		if (x >= 11 && x < 13) return T.SIDEWALK
		return T.BUILDING
	}
	const door = hospitalDoor(ring, tileAt)
	expect(door.y).toBeGreaterThanOrEqual(11)
	expect(door.y).toBeLessThan(13)
})
