import { expect, test } from 'bun:test'
import { createClock, HOUR_SECONDS } from '../src/daylight.js'
import { marketOpen, marketCrowd, canalCrowd, marketLayout, canalLayout } from '../src/maybach.js'
import { createBusyPlaces } from '../src/busy-places.js'
import { createWorld } from '../src/world.js'
import { decodeMap } from '../src/map-codec.js'
import { createCar, driveCar } from '../src/car.js'
import { createTraffic } from '../src/traffic.js'
import { T, SOLID } from '../src/tiles.js'

const world = createWorld(decodeMap(await Bun.file(new URL('../public/map.json', import.meta.url)).json()))

test('market opens only Tuesday and Friday, from 11 until 18:30', () => {
	for (let day = 0; day < 7; day++) {
		expect(marketOpen(11, day)).toBe(day === 1 || day === 4)
		expect(marketOpen(18.49, day)).toBe(day === 1 || day === 4)
		expect(marketOpen(10.99, day)).toBe(false)
		expect(marketOpen(18.5, day)).toBe(false)
	}
	const clock = createClock(23.5, 0)
	clock.tick(HOUR_SECONDS * 11.5)
	expect(clock.day).toBe(1)
	expect(marketOpen(clock.hour, clock.day)).toBe(true)
	clock.set(23.5, 6)
	clock.tick(HOUR_SECONDS)
	expect(clock.day).toBe(0)
	clock.set(14, 4)
	expect(marketOpen(clock.hour, clock.day)).toBe(true)
})

test('wet weather thins browsing; evening canal crowds also follow cold and late hours', () => {
	expect(marketCrowd(14, 0, 4)).toBe(1)
	expect(marketCrowd(14, 1, 4)).toBeLessThan(0.5)
	expect(marketCrowd(14, 0, 3)).toBe(0)
	expect(canalCrowd(19.5, 0, 3, 22)).toBe(1)
	expect(canalCrowd(19.5, 1, 3, 22)).toBeLessThan(0.1)
	expect(canalCrowd(19.5, 0, 3, 5)).toBeLessThan(0.2)
	expect(canalCrowd(1, 0, 3, 22)).toBeLessThan(0.05)
	expect(canalCrowd(1, 0, 3, 22)).toBeGreaterThan(0)
})

test('market and canal guests stand on the mapped banks, and stay out of other cities', () => {
	const market = marketLayout(world),
		canal = canalLayout(world)
	expect(market.groups.filter((g) => g.type === 'stall').length).toBeGreaterThan(50)
	expect(canal.groups.filter((g) => g.type === 'quay').length).toBeGreaterThan(30)
	for (const g of [...market.groups, ...canal.groups]) {
		for (const p of g.people) expect(SOLID.has(world.tileAt(p.x, p.y))).toBe(false)
		if (g.type === 'birds') expect(world.tileAt(g.x, g.y)).toBe(T.WATER)
	}
	const elsewhere = { ...world, bbox: { north: 53, south: 52.99, west: 14, east: 14.01 }, W: 200, H: 200 }
	expect(marketLayout(elsewhere).groups).toHaveLength(0)
	expect(canalLayout(elsewhere).groups).toHaveLength(0)
})

test('road closure follows the market clock without changing walkable ground', () => {
	const w = { ...world },
		busy = createBusyPlaces(w, { bottles: [] }, () => {})
	const g = busy.places.find((p) => p.id === 'maybach-market').groups[0]
	const tile = w.tileAt(g.x, g.y)
	busy.prepare(14, 4)
	expect(w.carClosed(g.x, g.y)).toBe(true)
	const version = w.closureVersion
	busy.prepare(14.1, 4)
	expect(w.closureVersion).toBe(version)
	expect(w.tileAt(g.x, g.y)).toBe(tile)
	busy.prepare(18.5, 4)
	expect(w.carClosed(g.x, g.y)).toBe(false)
})

test('cars cannot drive into a closed street, but a car caught inside can leave', () => {
	const w = { tileAt: () => T.ROAD, carClosed: (x) => x >= 10 && x < 20 }
	const incoming = createCar({ x: 7, y: 50, angle: 0 })
	for (let i = 0; i < 300; i++) driveCar(incoming, { throttle: 1 }, w, 1 / 60)
	expect(incoming.x).toBeLessThan(10)
	const outgoing = createCar({ x: 18, y: 50, angle: 0 })
	for (let i = 0; i < 180; i++) driveCar(outgoing, { throttle: 1 }, w, 1 / 60)
	expect(outgoing.x).toBeGreaterThan(20)
})

test('traffic avoids closed lanes and clears ordinary cars when a market opens', () => {
	let closed = false
	const w = {
		W: 100,
		H: 100,
		roadNodes: [20, 50, 80, 50],
		roads: [{ nodes: [0, 1], w: 3, oneway: 0 }],
		tileAt: () => T.ROAD,
		closureVersion: 0,
		carClosed: (x, y) => closed && x > 15 && x < 85 && y > 45 && y < 55,
	}
	const traffic = createTraffic(w),
		player = { x: 50, y: 50 },
		view = { x0: 0, y0: 0, x1: 100, y1: 100 }
	traffic.update(0, player, view)
	expect(traffic.cars.length).toBeGreaterThan(0)
	closed = true
	w.closureVersion++
	traffic.update(0, player, view)
	expect(traffic.cars).toHaveLength(0)
})
