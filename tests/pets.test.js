import { expect, test } from 'bun:test'
import { createPets, petOf } from '../src/pets.js'
import { T } from '../src/tiles.js'

const owner = () => ({ seed: 0.1, x: 3, y: 3, dir: 0, pause: 0, track: {} })
const world = (extra = {}) => ({ trees: [], tileM: 3, tileAt: () => T.SIDEWALK, ...extra })

test('dogs dominate, with three rarer companions and plenty of people without pets', () => {
	const counts = {}
	for (let i = 0; i < 1000; i++) {
		const kind = petOf(i / 1000)
		counts[kind] = (counts[kind] ?? 0) + 1
	}
	expect(counts.dog).toBeGreaterThan(counts.cat + counts.ferret + counts.parrot)
	for (const kind of ['cat', 'ferret', 'parrot']) expect(counts[kind]).toBeGreaterThan(0)
	expect(counts.null).toBeGreaterThan(500)
})

test('a dog stops its owner to sniff a nearby tree, then abandons it to dodge with them', () => {
	const update = createPets(world({ trees: [{ x: 3.5, y: 3.3, crown: 6 }] }))
	const p = owner()
	update([p], 0.1, [], null)
	expect(p.pause).toBe(2.5)
	expect(p.pet.sniff).not.toBeNull()
	p.x += 1.8
	p.dodge = { dir: 0 }
	update([p], 0.1, [], null)
	expect(p.pet.sniff).toBeNull()
	expect(Math.hypot(p.pet.x - p.x, p.pet.y - p.y)).toBeLessThan(0.6)
})

test('a companion stays off walls and roads, and follows behind at crossings', () => {
	const p = owner()
	const update = createPets(world({ tileAt: (_x, y) => (y > 3.2 ? T.ROAD : T.SIDEWALK) }))
	for (let i = 0; i < 30; i++) update([p], 1 / 60, [], null)
	expect(p.pet.y).toBeLessThanOrEqual(3.2)
	p.track.edge = {}
	p.x += 2
	update([p], 0.1, [], null)
	expect(p.pet.x).toBeCloseTo(p.x - 0.25)
	expect(p.pet.y).toBeCloseTo(p.y)
})

test('a nearby moving car provokes a bark; a parked car does not', () => {
	const p = owner()
	const update = createPets(world())
	const car = { x: 3, y: 4, vx: 0, vy: 0 }
	let barks = 0
	const scare = { ok: () => true, shout: () => barks++ }
	update([p], 0.1, [car], scare)
	expect(barks).toBe(0)
	p.pet.timer = 0
	car.vx = 1
	update([p], 0.1, [car], scare)
	expect(barks).toBe(1)
	expect(p.pet.bark).toBeGreaterThan(0)
})
