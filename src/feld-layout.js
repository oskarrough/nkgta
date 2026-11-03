import { BOUNDARY, RUNWAYS } from './feld-site.js'
import { T } from './tiles.js'

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
	const contains = (x, y) => {
		if (x < 0 || y < 0 || x >= world.W || y >= world.H) return false
		let inside = false
		for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
			const a = boundary[i],
				b = boundary[j]
			if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
		}
		return inside
	}
	if (bounds.x0 >= world.W || bounds.x1 < 0 || bounds.y0 >= world.H || bounds.y1 < 0)
		return { groups: [], riders: [], contains, project, bounds }
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
	const centres = [
		[52.4759, 13.4172],
		[52.4772, 13.417],
		[52.4736, 13.418],
		[52.4718, 13.4187],
		[52.4806, 13.4054],
		[52.4739, 13.3892],
	].map(project)
	const groups = []
	for (let i = 0; i < 1800 && groups.length < 100; i++) {
		const centre = centres[i % centres.length],
			angle = hash(i * 5 + 2) * Math.PI * 2,
			r = 3 + Math.sqrt(hash(i * 5 + 3)) * 25
		const x = centre.x + Math.cos(angle) * r,
			y = centre.y + Math.sin(angle) * r
		if (!clearGrass(x, y) || groups.some((g) => Math.hypot(x - g.x, y - g.y) < 4)) continue
		const seed = hash(i * 7 + 19),
			count = 4 + Math.floor(hash(i * 7 + 21) * 4)
		const group = { x, y, seed, angle, people: [] }
		for (let k = 0; k < count; k++) {
			const a = angle + (k * Math.PI * 2) / count,
				radius = 0.65 + hash(i * 31 + k) * 0.55
			group.people.push({
				x: x + Math.cos(a) * radius,
				y: y + Math.sin(a) * radius,
				dir: a + Math.PI,
				seed: hash(i * 37 + k + 47),
				kind: k % 4 === 0 ? 'lie' : k % 4 === 1 ? 'stand' : 'sit',
				social: true,
				v: 0,
				stride: 0,
			})
		}
		if (group.people.every((p) => world.tileAt(p.x, p.y) === T.GRASS && contains(p.x, p.y))) groups.push(group)
	}
	const riders = []
	for (let i = 0; i < 140; i++) {
		const seed = hash(i * 17 + 9),
			path = paths[Math.floor(i / 4) % paths.length]
		riders.push({
			seed,
			path,
			phase: hash(i * 17 + 3),
			lane: 1.2 + hash(i * 17 + 4) * 2,
			way: i % 4 < 2 ? 1 : -1,
			kind: ['bike', 'skate', 'roller', 'child'][i % 4],
			speed: i % 4 === 3 ? 0.7 + seed * 0.3 : 1.1 + hash(i * 17 + 7) * 1.5,
			x: 0,
			y: 0,
			dir: 0,
			v: 0,
			stride: 0,
		})
	}
	return { groups, riders, contains, project, bounds }
}

export function rideAt(p, time) {
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
	return { x: a.x + (b.x - a.x) * t - Math.sin(dir) * side * p.way, y: a.y + (b.y - a.y) * t + Math.cos(dir) * side * p.way }
}
