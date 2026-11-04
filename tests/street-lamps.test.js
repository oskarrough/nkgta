import { expect, test } from 'bun:test'
import { createWorld } from '../src/world.js'
import { furnitureIn } from '../src/kerbs.js'
import { defaultMap } from './default-map.js'

const world = createWorld(await defaultMap())

test('the default map stands its street lamps where OSM maps them', () => {
	expect(world.lamps.length / 2).toBeGreaterThan(1000)
	const box = { x: 0, y: 0, w: world.w, h: world.h }
	const mapped = new Set()
	for (let i = 0; i < world.lamps.length; i += 2) mapped.add(`${world.lamps[i]},${world.lamps[i + 1]}`)
	const { lamps } = furnitureIn(world, box, 4)
	const real = lamps.filter((l) => mapped.has(`${l.x},${l.y}`)).length
	expect(real).toBeGreaterThanOrEqual(world.lamps.length / 2)
	expect(real).toBeGreaterThan(lamps.length / 2)
})
