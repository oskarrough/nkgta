import { expect, test } from 'bun:test'
import { padDrive, stickOf } from '../src/gamepad.js'

const GAS = 7
const BRAKE = 6
const B = 1

// A pad as the browser hands it over: four axes and a pile of buttons.
const pad = (axes, down = [], triggers = {}) => ({
	axes,
	buttons: Array.from({ length: 17 }, (_, i) => {
		const held = down.includes(i)
		return { pressed: held || (triggers[i] ?? 0) > 0.5, value: triggers[i] ?? (held ? 1 : 0) }
	}),
})
const car = (angle = 0, speed = 0) => ({ angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed })

test('the stick ignores the middle and still reaches full deflection at the rim', () => {
	expect(stickOf(pad([0.1, -0.05]))).toEqual({ x: 0, y: 0 })
	expect(stickOf(pad([1, 0])).x).toBeCloseTo(1)
	// Just past the deadzone is a crawl, not a sprint.
	expect(stickOf(pad([0.5, 0])).x).toBeCloseTo(0.35 / 0.85)
	expect(stickOf(pad([0, 0.5])).y).toBeCloseTo(0.35 / 0.85)
	// A stick with no pad behind it moves nothing.
	expect(stickOf(null)).toEqual({ x: 0, y: 0 })
})

test('triggers are gas and brake, the stick steers', () => {
	const gas = padDrive(car(), pad([1, 0], [], { [GAS]: 0.8 }))
	expect(gas.throttle).toBeCloseTo(0.8)
	expect(gas.turn).toBeCloseTo(1)
	expect(gas.handbrake).toBe(false)
	expect(padDrive(car(), pad([0, 0], [], { [BRAKE]: 1 })).throttle).toBeCloseTo(-1)
	// Both feet down: half gas, half brake, going nowhere.
	expect(padDrive(car(), pad([0, 0], [], { [GAS]: 0.5, [BRAKE]: 0.25 })).throttle).toBeCloseTo(0.25)
})

test('B is the handbrake in a car', () => {
	expect(padDrive(car(), pad([0, 0], [B], { [GAS]: 1 })).handbrake).toBe(true)
})

test('with no trigger pulled the stick drives the way the thumbstick does', () => {
	// Ahead: full throttle, no steering.
	const ahead = padDrive(car(), pad([1, 0]))
	expect(ahead.throttle).toBeCloseTo(1)
	expect(ahead.turn).toBeCloseTo(0)
	// Off to the left: the car creeps forward and turns that way.
	const left = padDrive(car(), pad([0, -1]))
	expect(left.throttle).toBeCloseTo(0.4)
	expect(left.turn).toBeLessThan(0)
	// Pointing against the nose reverses, and steering flips with it.
	const back = padDrive(car(), pad([-1, 0.3]))
	expect(back.throttle).toBeLessThan(0)
	expect(back.turn).toBeLessThan(0)
})
