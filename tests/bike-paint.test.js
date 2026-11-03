import { expect, test } from 'bun:test'
import { BIKE_PAINTS, bikeAtShop, paintBike } from '../src/bike-paint.js'
import { createPlayer, toggleBike } from '../src/player.js'

const shop = { kind: 'bikeshop', stand: { x: 100, y: 100 } }

test('paint only a bicycle parked near the real bike shop, even while the player is inside', () => {
	const player = createPlayer(shop.stand)
	const bike = player.bike
	Object.assign(player, { x: 6, y: 3.5 })
	expect(bikeAtShop(player, shop)).toBe(true)
	expect(paintBike(player, shop, BIKE_PAINTS[1].color)).toBe(true)
	expect(player.bike).toBe(bike)
	expect(bike).toEqual({ x: 101.2, y: 100, kind: 'bike', color: BIKE_PAINTS[1].color })
	expect(paintBike(player, shop, 'not-a-color')).toBe(false)
	expect(bike.color).toBe(BIKE_PAINTS[1].color)
})

test('cannot paint a distant bike, another kind of shop or other equipment', () => {
	const player = createPlayer(shop.stand)
	expect(paintBike(player, null, BIKE_PAINTS[1].color)).toBe(false)
	expect(paintBike(player, { ...shop, kind: 'spaeti' }, BIKE_PAINTS[1].color)).toBe(false)
	for (const kind of ['skate', 'roller', 'kite']) {
		player.bike.kind = kind
		expect(paintBike(player, shop, BIKE_PAINTS[1].color)).toBe(false)
	}
	player.bike.kind = 'bike'
	player.bike.x += 10
	expect(paintBike(player, shop, BIKE_PAINTS[1].color)).toBe(false)
	expect(player.bike.color).toBeUndefined()
})

test('must dismount and cannot paint from a car or while down', () => {
	for (const state of [{ onBike: true }, { car: {} }, { down: true }]) {
		const player = Object.assign(createPlayer(shop.stand), state)
		expect(paintBike(player, shop, BIKE_PAINTS[1].color)).toBe(false)
	}
})

test('paint stays on the same parked bike, never moves or recalls it, and does not transfer to a fresh bike', () => {
	const player = createPlayer(shop.stand)
	paintBike(player, shop, BIKE_PAINTS[2].color)
	toggleBike(player)
	player.x += 30
	toggleBike(player)
	const parked = { ...player.bike }
	player.x += 20
	toggleBike(player)
	expect(player.onBike).toBe(false)
	expect(player.bike).toEqual(parked)
	expect(paintBike(player, shop, BIKE_PAINTS[3].color)).toBe(false)
	player.x = player.bike.x
	toggleBike(player)
	expect(player.onBike).toBe(true)
	expect(player.bike.color).toBe(BIKE_PAINTS[2].color)
	const oldBike = player.bike
	Object.assign(player, createPlayer(shop.stand))
	expect(player.bike).not.toBe(oldBike)
	expect(player.bike.color).toBeUndefined()
	expect(oldBike.color).toBe(BIKE_PAINTS[2].color)
})
