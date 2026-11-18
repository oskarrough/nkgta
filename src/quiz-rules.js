import { T } from './tiles.js'
import { shuffled } from './random.js'

// Sample streets equally, rather than letting the longest road fill the quiz.
const spotsCache = new WeakMap()
export const streetSpots = (world) => {
	if (!spotsCache.has(world)) spotsCache.set(world, quizSpots(world))
	return spotsCache.get(world)
}

export function quizSpots(world) {
	const streets = new Map()
	for (let y = 1; y < world.H - 1; y++) {
		for (let x = 1; x < world.W - 1; x++) {
			if (![T.ROAD, T.SIDEWALK].includes(world.tileAt(x, y))) continue
			const street = world.streetAt(x, y)
			if (!street) continue
			const spots = streets.get(street) ?? []
			spots.push({ x: x + 0.5, y: y + 0.5, street })
			streets.set(street, spots)
		}
	}
	return streets
}

export function guessRelation(spot, points, tileM) {
	const closest = points.reduce((best, p) => (distance(p) < distance(best) ? p : best))
	function distance(p) {
		return Math.hypot(p.x - spot.x, p.y - spot.y)
	}
	const angle = Math.atan2(closest.x - spot.x, spot.y - closest.y)
	const direction = ['nördlich', 'nordöstlich', 'östlich', 'südöstlich', 'südlich', 'südwestlich', 'westlich', 'nordwestlich'][
		(Math.round(angle / (Math.PI / 4)) + 8) % 8
	]
	return { closest, direction, metres: Math.round(distance(closest) * tileM) }
}

export function quizRounds(streets, random = Math.random) {
	if (streets.size < 5) return []
	const nearest = nearestStreets(streets)
	return shuffled([...streets.keys()], random)
		.slice(0, 5)
		.map((name) => {
			const spots = streets.get(name)
			const spot = spots[Math.floor(random() * spots.length)]
			return { ...spot, dir: random() * Math.PI * 2, choices: shuffled([name, ...nearest(spot, name)], random) }
		})
}

const CELL = 16
const nearestCache = new WeakMap()

// The three streets with the closest point to a spot, ties in `streets` order:
// rings of grid cells grow until every point left outside is farther than the third.
function nearestStreets(streets) {
	if (nearestCache.has(streets)) return nearestCache.get(streets)
	const order = new Map([...streets.keys()].map((street, i) => [street, i]))
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity
	for (const points of streets.values()) {
		for (const p of points) {
			minX = Math.min(minX, p.x)
			minY = Math.min(minY, p.y)
			maxX = Math.max(maxX, p.x)
			maxY = Math.max(maxY, p.y)
		}
	}
	const W = Math.floor((maxX - minX) / CELL) + 1,
		H = Math.floor((maxY - minY) / CELL) + 1
	const cells = Array.from({ length: W * H }, () => [])
	for (const points of streets.values())
		for (const p of points) cells[Math.floor((p.y - minY) / CELL) * W + Math.floor((p.x - minX) / CELL)].push(p)
	const nearest = (spot, name) => {
		const cx = Math.floor((spot.x - minX) / CELL),
			cy = Math.floor((spot.y - minY) / CELL)
		const reach = Math.max(cx, W - 1 - cx, cy, H - 1 - cy)
		const found = new Map()
		for (let r = 0; ; r++) {
			for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
				const edge = y === cy - r || y === cy + r
				for (let x = cx - r; x <= cx + r; x += edge ? 1 : 2 * r) {
					if (x < 0 || x >= W) continue
					for (const p of cells[y * W + x]) {
						if (p.street === name) continue
						const d = Math.hypot(p.x - spot.x, p.y - spot.y)
						if (d < (found.get(p.street) ?? Infinity)) found.set(p.street, d)
					}
				}
			}
			const sure = [...found].filter(([, d]) => d <= r * CELL || r >= reach)
			if (sure.length >= 3 || r >= reach)
				return sure
					.sort((a, b) => a[1] - b[1] || order.get(a[0]) - order.get(b[0]))
					.slice(0, 3)
					.map(([street]) => street)
		}
	}
	nearestCache.set(streets, nearest)
	return nearest
}

export const quizLine = (spot, answer, seconds, area) =>
	`quiz: ${spot.street} | answer ${answer ?? 'skip'} | ${seconds.toFixed(1)} s | area ${area} | ${spot.x.toFixed(1)},${spot.y.toFixed(1)}`
