import { expect, test } from 'bun:test'
import { createWeather } from '../src/weather.js'
import { T } from '../src/tiles.js'

const player = { x: 0, y: 0 }
const world = { heightAt: () => 0, tileAt: () => T.ROAD }
const make = (search = '') => createWeather(world, [], { value: 0 }, search)

test('a shower soaks the street gradually and leaves water after it stops', () => {
	const weather = make()
	weather.setMode('rain')
	weather.update(10, player, false)
	expect(weather.wetness).toBeGreaterThan(0)
	expect(weather.wetness).toBeLessThan(0.5)
	weather.update(25, player, false)
	expect(weather.wetness).toBe(1)
	weather.setMode('dry')
	weather.update(1, player, false)
	expect(weather.wetness).toBeGreaterThan(0.9)
	weather.update(120, player, false)
	expect(weather.wetness).toBe(0)
})

test('automatic weather starts a shower, then clears again', () => {
	const weather = make()
	weather.update(136, player, false)
	expect(weather.wetness).toBe(1)
	weather.update(91, player, false)
	expect(weather.wetness).toBeLessThan(1)
})

test('the street keeps getting wet while indoors', () => {
	const weather = make()
	weather.setMode('rain')
	weather.update(10, player, true)
	expect(weather.wetness).toBeGreaterThan(0)
})
