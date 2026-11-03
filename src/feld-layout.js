import { BOUNDARY, RUNWAYS, BBQ, DOG_RUNS, EAST_TAXIWAY } from './feld-site.js'
import { T } from './tiles.js'
import { dogAt } from './feld-activity.js'

const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007

export function feldCrowd(hour, wetness) {
	const h = ((hour % 24) + 24) % 24
	const stops = [
		[0, 0.06],
		[6, 0.04],
		[9, 0.2],
		[12, 0.7],
		[15, 1],
		[18, 1],
		[21, 0.3],
		[23, 0.06],
		[24, 0.06],
	]
	const i = stops.findIndex(([at]) => at > h)
	const [a, av] = stops[i - 1],
		[b, bv] = stops[i]
	return (av + ((bv - av) * (h - a)) / (b - a)) * (1 - 0.97 * Math.max(0, Math.min(1, wetness)))
}

export function feldLayout(world) {
	const { bbox, tileM } = world
	const lonM = 111320 * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)
	const project = ([lat, lon]) => ({ x: ((lon - bbox.west) * lonM) / tileM, y: ((bbox.north - lat) * 111320) / tileM })
	const boundary = BOUNDARY.map(project)
	const bounds = {
		x0: Math.min(...boundary.map((p) => p.x)),
		y0: Math.min(...boundary.map((p) => p.y)),
		x1: Math.max(...boundary.map((p) => p.x)),
		y1: Math.max(...boundary.map((p) => p.y)),
	}
	const inRing = (ring, x, y) => {
		let inside = false
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const a = ring[i],
				b = ring[j]
			if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
		}
		return inside
	}
	const contains = (x, y) => x >= 0 && y >= 0 && x < world.W && y < world.H && inRing(boundary, x, y)
	const barbecue = BBQ.map((r) => r.map(project)),
		dogRuns = DOG_RUNS.map((r) => r.map(project))
	const canGrill = (x, y) => barbecue.some((r) => inRing(r, x, y))

	if (bounds.x0 >= world.W || bounds.x1 < 0 || bounds.y0 >= world.H || bounds.y1 < 0)
		return { groups: [], riders: [], dogs: [], collectors: [], contains, canGrill, project, bounds }
	const clearGrass = (x, y) =>
		contains(x, y) &&
		[
			[0, 0],
			[2, 0],
			[-2, 0],
			[0, 2],
			[0, -2],
		].every(([dx, dy]) => world.tileAt(x + dx, y + dy) === T.GRASS)
	const paths = RUNWAYS.map((line) => line.map(project)).map((line) => {
		let length = 0
		const points = line.map((p, i) => ({ ...p, s: i ? (length += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y)) : 0 }))
		return { points, length }
	})
	const hubs = [
		{ at: [52.47612, 13.41765], spread: [13, 11], budget: 140 },
		{ at: [52.47685, 13.4172], spread: [10, 10], budget: 90 },
		{ at: [52.4727, 13.41725], spread: [11, 18], budget: 110 },
		{ at: [52.4802, 13.4046], spread: [14, 10], budget: 100 },
		{ at: [52.47585, 13.4155], spread: [12, 6], budget: 45 },
		{ at: [52.4701, 13.3943], spread: [10, 9], budget: 35 },
		{ at: [52.4767, 13.4125], spread: [25, 14], budget: 20, loners: true },
	]
	const groups = []
	for (const [h, hub] of hubs.entries()) {
		const centre = project(hub.at)
		let population = 0
		for (let trial = 0; trial < 900 && population < hub.budget; trial++) {
			const i = h * 1100 + trial,
				seed = hash(i * 7 + 19),
				angle = hash(i * 5 + 2) * Math.PI * 2
			const count = Math.min(
				hub.budget - population,
				hub.loners ? 1 + (trial % 2) : seed < 0.48 ? 8 + Math.floor(seed * 10) : 3 + Math.floor(seed * 4),
			)
			const radius = count > 7 ? 1.25 : count > 2 ? 0.85 : 0.35
			const r = Math.pow(hash(i * 5 + 3), 0.8)
			const x = centre.x + Math.cos(angle) * r * hub.spread[0],
				y = centre.y + Math.sin(angle) * r * hub.spread[1]
			if (!clearGrass(x, y) || groups.some((g) => Math.hypot(x - g.x, y - g.y) < radius + g.radius + 0.55)) continue
			const group = { x, y, seed, angle, radius, hub: h, people: [] }
			for (let k = 0; k < count; k++) {
				const a = angle + (k * Math.PI * 2) / count,
					ring = radius * (0.88 + hash(i * 31 + k) * 0.2)
				group.people.push({
					x: x + Math.cos(a) * ring,
					y: y + Math.sin(a) * ring,
					dir: a + Math.PI,
					seed: hash(i * 37 + k + 47),
					kind: k % 4 === 0 ? 'lie' : k % 4 === 1 ? 'stand' : 'sit',
					social: true,
					v: 0,
					stride: 0,
				})
			}
			if (!group.people.every((p) => world.tileAt(p.x, p.y) === T.GRASS && contains(p.x, p.y))) continue
			const grill = { x: x + Math.cos(angle) * 1.9, y: y + Math.sin(angle) * 1.9 }
			if (canGrill(grill.x, grill.y) && world.tileAt(grill.x, grill.y) === T.GRASS && seed < 0.65) group.grill = grill
			if (!group.grill && seed > 0.85 && count > 2) group.kite = true
			if (!group.grill && !group.kite && seed > 0.5 && seed < 0.6 && count > 3) {
				const a = { x: x - 3, y },
					b = { x: x + 3, y }
				if ([a, b].every((p) => clearGrass(p.x, p.y))) {
					group.game = seed > 0.54 ? 'football' : 'frisbee'
					Object.assign(group.people[0], a, { kind: 'play', dir: 0, game: group.game, playSeed: seed, volley: 0 })
					Object.assign(group.people[1], b, { kind: 'play', dir: Math.PI, game: group.game, playSeed: seed, volley: 1 })
				}
			}
			group.pfand = { x: group.x + 1.4, y: group.y }
			groups.push(group)
			population += count
		}
	}
	const dogs = []
	for (const [area, ring] of dogRuns.entries()) {
		const centre = ring.reduce((p, q) => ({ x: p.x + q.x / ring.length, y: p.y + q.y / ring.length }), { x: 0, y: 0 })
		for (let i = 0; i < 6; i++) {
			const seed = hash(area * 41 + i * 13),
				home = { x: centre.x + (seed - 0.5) * 8, y: centre.y + (hash(i * 23) - 0.5) * 6 }
			const dog = { home, radius: 2.2 + seed * 2, seed, pet: { kind: 'dog', free: true, x: home.x, y: home.y, dir: 0, stride: 0, bark: 0 } }
			if (
				Array.from({ length: 40 }, (_, k) => dogAt(dog, k)).every(
					(p) => contains(p.x, p.y) && inRing(ring, p.x, p.y) && world.tileAt(p.x, p.y) === T.GRASS,
				)
			)
				dogs.push(dog)
		}
	}
	const collectors = groups
		.filter((g, i) => g.people.length > 3 && i % 10 === 0)
		.map((g) => ({ x: g.x + 1, y: g.y, seed: g.seed, kind: 'collector', v: 0.38, stride: 0, dir: 0, collected: 0 }))

	const line = EAST_TAXIWAY.map(project)
	let length = 0
	const points = line.map((p, i) => ({ ...p, s: i ? (length += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y)) : 0 }))
	for (let i = 0; i < points.length; i++) {
		const a = points[Math.max(0, i - 1)],
			b = points[Math.min(points.length - 1, i + 1)]
		const distance = Math.hypot(b.x - a.x, b.y - a.y)
		points[i].nx = -(b.y - a.y) / distance
		points[i].ny = (b.x - a.x) / distance
	}
	paths.push({ points, length, eastern: true })
	const riders = []
	for (let i = 0; i < 140; i++) {
		const seed = hash(i * 17 + 9),
			path = i < 76 ? paths[2] : paths[Math.floor(i / 4) % 2]
		riders.push({
			seed,
			path,
			phase: hash(i * 17 + 3),
			lane: path.eastern ? 0.5 + hash(i * 17 + 4) * 0.6 : 1.2 + hash(i * 17 + 4) * 2,
			way: i % 4 < 2 ? 1 : -1,
			kind: i % 19 === 0 ? 'kite' : ['bike', 'skate', 'roller', 'child'][i % 4],
			speed: i % 4 === 3 ? 0.7 + seed * 0.3 : 1.1 + hash(i * 17 + 7) * 1.5,
			x: 0,
			y: 0,
			dir: 0,
			v: 0,
			stride: 0,
		})
	}
	return { groups, riders, dogs, collectors, contains, canGrill, project, bounds }
}

