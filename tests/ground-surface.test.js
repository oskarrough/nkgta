import { expect, test } from 'bun:test'
import { surfaceFrame, surfacePoint } from '../src/ground-surface.js'
import { T } from '../src/tiles.js'

test('surface coordinates retain their phase through bends and reversed ways', () => {
	const line = [100, 50, 110, 50, 110, 60]
	const forward = surfaceFrame({ line })
	const reverse = surfaceFrame({ line: [110, 60, 110, 50, 100, 50] })
	for (const point of [
		[104, 51],
		[109.99, 50],
		[110, 50.01],
		[111, 55],
	])
		expect(surfacePoint(forward, ...point)).toEqual(surfacePoint(reverse, ...point))
	const before = surfacePoint(forward, 109.99, 50)
	const after = surfacePoint(forward, 110, 50.01)
	expect(after[0] - before[0]).toBeCloseTo(0.06)
	expect(before[1]).toBeCloseTo(0)
	expect(after[1]).toBeCloseTo(0)
})

test('pavement bands agree on both road shoulders and across the two pavement strokes', () => {
	const line = [0, 0, 20, 0]
	const inner = surfaceFrame({ t: T.SIDEWALK, layer: 3, w: 6, line })
	const outer = surfaceFrame({ t: T.SIDEWALK, layer: -1, w: 10, line })
	for (const side of [-1, 1]) {
		// Ten-metre road, band centre two metres past its kerb.
		const point = [8, (side * 7) / 3]
		expect(surfacePoint(inner, ...point)[1]).toBeCloseTo(0)
		expect(surfacePoint(inner, ...point)).toEqual(surfacePoint(outer, ...point))
	}
})

test('surface distances are metres, independent of map tile size and redundant nodes', () => {
	const a = surfaceFrame({ line: [10, 10, 20, 10] }, 3)
	const b = surfaceFrame({ line: [15, 15, 15, 15, 30, 15] }, 2)
	expect(surfacePoint(a, 15, 11)).toEqual(surfacePoint(b, 22.5, 16.5))
})
