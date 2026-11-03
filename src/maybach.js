import { T, SOLID } from './tiles.js'
import { offsetLine, pointAt } from './roads.js'
import { STREET, CANAL } from './maybach-site.js'
import { createMaybachExtras } from './maybach-extras.js'

const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007
export const marketOpen = (hour, day) => (day === 1 || day === 4) && hour >= 11 && hour < 18.5
export const marketCrowd = (hour, wetness, day) => (marketOpen(hour, day) ? 1 - wetness * 0.65 : 0)
export function canalCrowd(hour, wetness, day, temperature = 22) {
	const evening = hour < 9 ? 0.03 : hour < 16 ? 0.22 : hour < 18 ? 0.55 : hour < 21 ? 1 : hour < 23 ? 0.3 : 0.04
	return evening * (1 - wetness * 0.95) * Math.max(0.12, Math.min(1, (temperature - 3) / 16))
}

function site(world, coords) {
	const { bbox, tileM } = world,
		lonM = 111320 * Math.cos(((bbox.north + bbox.south) * Math.PI) / 360)
	const line = offsetLine(
		coords.map(([lat, lon]) => ({ x: ((lon - bbox.west) * lonM) / tileM, y: ((bbox.north - lat) * 111320) / tileM })),
		0,
	)
	const bounds = {
		x0: Math.min(...line.map((p) => p.x)) - 12,
		x1: Math.max(...line.map((p) => p.x)) + 12,
		y0: Math.min(...line.map((p) => p.y)) - 12,
		y1: Math.max(...line.map((p) => p.y)) + 12,
	}
	const contains = (x, y) =>
		x >= 0 && y >= 0 && x < world.W && y < world.H && x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1
	return { line, bounds, contains, groups: [] }
}
function person(x, y, dir, seed, kind = 'stand') {
	return { x, y, dir, seed, kind, social: true, v: 0, stride: 0 }
}
function distance2(line, x, y) {
	let best = Infinity
	for (let i = 1; i < line.length; i++) {
		const a = line[i - 1],
			b = line[i],
			dx = b.x - a.x,
			dy = b.y - a.y
		const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)))
		best = Math.min(best, (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2)
	}
	return best
}
export function marketLayout(world) {
	const out = site(world, STREET),
		{ line, groups, bounds, contains } = out
	const cells = new Set()
	for (let y = Math.max(0, Math.floor(bounds.y0)); y < Math.min(world.H, bounds.y1); y++)
		for (let x = Math.max(0, Math.floor(bounds.x0)); x < Math.min(world.W, bounds.x1); x++)
			if (distance2(line, x + 0.5, y + 0.5) < 2.8 ** 2 && !SOLID.has(world.tileAt(x, y))) cells.add(y * world.W + x)
	out.closure = { cells }
	if (!cells.size) return out
	let i = 0
	for (let s = 4; s < line.at(-1).s - 4; s += 2.8) {
		const at = pointAt(line, s),
			nx = -Math.sin(at.dir),
			ny = Math.cos(at.dir)
		for (const side of [-1, 1]) {
			const x = at.x + nx * side * 1.15,
				y = at.y + ny * side * 1.15,
				angle = at.dir - (side * Math.PI) / 2,
				seed = hash(i++)
			const c = Math.cos(angle),
				d = Math.sin(angle)
			const local = (a, b) => ({ x: x + c * a - d * b, y: y + d * a + c * b })
			if (
				!contains(x, y) ||
				[
					[-0.55, -1.1],
					[0.55, -1.1],
					[-0.55, 1.1],
					[0.55, 1.1],
				].some(([a, b]) => {
					const p = local(a, b)
					return SOLID.has(world.tileAt(p.x, p.y))
				})
			)
				continue
			const g = { x, y, angle, seed, type: 'stall', people: [] }
			for (let j = 0; j < 3; j++) {
				const p = local(j === 0 ? -0.25 : 0.83, j === 0 ? 0 : j === 1 ? -0.45 : 0.4)
				if (SOLID.has(world.tileAt(p.x, p.y))) continue
				g.people.push(person(p.x, p.y, angle + (j ? Math.PI : 0), hash(i * 17 + j)))
			}
			if (i % 13 === 0 && g.people[0]) g.people[0].call = 18 + seed * 12
			if (side === 1) {
				const a = pointAt(line, s - 1),
					b = pointAt(line, s + 1)
				const p = person(a.x, a.y, at.dir, hash(i * 19), 'walk')
				p.route = { ax: a.x, ay: a.y, bx: b.x, by: b.y, travel: 5 + seed * 3, pause: 3 }
				g.people.push(p)
			}
			groups.push(g)
		}
	}
	for (const s of [1.8, line.at(-1).s - 1.8]) {
		const at = pointAt(line, s)
		groups.push({ x: at.x, y: at.y, angle: at.dir, seed: 0, type: 'barrier', people: [] })
	}
	return out
}
export function canalLayout(world) {
	const out = site(world, CANAL),
		{ line, groups, contains } = out
	function bank(s) {
		const at = pointAt(line, s),
			nx = -Math.sin(at.dir),
			ny = Math.cos(at.dir)
		if (world.tileAt(at.x, at.y) !== T.WATER) return null
		for (let r = 2; r < 9; r += 0.1) {
			const x = at.x + nx * r,
				y = at.y + ny * r
			if (world.tileAt(x, y) === T.WATER) continue
			if (!contains(x, y) || SOLID.has(world.tileAt(x, y)) || world.tileAt(x, y) === T.ROAD) return null
			return { x: x + nx * 0.12, y: y + ny * 0.12, dir: at.dir - Math.PI / 2 }
		}
		return null
	}
	for (let s = 5, i = 0; s < line.at(-1).s - 5; s += 4.4, i++) {
		const at = bank(s)
		if (!at) continue
		const seed = hash(i * 11),
			g = { x: at.x, y: at.y, angle: at.dir, seed, type: 'quay', people: [], pfand: { x: at.x + 0.5, y: at.y + 0.25 } }
		for (const off of [-0.5, 0.5]) {
			const p = bank(s + off)
			if (p) g.people.push(person(p.x, p.y, p.dir, hash(i * 31 + off * 2 + 8), 'quay'))
		}
		if (i % 6 === 0 && g.people[0]) g.people[0].guitar = true
		groups.push(g)
		if (i % 5 === 0) {
			const water = pointAt(line, s)
			if ([0, 1, 2, 3, 4, 5, 6].every((t) => world.tileAt(water.x + Math.cos(t) * 0.8, water.y + Math.sin(t) * 0.8) === T.WATER))
				groups.push({ x: water.x, y: water.y, angle: water.dir, seed: hash(i * 29), type: 'birds', people: [] })
		}
	}
	return out
}
export const market = {
	id: 'maybach-market',
	layout: marketLayout,
	crowd: marketCrowd,
	open: marketOpen,
	extras: createMaybachExtras,
	parts: 160,
}
export const canal = { id: 'landwehrkanal', layout: canalLayout, crowd: canalCrowd, extras: createMaybachExtras, parts: 80 }