export function rideAt(p, time, out = {}) {
	const length = p.path.length - 10
	// A stadium lap: separate lanes, with a rounded turn at either end.
	const radius = p.lane,
		arc = Math.PI * radius,
		lap = 2 * length + 2 * arc
	let d = (p.phase * lap + time * p.speed) % lap,
		s,
		side
	if (d < length) {
		s = 5 + d
		side = radius
	} else if ((d -= length) < arc) {
		const a = d / radius
		s = p.path.length - 5 + Math.sin(a) * radius
		side = Math.cos(a) * radius
	} else if ((d -= arc) < length) {
		s = p.path.length - 5 - d
		side = -radius
	} else {
		d -= length
		const a = d / radius
		s = 5 - Math.sin(a) * radius
		side = -Math.cos(a) * radius
	}
	const points = p.path.points
	let i = 1
	while (i < points.length - 1 && points[i].s < s) i++
	const a = points[i - 1],
		b = points[i],
		t = (s - a.s) / (b.s - a.s),
		dir = Math.atan2(b.y - a.y, b.x - a.x)
	const nx = a.nx === undefined ? -Math.sin(dir) : a.nx + (b.nx - a.nx) * t,
		ny = a.ny === undefined ? Math.cos(dir) : a.ny + (b.ny - a.ny) * t
	out.x = a.x + (b.x - a.x) * t + nx * side * p.way
	out.y = a.y + (b.y - a.y) * t + ny * side * p.way
	return out
}
