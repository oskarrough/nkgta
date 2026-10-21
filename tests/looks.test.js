import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { createInk } from '../src/ink.js'
import { DEFAULT_LOOK, LOOKS, nextLook, upscaleOf } from '../src/looks.js'

// What a look does to one frame: each render call, as what was drawn, into
// where, in what material, and whether the decor was showing. Only the
// renderer's bookkeeping is faked.
function frame(look) {
	const calls = []
	let into = null
	const city = new THREE.Scene()
	const clouds = new THREE.Group()
	const renderer = {
		shadowMap: {},
		setRenderTarget: (t) => (into = t),
		render: (scene) =>
			calls.push({
				city: scene === city,
				out: into === null,
				material: scene.overrideMaterial?.type ?? null,
				clouds: clouds.visible,
			}),
	}
	const ink = createInk(renderer, [], [clouds])
	ink.setLook(look)
	ink.render(city, new THREE.PerspectiveCamera())
	return { calls, clouds }
}

describe('looks', () => {
	test('P goes through raw, default and pixel, and back', () => {
		const seen = [DEFAULT_LOOK]
		for (let i = 0; i < 3; i++) seen.push(nextLook(seen.at(-1)))
		expect(new Set(seen)).toEqual(new Set(['default', 'pixel', 'raw']))
		expect(seen.at(-1)).toBe(DEFAULT_LOOK)
	})

	test('only pixel art draws coarse pixels', () => {
		for (const [name, look] of Object.entries(LOOKS)) expect(upscaleOf(look, 120)).toBe(name === 'pixel' ? 12 : 1)
	})

	test('default draws the city as painted, then normals, ink and the composite', () => {
		const { calls } = frame(LOOKS.default)
		expect(calls.map((c) => [c.city, c.out, c.material])).toEqual([
			[true, false, null],
			[true, false, 'MeshNormalMaterial'],
			[false, false, null],
			[false, true, null],
		])
		expect(calls[0].clouds).toBe(true)
		expect(LOOKS.default.palette).toBe(false)
	})

	test('raw draws everything plain, without the decor, and puts it back after', () => {
		const { calls, clouds } = frame(LOOKS.raw)
		expect(calls[0]).toMatchObject({ city: true, material: 'MeshLambertMaterial', clouds: false })
		expect(calls[1]).toMatchObject({ city: true, material: 'MeshNormalMaterial' })
		expect(clouds.visible).toBe(true)
	})

	test('pixel art is the default, inked one pixel wide and snapped to the palette', () => {
		expect(frame(LOOKS.pixel).calls[0]).toMatchObject({ material: null, clouds: true })
		expect(LOOKS.pixel).toMatchObject({ outline: 1, palette: true, grid: true, plain: false })
	})
})
