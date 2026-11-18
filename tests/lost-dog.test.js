import { expect, test } from 'bun:test'
import { createLostDog } from '../src/lost-dog.js'
import { shopsOf } from '../src/shops.js'
import { createWorld } from '../src/world.js'
import { findRoute } from '../src/route.js'
import { SOLID } from '../src/tiles.js'
import { defaultMap } from './default-map.js'

test('hear Motte, call her on foot and walk her back to the Späti', async () => {
	const world = createWorld(await defaultMap())
	const player = world.startPoint({ lat: 52.47751, lon: 13.43874 })
	const calls = []
	const game = createLostDog(
		world,
		shopsOf(world),
		player,
		() => {},
		(...call) => calls.push(call),
	)
	const owner = game.owner
	const dog = owner.pet
	const at = (point) => Object.assign(player, { x: point.x, y: point.y })
	at(dog)
	expect(game.use()).toBe(false)
	at(owner)
	expect(game.use()).toBe(true)
	game.update(0.05, true)
	const [far, pan] = calls[0]
	expect(Math.sign(pan)).toBe(Math.sign(dog.x - owner.x))
	at(dog)
	game.update(3.3, true)
	expect(calls[1][0]).toBeGreaterThan(far)
	player.onBike = true
	expect(game.use()).toBe(false)
	player.onBike = false
	expect(game.use()).toBe(true)

	const path = findRoute(world, dog, owner, 1)
	expect(path).not.toBeNull()
	for (const point of path) {
		const from = { ...player }
		for (let i = 1; i <= 12; i++) {
			at({ x: from.x + ((point.x - from.x) * i) / 12, y: from.y + ((point.y - from.y) * i) / 12 })
			game.update(0.05, true)
			expect(SOLID.has(world.tileAt(dog.x, dog.y))).toBe(false)
		}
	}
	expect(game.use()).toBe(true)
	expect(Math.hypot(owner.x - dog.x, owner.y - dog.y)).toBeLessThan(2)
	expect(dog.free).toBe(false)
	expect(game.use()).toBe(false)
})
