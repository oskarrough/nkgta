import { expect, test } from 'bun:test'
import { decodeMap, encodeMap } from '../src/map-codec.js'

const sha = (bytes) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex')

test('the default map walks exactly as it did when split streets narrowed to their lanes', async () => {
	const map = decodeMap(await Bun.file('public/map.json').json())
	// Hashes of the grids as shipped when split streets narrowed (#19).
	expect(sha(map.tiles)).toBe('d9f342125a7e9ff25dc988046d6948b8793ed0133c74403d9cdbb16660ad2c0d')
	expect(sha(new Uint8Array(map.streetOf.buffer))).toBe('a9374cfbddc5b9c95d2bdda59c608eef71c77a27a134cbfc1eaf7a553613f231')
})

test('a map comes back from JSON exactly as it went in', () => {
	const map = {
		w: 3,
		h: 2,
		tileM: 3,
		tiles: new Uint8Array([1, 1, 1, 4, 4, 0]),
		streetOf: new Uint16Array([0, 300, 300, 0, 0, 7]),
		streets: ['', 'Sonnenallee'],
		shapes: [
			{ t: 2, layer: 3, w: 2.7, line: [-1.3, 0.1, 2.9, 1.4] },
			{ t: 5, layer: 0, rings: [[0.1, 0.2, 1700.3, 0.2, 0.3, 1187.9]] },
		],
		buildings: [{ h: 17, rings: [[206.5, 1118.6, 209.5, 1114.3, 206.5, 1118.6]] }],
		trees: [{ x: 162.4, y: 1184.9, crown: 6.4, top: 12.2 }],
		roadNodes: [0.3, 0.7, 12.1, -0.4],
	}
	expect(decodeMap(JSON.parse(JSON.stringify(encodeMap(map))))).toEqual(map)
})
