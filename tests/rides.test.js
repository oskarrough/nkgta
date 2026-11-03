import { expect, test } from 'bun:test'
import { createPlayer, selectRide, toggleBike, updatePlayer } from '../src/player.js'
import { kitePull, rideKind } from '../src/rides.js'
import { kiteSpace } from '../src/space.js'
import { T } from '../src/tiles.js'

const smooth = { tileAt: () => T.SIDEWALK }
const input = (x = 0, y = -1) => ({ steer: () => ({ x, y }), axis: () => ({ x, y }) })
function rider(kind) {
	const p = createPlayer({ x: 100, y: 100 })
	selectRide(p, kind)
	toggleBike(p)
	return p
}
function ride(kind, world = smooth, seconds = 4) {
	const p = rider(kind)
	for (let t = 0; t < seconds * 60; t++) updatePlayer(p, input(), world, 1 / 60)
	return p
}

test('swap parked equipment, mount and leave it where you dismount', () => {
	const p = rider('roller')
	expect(rideKind(p)).toBe('roller')
	expect(selectRide(p, 'kite')).toBe(false)
	p.x += 10
	toggleBike(p)
	expect(p.bike.x).toBe(p.x)
	expect(selectRide(p, 'kite')).toBe(true)
	p.x += 3
	expect(selectRide(p, 'skate')).toBe(false)
	toggleBike(p)
	expect(p.onBike).toBe(false)
})

test('small wheels are faster than walking, slower than cycling, and hate rough ground', () => {
	for (const kind of ['skate', 'roller']) {
		expect(ride(kind).x).toBeGreaterThan(100 + 1.6 * 4)
		expect(ride(kind).x).toBeLessThan(ride('bike').x)
		const cobbles = ride(kind, { tileAt: () => T.ROAD, cobbled: () => true })
		expect(cobbles.x).toBeLessThan(ride(kind).x)
		expect(cobbles.rough).toBeGreaterThan(ride(kind).rough)
		expect(ride(kind, { tileAt: () => T.GRASS }).x).toBeLessThan(ride(kind).x)
	}
	expect(ride('roller', { tileAt: () => T.ROAD, cobbled: () => true }).speed).toBeLessThan(
		ride('skate', { tileAt: () => T.ROAD, cobbled: () => true }).speed,
	)
})

test('boards coast between pushes; S brakes instead of reversing', () => {
	const p = ride('skate')
	const before = p.x
	updatePlayer(p, input(0, 0), smooth, 0.1)
	expect(p.x).toBeGreaterThan(before)
	for (let i = 0; i < 60; i++) updatePlayer(p, input(0, 1), smooth, 1 / 60)
	expect(p.speed).toBe(0)
	expect(p.x).toBeGreaterThan(before)
})

test('the shared brake stops wheels in either camera and with a stick', () => {
	const p = ride('roller')
	for (let i = 0; i < 60; i++) updatePlayer(p, { axis: () => ({ x: 1, y: 0 }), brake: () => true }, smooth, 1 / 60)
	expect(p.speed).toBe(0)
})

test('rollers carve harder and hills use the same gravity as cycling', () => {
	const skate = rider('skate'),
		roller = rider('roller')
	updatePlayer(skate, input(1), smooth, 0.1)
	updatePlayer(roller, input(1), smooth, 0.1)
	expect(roller.dir).toBeGreaterThan(skate.dir)
	expect(ride('skate', { ...smooth, slopeAt: () => [-0.03, 0] }).speed).toBeGreaterThan(
		ride('skate', { ...smooth, slopeAt: () => [0.03, 0] }).speed,
	)
})

test('kite needs wind and open grass around the runway, not an ordinary street', () => {
	const field = { tileAt: (x, y) => (Math.abs(y - 100) < 2 ? T.SIDEWALK : T.GRASS) }
	expect(kiteSpace(field, 100, 100)).toBe(true)
	expect(kiteSpace({ tileAt: () => T.ROAD }, 100, 100)).toBe(false)
	expect(kiteSpace({ tileAt: (x) => (x > 105 ? T.BUILDING : T.GRASS) }, 100, 100)).toBe(false)
	const wind = { x: 1, y: 0 }
	expect(kitePull(0, wind, true)).toBeGreaterThan(kitePull(Math.PI / 2, wind, true))
	expect(kitePull(Math.PI / 2, wind, true)).toBeGreaterThan(kitePull(Math.PI, wind, true) * 10)
	for (const [world, breeze] of [
		[smooth, wind],
		[field, { x: 0, y: 0 }],
	]) {
		const p = rider('kite')
		updatePlayer(p, input(), world, 0.1, breeze)
		expect(p.speed).toBe(0)
	}
	const p = rider('kite')
	for (let i = 0; i < 300; i++) updatePlayer(p, input(), field, 1 / 60, wind)
	expect(p.speed).toBeGreaterThan(3.6)
	updatePlayer(p, input(), smooth, 0.1, wind)
	expect(p.speed).toBe(0)
})

test('all rides stay outside walls', () => {
	for (const kind of ['skate', 'roller', 'kite']) {
		const world = { tileAt: (x) => (x >= 102 ? T.BUILDING : T.GRASS) }
		const p = ride(kind, world)
		expect(p.x).toBeLessThanOrEqual(101.7)
	}
})
