import { describe, expect, test } from 'bun:test'
import { createCamera } from '../src/camera.js'
import { MODELS } from '../src/models.js'
import { T } from '../src/tiles.js'

globalThis.devicePixelRatio = 1
const canvas = { width: 1280, height: 720 }
const yawOf = (camera) => {
	const forward = camera.move({ x: 0, y: -1 })
	return Math.atan2(forward.y, forward.x)
}
function setup(model = null, tileAt = () => T.ROAD) {
	const player = { x: 0, y: 0, dir: 0, speed: 3, onBike: !model, car: model ? { model, angle: 0, vx: 3, vy: 0 } : null }
	const camera = createCamera({ tileAt })
	camera.toggle(player)
	const step = (frames = 1) => {
		let frame
		for (let i = 0; i < frames; i++) frame = camera.update(player, canvas, 1 / 60, false)
		return frame.third
	}
	return { camera, player, step }
}

describe('vehicle orbit camera', () => {
	for (const model of [null, MODELS.car, MODELS.bus]) {
		test(`follows turns smoothly on ${model?.name ?? 'bike'}`, () => {
			const { camera, player, step } = setup(model)
			player.dir = Math.PI / 2
			step()
			expect(yawOf(camera)).toBeGreaterThan(0)
			expect(yawOf(camera)).toBeLessThan(0.1)
			step(180)
			expect(Math.abs(yawOf(camera) - Math.PI / 2)).toBeLessThan(0.01)
		})
	}

	test('holding right mouse wins even without mouse movement; release waits before returning', () => {
		const { camera, player, step } = setup()
		camera.setLooking(true)
		camera.look(200, 0)
		player.dir = 2
		step(180)
		expect(yawOf(camera)).toBeCloseTo(0.8, 6)
		camera.setLooking(false)
		step(60)
		expect(yawOf(camera)).toBeCloseTo(0.8, 6)
		step(180)
		expect(yawOf(camera)).toBeGreaterThan(1.9)
	})

	test('stopped vehicles and walking leave the orbit alone', () => {
		const { camera, player, step } = setup()
		player.dir = 2
		player.speed = 0
		step(180)
		expect(yawOf(camera)).toBe(0)
		player.onBike = false
		player.speed = 2
		step(180)
		expect(yawOf(camera)).toBe(0)
	})

	test('reversing keeps the camera behind the nose', () => {
		const { camera, player, step } = setup(MODELS.bus)
		player.car.vx = -3
		const view = step(180)
		expect(yawOf(camera)).toBe(0)
		expect(view.x).toBeLessThan(player.x)
		expect(view.target.x).toBeLessThan(player.x)
	})

	test('speed increases distance and forward visibility', () => {
		const { player, step } = setup(MODELS.car)
		player.speed = player.car.vx = 0
		const parked = step(180)
		player.speed = player.car.vx = 10
		const cruising = step(180)
		expect(cruising.x).toBeLessThan(parked.x - 1)
		expect(cruising.target.x).toBeGreaterThan(parked.target.x + 1)
	})

	test('walls shorten the boom immediately, then it waits and recovers gradually', () => {
		let wall = false
		const { step } = setup(null, (x) => (wall && x < -1 ? T.BUILDING : T.ROAD))
		const open = step(180)
		wall = true
		const blocked = step()
		expect(blocked.x).toBeGreaterThan(-1)
		wall = false
		expect(step(20).x).toBeCloseTo(blocked.x)
		const recovering = step(30)
		expect(recovering.x).toBeLessThan(blocked.x)
		expect(recovering.x).toBeGreaterThan(open.x + 1)
		expect(step(180).x).toBeCloseTo(open.x, 2)
	})

	test('a wall flickering in and out of the boom does not pump the camera', () => {
		let frame = 0
		const { step } = setup(null, (x) => (Math.floor(frame / 10) % 2 && x < -1 ? T.BUILDING : T.ROAD))
		step(180)
		const xs = []
		for (; frame < 120; frame++) xs.push(step().x)
		// Pulled in once, and no easing back out while the wall keeps returning.
		const outward = xs.slice(1).filter((x, i) => x < xs[i] - 0.01)
		expect(outward).toEqual([])
	})
})
