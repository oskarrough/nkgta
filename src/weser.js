import { T } from './tiles.js'
import { shopsOf } from './shops.js'
import { createWeserExtras } from './weser-extras.js'

const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007
const FOOTPRINT = [
	[0, 0],
	[-0.2, 0],
	[0.2, 0],
	[0, -0.2],
	[0, 0.2],
]
const pavement = (world, x, y) => FOOTPRINT.every(([dx, dy]) => world.tileAt(x + dx, y + dy) === T.SIDEWALK)

export function weserCrowd(hour, wetness, day) {
	if (hour >= 3 && hour < 20) return 0
	// After midnight this is still the previous evening's night out.
	const evening = hour < 3 ? (day + 6) % 7 : day
	const weekend = evening >= 3 && evening <= 5
	const late = hour < 3 ? 1 - Math.max(0, hour - 1) * 0.28 : Math.min(1, 0.55 + (hour - 20) * 0.3)
	return late * (weekend ? 1 : 0.45) * (1 - wetness * 0.8)
}

export function weserLayout(world) {
	const segments = []
	for (const road of world.roads ?? []) {
		for (let i = 1; i < road.nodes.length; i++) {
			const a = road.nodes[i - 1] * 2,
				b = road.nodes[i] * 2
			const ax = world.roadNodes[a],
				ay = world.roadNodes[a + 1],
				bx = world.roadNodes[b],
				by = world.roadNodes[b + 1]
			if (world.streetAt((ax + bx) / 2, (ay + by) / 2) === 'Weserstraße') segments.push({ ax, ay, bx, by })
		}
	}
	const near = (x, y) =>
		segments.some(({ ax, ay, bx, by }) => {
			const dx = bx - ax,
				dy = by - ay
			const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
			return Math.hypot(x - ax - t * dx, y - ay - t * dy) < 22
		})
	const groups = []
	const bounds = {
		x0: Math.min(...segments.map((s) => Math.min(s.ax, s.bx))) - 24,
		x1: Math.max(...segments.map((s) => Math.max(s.ax, s.bx))) + 24,
		y0: Math.min(...segments.map((s) => Math.min(s.ay, s.by))) - 24,
		y1: Math.max(...segments.map((s) => Math.max(s.ay, s.by))) + 24,
	}
	const contains = (x, y) => pavement(world, x, y) && near(x, y)
	if (!segments.length) return { groups, bounds, contains }
	const occupied = []
	let index = 0
	for (const shop of shopsOf(world)) {
		if (!['bar', 'spaeti'].includes(shop.kind) || !near(shop.x, shop.y)) continue
		const seed = hash(index++),
			angle = Math.atan2(shop.ny, shop.nx)
		const local = (along, out) => ({ x: shop.x + shop.ex * along + shop.nx * out, y: shop.y + shop.ey * along + shop.ny * out })
		const spots = []
		for (const out of [0.5, 0.85, 1.25, 1.65, 2.05])
			for (const along of [-0.8, 0.8, -1.5, 1.5, -2.1, 2.1]) {
				if (Math.abs(along) > shop.room + 0.2) continue
				const p = local(along, out)
				if (contains(p.x, p.y)) spots.push({ ...p, out })
			}
		for (const doorway of [true, false]) {
			const g = {
				x: shop.x,
				y: shop.y,
				angle,
				seed: doorway ? seed * 0.07 : 0.3 + seed * 0.65,
				doorway,
				place: shop.place,
				people: [],
				bikes: [],
			}
			const centre = local(seed < 0.5 ? -1.2 : 1.2, 1.65)
			const candidates = doorway
				? spots
				: spots.toSorted((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))
			for (const at of candidates) {
				if (doorway && at.out > 0.85) continue
				if (occupied.some((p) => Math.hypot(at.x - p.x, at.y - p.y) < 0.48)) continue
				const j = g.people.length
				const p = {
					x: at.x,
					y: at.y,
					dir: angle + (j % 2 ? -0.7 : 0.7),
					seed: hash(index * 17 + j),
					kind:
						!doorway && j === 0 && (seed > 0.82 || world.tileAt(at.x + shop.nx * 0.5, at.y + shop.ny * 0.5) === T.ROAD) ? 'sit' : 'stand',
					social: true,
					v: 0,
					stride: 0,
				}
				p.smoker = doorway && j === 0
				p.bottle = !p.smoker
				if (p.kind === 'sit' && seed > 0.82) p.seat = 0.18
				g.people.push(p)
				occupied.push(p)
				if (g.people.length >= (doorway ? 2 : 4)) break
			}
			if (!doorway && g.people.length > 1) {
				const x = g.people.reduce((sum, p) => sum + p.x, 0) / g.people.length
				const y = g.people.reduce((sum, p) => sum + p.y, 0) / g.people.length
				for (const p of g.people) p.dir = Math.atan2(y - p.y, x - p.x)
			}
			if (doorway)
				for (const along of [-1.3, 1.3]) {
					const at = local(along, 0.45)
					if (
						[-0.4, 0, 0.4].every((d) => {
							const p = local(along + d, 0.45)
							return contains(p.x, p.y)
						}) &&
						occupied.every((p) => Math.hypot(p.x - at.x, p.y - at.y) > 0.35)
					)
						g.bikes.push({ ...at, dir: Math.atan2(shop.ey, shop.ex) })
				}
			if (g.people.length || g.bikes.length) groups.push(g)
		}
	}
	return { groups, bounds, contains }
}

export const weser = {
	id: 'weser',
	layout: weserLayout,
	crowd: weserCrowd,
	extras: createWeserExtras,
	parts: 100,
	glow: '#55351b',
	room: { ahead: 0, back: 0, step: 0.55 },
}
