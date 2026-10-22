import { describe, expect, test } from 'bun:test'
import { freeRoad, follow, stopAt, pedal } from '../src/traffic.js'
import { signalPhase, waveOffset } from '../src/junctions.js'
import { createCar, driveCar, forwardSpeed } from '../src/car.js'
import { MODELS } from '../src/models.js'
import { T } from '../src/tiles.js'

const d = MODELS.car.driver
const L = MODELS.car.length

describe('intelligent driver model', () => {
	test('pulls away hard, eases off at the speed it likes', () => {
		expect(freeRoad(d, 0, 4)).toBeCloseTo(d.a)
		expect(freeRoad(d, 4, 4)).toBeCloseTo(0)
		expect(freeRoad(d, 5, 4)).toBeLessThan(0)
	})

	test('brakes harder for a standing car than for one driving off', () => {
		expect(follow(d, 4, 10, 0)).toBeLessThan(follow(d, 4, 10, 4))
		expect(follow(d, 4, 5, 4)).toBeLessThan(follow(d, 4, 10, 4))
	})

	test('stands still at its standing gap', () => {
		expect(freeRoad(d, 0, 4) + follow(d, 0, d.s0, 0)).toBeCloseTo(0)
	})

	// One lane, cars in a row: the IDM alone, no tyres.
	function run(cars, line, seconds, v0 = 4, dt = 1 / 60) {
		let closest = Infinity
		const moved = cars.map(() => null)
		for (let t = 0; t < seconds; t += dt) {
			const acc = cars.map((c, i) => {
				let worst = line(t) === undefined ? 0 : stopAt(d, c.v, line(t) - c.x)
				const ahead = cars[i - 1]
				if (ahead) worst = Math.min(worst, follow(d, c.v, ahead.x - c.x - L, ahead.v))
				return freeRoad(d, c.v, v0) + worst
			})
			cars.forEach((c, i) => {
				c.v = Math.max(0, c.v + acc[i] * dt)
				c.x += c.v * dt
				if (moved[i] === null && c.v > 0.5) moved[i] = t
				if (cars[i - 1]) closest = Math.min(closest, cars[i - 1].x - c.x - L)
			})
		}
		return { closest, moved }
	}

	test('a platoon stops at a red light without touching, and nobody runs it', () => {
		const cars = Array.from({ length: 6 }, (_, i) => ({ x: -i * 8, v: 4 }))
		const { closest } = run(cars, () => 40, 30)
		expect(closest).toBeGreaterThan(d.s0 * 0.8)
		expect(cars[0].x).toBeLessThanOrEqual(40)
		expect(cars[0].x).toBeGreaterThan(39)
		for (const c of cars) expect(c.v).toBeLessThan(0.05)
	})

	test('a queue moves off at green car by car', () => {
		const cars = Array.from({ length: 6 }, (_, i) => ({ x: -i * (L + d.s0), v: 0 }))
		const { closest, moved } = run(cars, () => undefined, 20)
		expect(closest).toBeGreaterThan(d.s0 * 0.8)
		for (let i = 1; i < moved.length; i++) expect(moved[i]).toBeGreaterThan(moved[i - 1] + 0.3)
		for (const c of cars) expect(c.v).toBeGreaterThan(3)
	})

	test('the pedal holds the speed the driver wants against drag', () => {
		const world = { tileAt: () => T.ROAD }
		for (const model of [MODELS.car, MODELS.bus, MODELS.lambo]) {
			const c = createCar({ x: 0, y: 0, model })
			for (let t = 0; t < 30; t += 1 / 60) {
				const v = forwardSpeed(c)
				driveCar(c, { throttle: pedal(model, freeRoad(model.driver, v, 4), v) }, world, 1 / 60)
			}
			expect(forwardSpeed(c)).toBeGreaterThan(3.8)
			expect(forwardSpeed(c)).toBeLessThan(4.1)
		}
	})
})

describe('traffic lights', () => {
	test('green, amber, red, and the cross road is never green at the same time', () => {
		expect(signalPhase(0)).toBe('green')
		expect(signalPhase(12.5)).toBe('amber')
		expect(signalPhase(15)).toBe('red')
		expect(signalPhase(-1)).toBe('red')
		for (let t = 0; t < 32; t += 0.25) {
			const cross = signalPhase(t + 16)
			expect(signalPhase(t) === 'green' && cross === 'green').toBe(false)
		}
	})

	test('both ways along a road share one wave', () => {
		const p = { x: 30, y: 12 }
		expect(waveOffset(p, 0.4)).toBeCloseTo(waveOffset(p, 0.4 + Math.PI))
		expect(waveOffset(p, -2)).toBeCloseTo(waveOffset(p, -2 + Math.PI))
	})

	test('a car at wave speed catches the next green down the road', () => {
		const heading = 0.3
		const a = { x: 100, y: 50 }
		const b = { x: a.x + Math.cos(heading) * 80, y: a.y + Math.sin(heading) * 80 }
		// Leave a as its light turns green, drive the 80 tiles at 4.6 tiles/s.
		const start = -waveOffset(a, heading) + 32 * 10
		expect(signalPhase(start + waveOffset(a, heading))).toBe('green')
		expect(signalPhase(start + 80 / 4.6 + 0.5 + waveOffset(b, heading))).toBe('green')
	})
})
