import { buildGeometry } from './ground-paint.js'
import { createTerrain } from './terrain.js'

// A short-lived heap keeps polygon construction garbage out of the game.
onmessage = ({ data: { world, chunk, entries } }) => {
	Object.assign(world, createTerrain(world.terrain, world))
	const generator = buildGeometry({ world, chunk, entries })
	let step
	do step = generator.next()
	while (!step.done)
	if (!step.value) return postMessage(null)
	const geometry = step.value
	const attributes = Object.fromEntries(
		Object.entries(geometry.attributes).map(([name, a]) => [
			name,
			{
				array: a.array,
				itemSize: a.itemSize,
				normalized: a.normalized,
			},
		]),
	)
	const index = geometry.index.array
	postMessage({ attributes, index }, [...Object.values(attributes).map((a) => a.array.buffer), index.buffer])
}
