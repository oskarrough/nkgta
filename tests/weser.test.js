import { expect, test } from 'bun:test'
import { weserCrowd, weserLayout } from '../src/weser.js'
import { createWorld } from '../src/world.js'
import { decodeMap } from '../src/map-codec.js'
import { createBusyPlaces, build } from '../src/busy-places.js'
import { createOpening } from '../src/opening.js'
import { createPfand } from '../src/pfand.js'
import { T } from '../src/tiles.js'

const world = createWorld(decodeMap(await Bun.file(new URL('../public/map.json', import.meta.url)).json()))
const layout = weserLayout(world)

test('nightlife follows the evening across midnight, with quieter weeknights and no daytime crowd', () => {
	for (let day = 0; day < 7; day++) {
		for (const hour of [3, 11, 19.99]) expect(weserCrowd(hour, 0, day)).toBe(0)
		expect(weserCrowd(23, 0, day)).toBe(day >= 3 && day <= 5 ? 1 : 0.45)
		expect(weserCrowd(1, 0, (day + 1) % 7)).toBe(weserCrowd(23, 0, day))
	}
	expect(weserCrowd(20, 0, 4)).toBeLessThan(weserCrowd(23, 0, 4))
	expect(weserCrowd(2.9, 0, 5)).toBeLessThan(weserCrowd(1, 0, 5))
	const dry = layout.groups.filter((g) => g.seed < weserCrowd(23, 0, 4))
	const rain = layout.groups.filter((g) => g.seed < weserCrowd(23, 1, 4))
	expect(rain.length).toBeGreaterThan(0)
	expect(rain.length).toBeLessThan(dry.length)
	expect(rain.every((g) => g.doorway)).toBe(true)
})

test('mapped bar and Späti guests, bikes and their retreat space stay on pavements', () => {
	expect(layout.groups.some((g) => g.place.name === 'Silverfuture')).toBe(true)
	expect(layout.groups.some((g) => g.place.name === 'Späti International')).toBe(true)
	expect(layout.groups.some((g) => g.place.name === 'Tier')).toBe(true)
	for (const g of layout.groups) {
		expect(['bar', 'spaeti']).toContain(g.place.kind)
		for (const p of [...g.people, ...g.bikes]) {
			expect(world.tileAt(p.x, p.y)).toBe(T.SIDEWALK)
			expect(layout.contains(p.x, p.y)).toBe(true)
		}
	}
	const p = layout.groups[0].people[0]
	expect(weserLayout({ ...world, roads: [] }).groups).toHaveLength(0)
	expect(weserLayout({ ...world, tileAt: () => T.ROAD }).groups).toHaveLength(0)
	expect(weserLayout({ ...world, tileAt: () => T.ROAD }).contains(p.x, p.y)).toBe(false)
})

test('open-door crowds react to a bicycle, drop collectible Pfand once, and clear at closing time', () => {
	const w = { ...world },
		opening = createOpening(),
		pfand = createPfand(w)
	let shouts = 0
	const busy = createBusyPlaces(w, pfand, () => shouts++)
	const place = busy.places.find((p) => p.id === 'weser')
	const group = place.groups.find((g) => g.place.name === 'Silverfuture' && !g.doorway)
	const p = group.people.find((p) => p.bottle && p.kind === 'stand')
	const view = { x0: p.x - 12, y0: p.y - 12, x1: p.x + 12, y1: p.y + 12 }
	opening.set(23, 4)
	const chunk = build({ world: w, opening, gradient: null, chunk: { x: view.x0, y: view.y0, w: 24, h: 24 } })
	const player = { x: p.x - Math.cos(0.52) * 1.4, y: p.y - Math.sin(0.52) * 1.4, dir: 0.52, speed: 2, onBike: true }
	p.look = 0
	const before = pfand.bottles.length
	for (let i = 0; i < 20; i++) place.update(0.05, player, view, 23, 0, true, false, 4)
	expect(shouts).toBeGreaterThan(0)
	expect(pfand.bottles.length).toBeGreaterThan(before)
	const dropped = group.people.filter((p) => p.dropped)
	expect(dropped.length).toBeGreaterThan(0)
	for (const p of place.people) expect(world.tileAt(p.x, p.y)).toBe(T.SIDEWALK)
	const bottle = pfand.bottles.at(-1)
	pfand.update(bottle)
	expect(pfand.bag.bottles).toBeGreaterThan(0)
	for (const p of dropped) expect(p.dropped).toBe(true)
	opening.set(3, 5)
	place.update(0.05, player, view, 3, 0, true, false, 5)
	expect(place.people).toHaveLength(0)
	expect(group.open).toBe(false)
	chunk.dispose()
	for (const mesh of chunk.meshes) {
		mesh.geometry.dispose()
		mesh.material.dispose()
		mesh.dispose?.()
	}
})
