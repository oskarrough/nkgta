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

export function quizRounds(streets, random = Math.random) {
	if (streets.size < 5) return []
	return shuffled([...streets.keys()], random)
		.slice(0, 5)
		.map((name) => {
			const spots = streets.get(name)
			const spot = spots[Math.floor(random() * spots.length)]
			const nearby = [...streets]
				.filter(([street]) => street !== name)
				.map(([street, points]) => ({
					street,
					distance: points.reduce((nearest, p) => Math.min(nearest, Math.hypot(p.x - spot.x, p.y - spot.y)), Infinity),
				}))
				.sort((a, b) => a.distance - b.distance)
				.slice(0, 3)
			return { ...spot, dir: random() * Math.PI * 2, choices: shuffled([name, ...nearby.map((p) => p.street)], random) }
		})
}

export const quizLine = (spot, answer, seconds, area) =>
	`quiz: ${spot.street} | answer ${answer ?? 'skip'} | ${seconds.toFixed(1)} s | area ${area} | ${spot.x.toFixed(1)},${spot.y.toFixed(1)}`
