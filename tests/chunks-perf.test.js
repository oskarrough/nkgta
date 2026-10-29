import { expect, test } from 'bun:test'
import { createCanvas, Path2D, DOMMatrix } from '@napi-rs/canvas'
import * as THREE from 'three'
import { renderMapImage, renderRoofImage } from '../src/map-image.js'
import { createWeather } from '../src/weather.js'
import { kerbLines } from '../src/kerbs.js'

const previousLocation = globalThis.location
globalThis.location = { search: '' }
const { createCity } = await import('../src/scene.js')
if (previousLocation === undefined) delete globalThis.location
else globalThis.location = previousLocation

// Real geometry and CPU rasterization, without a GPU or browser startup.
// These guard resource allocation/uploads, not temporary JS objects or GPU time.
const view = { x0: 0, y0: 0, x1: 128, y1: 128 }
function fixture() {
	const buildings = []
	const fronts = []
	const murals = []
	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 4; col++) {
			const x = 8 + col * 28
			const y = 8 + row * 28
			const n = buildings.length
			buildings.push({ h: 18, rings: [[x, y, x + 12, y, x + 12, y + 12, x, y + 12, x, y]] })
			fronts.push('Kiez Café', '', 'cafe', n, x + 6, y, 0, -1, 1, 0, 4)
			murals.push({ x: x + 12, y: y + 6, w: 8 })
		}
	}
	const points = [
		{ x: 0, y: 64 },
		{ x: 128, y: 64 },
	]
	const shapes = [
		{ t: 1, layer: 7, w: 6, line: [0, 64, 128, 64] },
		...kerbLines(points, { cycleway: 'lane', dual_carriageway: 'yes' }, 6, () => 0),
	]
	return {
		W: 128,
		H: 128,
		tileM: 3,
		buildings,
		fronts,
		murals,
		shapes,
		trees: [],
		roadNodes: [0, 64, 128, 64],
		roads: [{ nodes: [0, 1], w: 6, park: [0, 0] }],
		heightAt: () => 0,
		slopeAt: () => [0, 0],
		tileAt: () => 0,
	}
}

function harness(run) {
	const saved = Object.fromEntries(
		['document', 'Path2D', 'DOMMatrix', 'Worker'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
	)
	const calls = { canvas: 0, paint: 0, upload: 0, compile: 0, write: 0 }
	const setters = [THREE.BufferAttribute, THREE.Material, THREE.Texture].map(({ prototype }) => {
		const descriptor = Object.getOwnPropertyDescriptor(prototype, 'needsUpdate')
		Object.defineProperty(prototype, 'needsUpdate', {
			...descriptor,
			set(value) {
				if (value) calls.write++
				descriptor.set.call(this, value)
			},
		})
		return [prototype, descriptor]
	})
	const workers = []
	const canvases = []
	globalThis.Path2D = Path2D
	globalThis.DOMMatrix = DOMMatrix
	globalThis.document = {
		createElement(tag) {
			if (tag !== 'canvas') throw new Error(`Unexpected element: ${tag}`)
			calls.canvas++
			const canvas = createCanvas(1, 1)
			canvases.push(canvas)
			return canvas
		},
	}
	globalThis.Worker = class {
		constructor() {
			workers.push(this)
		}
		postMessage(message) {
			if (message.world) return
			calls.paint++
			this.pending = message
		}
	}
	const renderer = {
		capabilities: { getMaxAnisotropy: () => 1 },
		initTexture: () => calls.upload++,
		compileAsync: () => {
			calls.compile++
			return Promise.resolve()
		},
	}
	function build() {
		const firstCanvas = canvases.length
		const world = fixture()
		const sky = Object.fromEntries(['sun', 'shade', 'deck', 'toSun', 'night', 'home'].map((key) => [key, { value: 0 }]))
		const weather = createWeather(world, [], sky.night, '')
		const city = createCity(world, renderer, { sky, gradient: null, time: { value: 0 }, wallLook: new THREE.MeshBasicMaterial(), weather })
		city.update(view, 1.5)
		// Workers retain their asynchronous boundary; their actual painters run here.
		while (workers.some((worker) => worker.pending)) {
			for (const worker of workers) {
				if (!worker.pending) continue
				const { kind, area, roofs } = worker.pending
				worker.pending = null
				const pitched = new Map(roofs)
				const bitmap = kind === 'ground' ? renderMapImage(world, area) : renderRoofImage(world, (n) => pitched.get(n), area)
				bitmap.close = () => {}
				worker.onmessage({ data: { bitmap, ms: 0 } })
			}
			city.update(view, 1.5)
		}
		// Flush native drawing before stopping the CPU clock.
		for (const canvas of canvases.slice(firstCanvas)) canvas.getContext('2d').getImageData(0, 0, 1, 1)
		return city
	}
	try {
		return run({ build, calls })
	} finally {
		for (const [prototype, descriptor] of setters) Object.defineProperty(prototype, 'needsUpdate', descriptor)
		for (const [key, descriptor] of Object.entries(saved)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor)
			else delete globalThis[key]
		}
	}
}

