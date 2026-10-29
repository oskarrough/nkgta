import { describe, expect, test } from 'bun:test'
import { applyMeasuredRoofs, measuredHeight, planeOf, roofSteps } from '../src/measured-roofs.js'
import { fitRoofs, fromUtm33, parseLod2 } from '../scripts/lod2.js'
import { toUtm33 } from '../src/utm.js'
import { BBOX } from '../src/default-area.js'

const rings = [[0, 0, 10, 0, 10, 10, 0, 10]]
const faces = [
	[
		[
			[0, 0, 0],
			[5, 0, 3],
			[5, -10, 3],
			[0, -10, 0],
		],
	],
	[
		[
			[5, 0, 3],
			[10, 0, 0],
			[10, -10, 0],
			[5, -10, 3],
		],
	],
]
const roof = { kind: 'measured', faces }

describe('measured roofs', () => {
	test('fits a real ridge, including the middle of a gable wall', () => {
		expect(measuredHeight(roof, 5, -5)).toBeCloseTo(3)
		expect(measuredHeight(roof, 2.5, -5)).toBeCloseTo(1.5)
		expect(measuredHeight(roof, 10, -5)).toBeCloseTo(0)
	})

	test('derives the plane from a broad triangle, not a rounded survey sliver', () => {
		expect(
			planeOf([
				[0, 0, 0],
				[1, 0.000002, 0],
				[2, 0, 0],
				[2, 10, 10],
				[0, 10, 10],
			]),
		).toEqual([0, 1, 0])
	})

	test('closes the vertical step above a lower annex', () => {
		const stepped = {
			kind: 'measured',
			faces: [
				[
					[
						[0, 0, 3],
						[5, 0, 3],
						[5, -10, 3],
						[0, -10, 3],
					],
				],
				[
					[
						[5, 0, 0],
						[10, 0, 0],
						[10, -10, 0],
						[5, -10, 0],
					],
				],
			],
		}
		expect(roofSteps(roof)).toHaveLength(0)
		const steps = roofSteps(stepped)
		expect(steps).toHaveLength(1)
		expect(steps[0].za).toBe(0)
		expect(steps[0].a[2]).toBe(3)
	})

	test('only attaches to the same footprint and area, independent of map order', () => {
		const a = { rings, h: 10 },
			b = { rings: [[1, 2, 3, 4, 5, 6]], h: 8 }
		const map = { bbox: BBOX, tileM: 3, buildings: [b, a] }
		applyMeasuredRoofs(map, { bbox: BBOX, tileM: 3, buildings: [{ rings, h: 14, faces }] })
		expect(a.h).toBe(14)
		expect(a.roof.faces).toEqual(faces)
		expect(b.roof).toBeUndefined()
		const picked = { bbox: { ...BBOX, south: 52 }, tileM: 3, buildings: [{ rings, h: 10 }] }
		applyMeasuredRoofs(picked, { bbox: BBOX, tileM: 3, buildings: [{ rings, h: 14, faces }] })
		expect(picked.buildings[0].h).toBe(10)
	})

	test('clips measured surfaces around a courtyard and rejects partial matches', () => {
		const map = { tileM: 3, buildings: [{ rings: [...rings, [3, 3, 7, 3, 7, 7, 3, 7]], h: 10 }] }
		const model = {
			box: [-1, -1, 11, 11],
			roofs: [
				[
					[
						[-1, -1, 4],
						[11, -1, 4],
						[11, 11, 4],
						[-1, 11, 4],
						[-1, -1, 4],
					],
				],
			],
		}
		const fitted = fitRoofs(map, [model])
		expect(fitted).toHaveLength(1)
		expect(fitted[0].h).toBe(12)
		expect(fitted[0].faces[0]).toHaveLength(2)
		model.roofs = [
			[
				[
					[0, 0, 4],
					[5, 0, 4],
					[5, 10, 4],
					[0, 10, 4],
					[0, 0, 4],
				],
			],
		]
		expect(fitRoofs(map, [model])).toHaveLength(0)
	})

	test('projects Berlin survey coordinates back into the map', () => {
		const { e, n } = toUtm33(52.48, 13.43)
		const p = fromUtm33(e, n, BBOX)
		expect(p.lat).toBeCloseTo(52.48, 8)
		expect(p.lon).toBeCloseTo(13.43, 8)
		const list = (z) => `${e} ${n} ${z} ${e + 10} ${n} ${z} ${e + 10} ${n + 10} ${z} ${e} ${n} ${z}`
		const surface = (type, z) =>
			`<bldg:${type}Surface><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>${list(z)}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></bldg:${type}Surface>`
		const xml = `<core:cityObjectMember><bldg:Building gml:id="test">${surface('Ground', 40)}${surface('Roof', 58)}</bldg:Building></core:cityObjectMember>`
		const [model] = parseLod2(xml, { bbox: BBOX, tileM: 3, w: 2000, h: 2000 })
		expect(model.roofs[0][0][0][2]).toBe(6)
	})
})
