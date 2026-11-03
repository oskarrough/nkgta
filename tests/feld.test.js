import { expect, test } from 'bun:test'
import { feldCrowd, feldLayout, rideAt } from '../src/feld-layout.js'
import { createFeld, build } from '../src/feld.js'
import { createWorld } from '../src/world.js'
import { decodeMap } from '../src/map-codec.js'
import { T } from '../src/tiles.js'

const world = createWorld(decodeMap(await Bun.file(new URL('../public/map.json', import.meta.url)).json()))
const layout = feldLayout(world)

test('a warm afternoon fills the Feld; rain, dawn and night thin it', () => {
	expect(feldCrowd(16, 0)).toBe(1)
	expect(feldCrowd(21, 0)).toBeLessThan(0.4)
	expect(feldCrowd(4, 0)).toBeLessThan(0.1)
	expect(feldCrowd(23, 0)).toBeGreaterThan(0)
	expect(feldCrowd(16, 1)).toBeLessThan(0.04)
	expect(feldCrowd(40, 0)).toBe(feldCrowd(16, 0))
})

test('hundreds of picnic guests stay on grass inside the actual Feld', () => {
	expect(layout.groups.length).toBe(100)
	expect(layout.groups.reduce((n, g) => n + g.people.length, 0)).toBeGreaterThan(450)
	for (const g of layout.groups)
		for (const p of g.people) {
			expect(layout.contains(p.x, p.y)).toBe(true)
			expect(world.tileAt(p.x, p.y)).toBe(T.GRASS)
		}
})

test('runway laps stay on pavement and return continuously around their ends', () => {
	for (const p of layout.riders)
		for (let t = 0; t < 700; t += 5) {
			const a = rideAt(p, t),
				b = rideAt(p, t + 0.05)
			expect(layout.contains(a.x, a.y)).toBe(true)
			expect([T.SIDEWALK, T.CYCLEWAY, T.GROUND]).toContain(world.tileAt(a.x, a.y))
			expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.16)
		}
})

test('picking a different city does not bring Tempelhof along', () => {
	const elsewhere = { ...world, bbox: { north: 53, south: 52.99, west: 14, east: 14.01 }, W: 200, H: 200 }
	const empty = feldLayout(elsewhere)
	expect(empty.groups).toHaveLength(0)
	expect(empty.riders).toHaveLength(0)
})

test('a runway rider dodges a fast bicycle and recovers', () => {
	const calls = []
	const feld = createFeld(world, { bottles: [] }, (p) => calls.push(p))
	const player = { x: 0, y: 0, dir: 0, speed: 4, onBike: true }
	const rider = feld.riders[0],
		at = rideAt(rider, 0.05)
	rider.look = 0
	Object.assign(player, { x: at.x - 1, y: at.y })
	const around = { x0: at.x - 20, y0: at.y - 20, x1: at.x + 20, y1: at.y + 20 }
	feld.update(0.05, player, around, 16, 0, false, false)
	expect(rider.dodge || rider.under).toBeTruthy()
	expect(calls.length).toBeGreaterThan(0)
	for (let i = 0; i < 60; i++) feld.update(0.05, { ...player, onBike: false }, around, 16, 0, false, false)
	expect(rider.dodge).toBeNull()
})

test('a bike on the lawn makes seated guests stand and dodge', () => {
	const shouted = []
	const feld = createFeld(world, { bottles: [] }, (p) => shouted.push(p))
	const group = feld.groups.find((g) => g.x > 743 && g.x < 747 && g.y > 761 && g.y < 765)
	const p = group.people[2],
		start = { x: p.x, y: p.y }
	const part = build({ world, chunk: { x: 640, y: 640, w: 128, h: 128 }, gradient: null })
	p.look = 0
	const view = { x0: p.x - 20, y0: p.y - 20, x1: p.x + 20, y1: p.y + 20 }
	const player = { x: p.x - 1.2, y: p.y, dir: 0, onBike: true, speed: 1.1 }
	for (let i = 0; i < 20; i++) {
		player.x += 0.05 * player.speed
		feld.update(0.05, player, view, 16, 0, false, false)
	}
	expect(Math.hypot(p.x - start.x, p.y - start.y)).toBeGreaterThan(0.4)
	expect(shouted.length).toBeGreaterThan(0)
	expect(p.alert).toBeGreaterThan(0)
	part.dispose()
	for (const mesh of part.meshes) {
		mesh.geometry.dispose()
		mesh.material.dispose()
		mesh.dispose()
	}
})
