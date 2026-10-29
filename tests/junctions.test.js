import { expect, test } from 'bun:test'
import { createJunctions } from '../src/junctions.js'
import { roadGraph } from '../src/roads.js'

test('junction occupancy matches a full scan as parked and moving cars cross cell boundaries', () => {
	const world = { W: 300, H: 300, roadNodes: [], roads: [] }
	// Negative coordinates, cell boundaries, and junctions wider than a cell.
	for (const [x, y, w] of [
		[-16, -16, 4],
		[16, 16, 40],
		[100, 100, 6],
	]) {
		const n = world.roadNodes.length / 2
		world.roadNodes.push(x, y, x - 50, y, x + 50, y, x, y - 50)
		for (let i = 1; i <= 3; i++) world.roads.push({ nodes: [n, n + i], w, oneway: 0 })
	}
	const junctions = createJunctions(roadGraph(world))
	expect(junctions.list.length).toBe(3)
	const cars = junctions.list.flatMap((j) =>
		[-j.r, -j.r + 0.001, 0, j.r - 0.001, j.r].flatMap((dx) => [-j.r, 0, j.r].map((dy) => ({ x: j.x + dx, y: j.y + dy, vx: 0, vy: 0 }))),
	)
	for (const shift of [0, 16, -32, 1000]) {
		for (const c of cars) c.x += shift
		junctions.update(cars, 1 / 60)
		for (const j of junctions.list) {
			expect(j.inside).toEqual(cars.filter((c) => Math.hypot(c.x - j.x, c.y - j.y) < j.r))
		}
	}
})
