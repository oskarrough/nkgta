import { expect, test } from 'bun:test'
import { groundMaterial } from '../src/scene-ground.js'

const previousLocation = globalThis.location
globalThis.location = { search: '' }
const { build } = await import('../src/road-paint.js')
if (previousLocation === undefined) delete globalThis.location
else globalThis.location = previousLocation

test('static paint releases CPU buffers, restores after context loss and unregisters on disposal', () => {
	const world = {
		W: 16,
		H: 16,
		flat: true,
		shapes: [{ t: 1, layer: 7, w: 4, line: [0, 8, 16, 8] }],
		heightAt: () => 0,
		slopeAt: () => [0, 0],
	}
	const ground = groundMaterial(null, world)
	const canvas = new EventTarget()
	const generator = build({ world, chunk: { x: 0, y: 0, w: 16, h: 16 }, ground, canvas })
	let step
	do step = generator.next()
	while (!step.done)
	const part = step.value
	const mesh = part.meshes[0]
	const first = mesh.geometry
	const count = first.index.count
	const upload = (geometry) => {
		for (const a of [...Object.values(geometry.attributes), geometry.index]) {
			a.onUploadCallback()
			expect(a.array).toBeNull()
			expect(a.count).toBeGreaterThan(0)
		}
	}
	upload(first)
	expect(first.boundingBox.isEmpty()).toBe(false)
	expect(Number.isFinite(first.boundingSphere.radius)).toBe(true)
	canvas.dispatchEvent(new Event('webglcontextrestored'))
	expect(mesh.geometry).not.toBe(first)
	expect(mesh.geometry.index.count).toBe(count)
	expect(mesh.geometry.attributes.position.array).toBeInstanceOf(Float32Array)
	upload(mesh.geometry)
	const restored = mesh.geometry
	part.dispose()
	canvas.dispatchEvent(new Event('webglcontextrestored'))
	expect(mesh.geometry).toBe(restored)
	mesh.geometry.dispose()
	mesh.material.dispose()
	ground.dispose()
})

test('chunk construction suspends for worker results instead of blocking the frame', async () => {
	const { createChunks } = await import('../src/chunks.js')
	const { Group } = await import('three')
	const previousWorker = globalThis.Worker
	globalThis.Worker = class {
		postMessage() {}
	}
	try {
		let finish,
			resumed = 0
		const pending = new Promise((resolve) => {
			finish = resolve
		})
		const city = createChunks({ W: 16, H: 16, shapes: [], buildings: [] }, {}, function* () {
			yield pending
			resumed++
			return { group: new Group(), roofs: [], show() {} }
		})
		const view = { x0: 0, y0: 0, x1: 16, y1: 16 }
		city.update(view, 1.5)
		city.update(view, 1.5)
		expect(resumed).toBe(0)
		expect(city.stats().built).toBe(0)
		finish()
		await pending
		city.update(view, 1.5)
		expect(resumed).toBe(1)
		expect(city.stats().built).toBe(1)
	} finally {
		if (previousWorker === undefined) delete globalThis.Worker
		else globalThis.Worker = previousWorker
	}
})
