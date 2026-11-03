import { expect, test } from 'bun:test'
import { pushOf } from '../src/input.js'
import { SPRAY, createWallFinder, loadGraffiti, moveNozzle, nozzleAt, raiseCan, saveGraffiti, spray, trim } from '../src/graffiti.js'

const memory = () => {
	const data = new Map()
	return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
}
// One square house from (10, 0) to (12, 2); its west wall runs along x = 10.
const house = [{ h: 12, rings: [[10, 0, 12, 0, 12, 2, 10, 2, 10, 0]] }]
const flat = () => 0

test('graffiti keeps to its own key per area, apart from races and the map', () => {
	const storage = memory()
	const strokes = [{ color: '#E4312B', n: [0, 0, 1], dots: [1, 2, 0] }]
	saveGraffiti(storage, undefined, strokes)
	saveGraffiti(storage, '1,2,3,4', [])
	expect([...storage.data.keys()]).toEqual(['nk-graffiti:default', 'nk-graffiti:1,2,3,4'])
	expect(loadGraffiti(storage, undefined)).toEqual(strokes)
	expect(loadGraffiti(storage, '1,2,3,4')).toEqual([])
	storage.setItem('nk-graffiti:default', '{broken')
	expect(loadGraffiti(storage, undefined)).toEqual([])
})

test('the oldest lines go once the city is full of paint', () => {
	const line = (n) => ({ color: '#000', n: [0, 0, 1], dots: Array(n * 3).fill(0) })
	const [a, b, c] = [line(5), line(5), line(5)]
	expect(trim([a, b, c], 10)).toEqual([b, c])
	expect(trim([a, b], 10)).toEqual([a, b])
	expect(trim([line(50)], 10)).toHaveLength(1)
})

test('facing a wall raises the can at it, facing the street at the ground', () => {
	const hit = createWallFinder(house)
	const atWall = raiseCan({ x: 9.7, y: 1, dir: 0 }, hit, flat)
	expect(atWall.wall).toBe(true)
	expect(atWall.ox).toBeCloseTo(10)
	expect([atWall.nx, atWall.ny]).toEqual([-1, -0])
	const away = raiseCan({ x: 9.7, y: 1, dir: Math.PI }, hit, flat)
	expect(away.wall).toBe(false)
	expect(away.ox).toBeCloseTo(9.7 - SPRAY.ground)
})

test('on a wall the nozzle goes right and up as you face it, and no further than an arm', () => {
	const can = raiseCan({ x: 9.7, y: 1, dir: 0 }, createWallFinder(house), flat)
	moveNozzle(can, { x: 1, y: -1 }, 0.2)
	const [x, y, z] = nozzleAt(can)
	expect(x).toBeLessThan(10) // just off the wall, on the sprayer's side
	expect(y).toBeGreaterThan(1) // facing east, right is south, down the map
	expect(z).toBeGreaterThan(SPRAY.start)
	moveNozzle(can, { x: 0, y: -1 }, 100)
	expect(nozzleAt(can)[2]).toBe(SPRAY.top)
})

test('a quick sweep paints a line, not dots', () => {
	const stroke = { dots: [] }
	spray(stroke, [0, 0, 0])
	spray(stroke, [0.12, 0, 0])
	const xs = stroke.dots.filter((_, i) => i % 3 === 0)
	expect(xs.length).toBeGreaterThan(8)
	for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(SPRAY.gap + 0.001)
})

test('W raises the nozzle on a wall to the east, whichever way the camera looks', () => {
	const can = raiseCan({ x: 9.7, y: 1, dir: 0 }, createWallFinder(house), flat)
	const [, y0, z0] = nozzleAt(can)
	moveNozzle(can, pushOf(new Set(['w']), { x: 0, y: 0 }, { x: 0, y: 0 }), 0.2)
	const [, y, z] = nozzleAt(can)
	expect(z).toBeGreaterThan(z0)
	expect(y).toBeCloseTo(y0)
})
