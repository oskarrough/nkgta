import { expect, test } from 'bun:test'
import * as THREE from 'three'
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
	expect(weather.streaks.visible).toBe(true)
	weather.update(25, player, false)
	expect(weather.wetness).toBe(1)
	weather.setMode('dry')
	weather.update(1, player, false)
	expect(weather.wetness).toBeGreaterThan(0.9)
	weather.update(120, player, false)
	expect(weather.wetness).toBe(0)
	expect(weather.streaks.visible).toBe(false)
})

test('automatic weather starts a shower, then clears again', () => {
	const weather = make()
	weather.update(136, player, false)
	expect(weather.streaks.visible).toBe(true)
	weather.update(91, player, false)
	expect(weather.streaks.visible).toBe(false)
})

test('indoors hides the streaks while the street keeps getting wet', () => {
	const weather = make()
	weather.setMode('rain')
	weather.update(10, player, true)
	expect(weather.streaks.visible).toBe(false)
	expect(weather.wetness).toBeGreaterThan(0)
})

test('flat picked areas can puddle, grass stays dry and slopes shed water', () => {
	const mask = (heightAt, tileAt) => {
		const weather = createWeather({ heightAt, tileAt }, [], { value: 0 }, '')
		const material = new THREE.ShaderMaterial()
		weather.ground(material, { x: 0, y: 0, w: 1, h: 1 })
		const data = [...material.uniforms.wetMask.value.image.data]
		material.dispose()
		return data
	}
	expect(
		mask(
			() => 0,
			() => T.ROAD,
		).slice(0, 2),
	).toEqual([255, 115])
	expect(
		mask(
			() => 0,
			() => T.GRASS,
		)[0],
	).toBe(0)
	expect(
		mask(
			(x) => x,
			() => T.ROAD,
		)[1],
	).toBe(0)
})
