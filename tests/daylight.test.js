import { expect, test } from 'bun:test'
import { createClock, daylight, HOUR_SECONDS, lightDirection } from '../src/daylight.js'

test('the sun comes up in the east, stands south at midday and sets in the west', () => {
	expect(lightDirection(7).x).toBeGreaterThan(0.5)
	expect(lightDirection(13.5).y).toBeLessThan(-0.2)
	expect(lightDirection(13.5).z).toBeGreaterThan(0.7)
	expect(lightDirection(20).x).toBeLessThan(-0.5)
	// At night the light is the moon's, the same all night.
	expect(lightDirection(1).toArray()).toEqual(lightDirection(3).toArray())
})

test('night is dark, lit and shadowless; midday is the other way round', () => {
	const midnight = daylight(0)
	const noon = daylight(12)
	expect(midnight.night).toBe(1)
	expect(midnight.shadow).toBe(0)
	expect(midnight.home).toBeGreaterThan(noon.home)
	expect(midnight.sun[1]).toBeLessThan(noon.sun[1])
	expect(noon.night).toBe(0)
	expect(noon.shadow).toBe(1)
})

test('the hours blend smoothly, across midnight too', () => {
	for (let h = 0; h < 24; h += 0.25) {
		const a = daylight(h)
		const b = daylight(h + 0.05)
		expect(Math.abs(a.night - b.night)).toBeLessThan(0.05)
		expect(Math.abs(a.sky.r - b.sky.r)).toBeLessThan(0.05)
	}
	expect(daylight(24).night).toBe(daylight(0).night)
})

test('the clock runs an hour every HOUR_SECONDS and wraps at midnight', () => {
	const clock = createClock(23.5)
	clock.tick(HOUR_SECONDS)
	expect(clock.hour).toBeCloseTo(0.5)
	clock.set(-1)
	expect(clock.hour).toBe(23)
})