// Monotonic three.js IDs catch even resources constructed and discarded within
// a frame. Versions catch repeat uploads even when the bytes haven't changed.
function resourceIds() {
	return [new THREE.Object3D().id, new THREE.BufferGeometry().id, new THREE.Material().id, new THREE.Texture().id]
}
function resources(group) {
	const state = []
	group.traverse((object) => {
		state.push(object)
		if (!object.geometry) return
		state.push(object.geometry, object.material, object.material.version)
		for (const attribute of [
			object.geometry.index,
			object.instanceMatrix,
			object.instanceColor,
			...Object.values(object.geometry.attributes),
		]) {
			if (attribute) state.push(attribute, attribute.array, attribute.version, attribute.array.slice())
		}
		for (const value of Object.values(object.material)) if (value?.isTexture) state.push(value, value.version)
	})
	return state
}
function dispose(city) {
	const resources = new Set()
	city.group.traverse((object) => {
		if (object.geometry) resources.add(object.geometry)
		if (object.material) {
			resources.add(object.material)
			for (const value of Object.values(object.material)) if (value?.isTexture) resources.add(value)
		}
	})
	for (const resource of resources) resource.dispose()
}

test('settled idle chunk frames allocate no render resources and request no writes', () =>
	harness(({ build, calls }) => {
		const city = build()
		expect(city.stats()).toMatchObject({ built: 1, textures: 2, painting: 0 })
		// Ensure the fixture really includes fascia atlases, murals, firewalls and kerb furniture.
		const meshes = []
		city.group.traverse((o) => {
			if (o.isMesh) meshes.push(o)
		})
		expect(meshes.filter((o) => o.material.map?.isCanvasTexture).length).toBeGreaterThanOrEqual(2)
		expect(meshes.some((o) => o.geometry.attributes.wall?.array.some((v, i) => i % 4 === 1 && v === -1))).toBe(true)
		expect(meshes.some((o) => o.isInstancedMesh && o.count > 10)).toBe(true)
		const before = resources(city.group)
		const writes = { ...calls }
		const ids = resourceIds()
		for (let frame = 0; frame < 120; frame++) city.update(view, 1.5)
		expect(resourceIds()).toEqual(ids.map((id) => id + 1))
		expect(resources(city.group)).toEqual(before)
		expect(calls).toEqual(writes)
		dispose(city)
	}))

// A plain canvas fill plus a fixed number of box meshes calibrates both native
// painting and JS geometry work. The 12× ceiling allows about twice the
// initial cost; it catches large regressions, not small timing noise.
// No absolute millisecond limit or CPU model.
function baseline() {
	const canvas = createCanvas(2048, 1536)
	const context = canvas.getContext('2d')
	for (let i = 0; i < 512; i++) {
		context.fillStyle = i % 2 ? '#333' : '#ddd'
		context.fillRect(0, 0, canvas.width, canvas.height)
		const geometry = new THREE.BoxGeometry(12, 12, 6)
		geometry.computeBoundingSphere()
		geometry.dispose()
	}
	return context.getImageData(0, 0, 1, 1).data[0]
}
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
test('a decorated chunk builds and paints within the relative CPU budget', () =>
	harness(({ build }) => {
		// One warmup, then interleaved samples; medians tolerate a scheduler/GC pause.
		dispose(build())
		baseline()
		const ratios = []
		for (let i = 0; i < 5; i++) {
			const start = performance.now()
			baseline()
			const baseMs = performance.now() - start
			const chunkStart = performance.now()
			const city = build()
			const chunkMs = performance.now() - chunkStart
			ratios.push(chunkMs / baseMs)
			dispose(city)
		}
		const ratio = median(ratios)
		console.info(`Chunk CPU budget: ${ratio.toFixed(2)}× baseline (limit 12×)`)
		expect(ratio).toBeLessThan(12)
	}))
