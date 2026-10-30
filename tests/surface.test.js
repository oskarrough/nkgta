import { describe, expect, test } from 'bun:test'
import { createWorld } from '../src/world.js'
import { createPlayer, updatePlayer } from '../src/player.js'
import { createCar, driveCar, speedOf } from '../src/car.js'
import { MODELS } from '../src/models.js'
import { SURFACE, feelOn, surfaceAt } from '../src/surface.js'
import { T } from '../src/tiles.js'

globalThis.devicePixelRatio = 1

// A world of one kind of ground.
const flatWorld = (tile, cobbled = false) => ({ tileAt: () => tile, cobbled: () => cobbled })
const pedals = { axis: () => ({ x: 0, y: -1 }) }

function ride(tile, { cobbled = false, frames = 240 } = {}) {
	const p = createPlayer({ x: 30, y: 30 })
	p.onBike = true
	for (let i = 0; i < frames; i++) updatePlayer(p, pedals, flatWorld(tile, cobbled), 1 / 60)
	return p
}

function drive(model, { cobbled = false, frames = 180 } = {}) {
	const car = createCar({ x: 30, y: 30, model })
	const world = flatWorld(T.ROAD, cobbled)
	for (let i = 0; i < frames; i++) driveCar(car, { throttle: 1 }, world, 1 / 60)
	return car
}

describe('what is under you', () => {
	test('tiles become surfaces, and a cobbled road is setts', () => {
		expect(surfaceAt(flatWorld(T.ROAD), 0, 0)).toBe(SURFACE.asphalt)
		expect(surfaceAt(flatWorld(T.ROAD, true), 0, 0)).toBe(SURFACE.sett)
		expect(surfaceAt(flatWorld(T.CYCLEWAY), 0, 0)).toBe(SURFACE.asphalt)
		expect(surfaceAt(flatWorld(T.SIDEWALK), 0, 0)).toBe(SURFACE.paving)
		expect(surfaceAt(flatWorld(T.PRIVATE), 0, 0)).toBe(SURFACE.paving)
		expect(surfaceAt(flatWorld(T.GROUND), 0, 0)).toBe(SURFACE.hof)
		expect(surfaceAt(flatWorld(T.GRASS), 0, 0)).toBe(SURFACE.grass)
		expect(surfaceAt(flatWorld(T.PITCH), 0, 0)).toBe(SURFACE.grass)
	})

	test('the map marks the tiles its cobbled streets cover, and no others', () => {
		const map = {
			w: 20,
			h: 20,
			tileM: 3,
			tiles: new Uint8Array(400).fill(T.ROAD),
			streetOf: new Uint16Array(400),
			streets: [''],
			bbox: { west: 0, east: 1, south: 0, north: 1 },
			shapes: [
				{ t: 'sett', layer: 6, w: 3, line: [2, 10, 17, 10] },
				{ t: T.ROAD, layer: 7, w: 3, line: [2, 4, 17, 4] },
			],
			buildings: [],
			trees: [],
			roadNodes: [],
		}
		const world = createWorld(map)
		expect(world.cobbled(10, 10)).toBe(true)
		expect(world.cobbled(10, 4)).toBe(false)
		expect(surfaceAt(world, 10.5, 10.5)).toBe(SURFACE.sett)
		expect(surfaceAt(world, 10.5, 4.5)).toBe(SURFACE.asphalt)
		expect(world.cobbled(-1, 10)).toBe(false)
	})
})

describe('on a bike', () => {
	test('a Hof costs nothing, setts cost a little, grass half', () => {
		const asphalt = ride(T.ROAD)
		const hof = ride(T.GROUND)
		const sett = ride(T.ROAD, { cobbled: true })
		const grass = ride(T.GRASS)
		expect(hof.speed).toBeCloseTo(3.6, 1)
		expect(sett.speed).toBeLessThan(asphalt.speed * 0.95)
		expect(sett.speed).toBeGreaterThan(asphalt.speed * 0.8)
		expect(grass.speed).toBeLessThan(asphalt.speed * 0.6)
	})

	test('setts rattle the bike, tarmac does not', () => {
		expect(ride(T.ROAD).rough).toBe(0)
		expect(ride(T.ROAD, { cobbled: true }).rough).toBeGreaterThan(0.5)
		expect(ride(T.SIDEWALK).rough).toBeLessThan(0.2)
	})
})

describe('in a car', () => {
	const grip = (model, surface) => feelOn(model, surface).grip

	test('setts cost grip, and the Lambo hates them most', () => {
		expect(grip(MODELS.car, SURFACE.sett)).toBeLessThan(grip(MODELS.car, SURFACE.asphalt))
		expect(grip(MODELS.lambo, SURFACE.sett)).toBeLessThan(grip(MODELS.car, SURFACE.sett))
		expect(feelOn(MODELS.lambo, SURFACE.sett).rattle).toBeGreaterThan(feelOn(MODELS.car, SURFACE.sett).rattle)
	})

	test('the van wallows: its wheels take their set later than a Kleinwagen', () => {
		expect(feelOn(MODELS.sprinter, SURFACE.sett).steer).toBeLessThan(feelOn(MODELS.car, SURFACE.sett).steer)
		expect(feelOn(MODELS.sprinter, SURFACE.asphalt).steer).toBeCloseTo(1)
	})

	test('cobbles hold a car back', () => {
		expect(speedOf(drive(MODELS.car, { cobbled: true }))).toBeLessThan(speedOf(drive(MODELS.car)))
	})
})
