import { expect, test } from 'bun:test'
import { packTrees, treeMeasurements, treeSpecies } from '../scripts/baumkataster.js'
import { applyMeasuredTrees } from '../src/measured-trees.js'
import { BBOX, TILE_M } from '../src/default-area.js'

const feature = (id, coordinates, properties = {}) => ({
	id,
	geometry: { type: 'Point', coordinates },
	properties,
})
const at = [13.43, 52.48]
const map = () => ({ bbox: { ...BBOX }, tileM: TILE_M, w: 1800, h: 1200, trees: [{ x: 1, y: 2, crown: 5, top: 10 }] })

test('projects WFS longitude/latitude into the map and replaces generated trees once', () => {
	const source = { features: [feature('a', at, { gattung: 'Tilia', kronedurch: 8.5, baumhoehe: 17, stammumfg: 150 })] }
	const data = packTrees([source], BBOX, TILE_M)
	const world = map()
	applyMeasuredTrees(world, data)
	expect(world.trees).toHaveLength(1)
	const tree = world.trees[0]
	expect(tree.x).toBeCloseTo(((at[0] - BBOX.west) * 111320 * Math.cos((((BBOX.north + BBOX.south) / 2) * Math.PI) / 180)) / TILE_M, 0)
	expect(tree.y).toBeCloseTo(((BBOX.north - at[1]) * 111320) / TILE_M, 0)
	expect(tree.crown).toBe(8.5)
	expect(tree.top).toBe(17)
	expect(tree.stem).toBeCloseTo(1.5 / (2 * Math.PI), 2)
	expect(tree.species).toBe(2)
	applyMeasuredTrees(world, data)
	expect(world.trees).toHaveLength(1)
})

test('clips register bounds and deduplicates survey IDs across layers', () => {
	const data = packTrees(
		[
			{
				features: [
					feature('street.a', at, { gisid: 'a' }),
					feature('park.a', at, { gisid: 'a' }),
					feature('outside', [BBOX.west - 0.001, at[1]]),
					feature('invalid', [NaN, at[1]]),
					{ id: 'no-location', geometry: null },
				],
			},
		],
		BBOX,
		TILE_M,
	)
	expect(data.trees).toHaveLength(6)
})

test('groups the named genera and conifers, with a broadleaf long tail', () => {
	expect(['Platanus', 'Tilia', 'Acer', 'Aesculus', 'Robinia', 'Pinus', 'Ulmus'].map((gattung) => treeSpecies({ gattung }))).toEqual([
		1, 2, 3, 4, 5, 6, 0,
	])
	expect(treeSpecies({ art_bot: "Tilia cordata 'Rancho'" })).toBe(2)
})

test('keeps recorded young and old sizes and estimates unknown sizes from the stem or age', () => {
	expect(treeMeasurements({ kronedurch: 2, baumhoehe: 3 }).crown).toBe(2)
	expect(treeMeasurements({ kronedurch: 24, baumhoehe: 30 }).top).toBe(30)
	const young = treeMeasurements({ kronedurch: 0, baumhoehe: null, stammumfg: 30 })
	const old = treeMeasurements({ kronedurch: null, baumhoehe: 0, stammumfg: 250 })
	expect(young.crown).toBeLessThan(old.crown)
	expect(young.top).toBeLessThan(old.top)
	expect(treeMeasurements({ standalter: 5 }).crown).toBeLessThan(treeMeasurements({ standalter: 80 }).crown)
	expect(Object.values(treeMeasurements({ kronedurch: -1, baumhoehe: 'bad', stammumfg: Infinity })).every(Number.isFinite)).toBe(true)
})

test('leaves fallback trees intact for missing, stale or invalid payloads', () => {
	const data = packTrees([{ features: [feature('a', at)] }], BBOX, TILE_M)
	for (const payload of [
		null,
		{ ...data, tileM: 4 },
		{ ...data, bbox: { ...BBOX, west: 13 } },
		{ ...data, trees: [1] },
		{ ...data, trees: [...data.trees, -1, 0, 1, 1, 1, 0] },
	]) {
		const world = map()
		const original = world.trees
		applyMeasuredTrees(world, payload)
		expect(world.trees).toBe(original)
	}
})
