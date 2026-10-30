import { expect, test } from 'bun:test'
import { encodeRoofs, decodeRoofs } from '../src/roof-codec.js'
import { applyMeasuredRoofs } from '../src/measured-roofs.js'

test('binary roofs retain exact outlines, heights, holes and survey precision', () => {
	const rings = [[1.1, 2.2, 3.3, 4.4, 5.5, 6.6]]
	const data = {
		bbox: { south: 52.4645, west: 13.3852, north: 52.4965, east: 13.4605 },
		tileM: 3,
		buildings: [
			{
				rings,
				h: 12.34,
				faces: [
					[
						[
							[1.1234, -2.2345, 3.3456],
							[2, -3, 4],
							[3, -4, -0.1234],
						],
						[
							[2, -3, 1],
							[3, -4, 1],
							[4, -5, 1],
						],
					],
				],
			},
		],
	}
	const decoded = decodeRoofs(encodeRoofs(data))
	expect(decoded).toEqual(data)
	const map = { ...data, buildings: [{ rings, h: 10 }] }
	applyMeasuredRoofs(map, decoded)
	expect(map.buildings[0].roof.faces).toEqual(data.buildings[0].faces)
	expect(map.buildings[0].h).toBe(12.34)
	expect(() => decodeRoofs(encodeRoofs(data).slice(0, -4))).toThrow()
})
