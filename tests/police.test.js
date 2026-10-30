import { expect, test } from 'bun:test'
import { createPolice, lineOfSight } from '../src/police.js'
import { createPlayer } from '../src/player.js'
import { createCar } from '../src/car.js'
import { MODELS } from '../src/models.js'
import { T } from '../src/tiles.js'

// Open ground with one building: x 10..12 for every y.
const world = { tileAt: (x, y) => (x >= 10 && x < 12 && y >= 0 ? T.BUILDING : T.SIDEWALK), slopeAt: () => [0, 0], tileM: 3 }

function setup() {
	const player = createPlayer({ x: 5, y: 5 })
	const traffic = {
		cars: [],
		peds: [],
		summon: (model) => traffic.cars[traffic.cars.push(createCar({ x: 5, y: 1, model })) - 1],
		attach: () => true,
	}
	const said = []
	const bag = { cents: 8000 }
	const police = createPolice({ world, traffic, player, bag, say: (t) => said.push(t) })
	return { player, traffic, police, said, bag }
}

test('a wall blocks the line of sight', () => {
	expect(lineOfSight(world, 5, 5, 8, 5)).toBe(true)
	expect(lineOfSight(world, 5, 5, 15, 5)).toBe(false)
})

test('stealing a car calls a Wanne, which chases what it can see', () => {
	const { player, traffic, police } = setup()
	expect(police.heat()).toBe(0)
	police.steal()
	expect(police.heat()).toBe(1)
	police.update(0.1)
	expect(traffic.cars).toHaveLength(1)
	const cop = traffic.cars[0]
	expect(cop.model).toBe(MODELS.police)
	expect(cop.chase).toBe(true)
	// Behind the building, out of sight for long enough: they give up.
	player.x = 15
	for (let t = 0; t < 10; t += 0.1) police.update(0.1)
	expect(police.heat()).toBe(0)
	expect(cop.cop).toBe(false)
})

test('held within reach, you pay and walk', () => {
	const { player, traffic, police, said, bag } = setup()
	player.car = createCar({ x: 5, y: 5 })
	traffic.cars.push(player.car)
	police.steal()
	police.update(0.1)
	const cop = traffic.cars.find((c) => c.model === MODELS.police)
	Object.assign(cop, { x: 5, y: 6, vx: 0, vy: 0 })
	for (let t = 0; t < 2; t += 0.1) {
		Object.assign(cop, { x: 5, y: 6, vx: 0, vy: 0, spin: 0 })
		police.update(0.1)
	}
	expect(police.shown()).toBe(true)
	for (let t = 0; t < 2; t += 0.1) police.update(0.1)
	expect(player.car).toBe(null)
	expect(bag.cents).toBe(3000)
	expect(said.at(-1)).toContain('Strafe')
	expect(police.heat()).toBe(0)
})

test('getting back into the same stolen car adds no heat', () => {
	const { police } = setup()
	const car = createCar({ x: 5, y: 5 })
	police.steal(car)
	police.steal(car)
	expect(police.heat()).toBe(1)
})

test('a call expires even when no police can spawn', () => {
	const { police, traffic } = setup()
	traffic.summon = () => null
	police.steal()
	for (let t = 0; t < 31; t += 0.1) police.update(0.1)
	expect(police.heat()).toBe(0)
})

test('going indoors breaks sight and lets the search expire', () => {
	const { police } = setup()
	police.steal()
	police.update(0.1)
	for (let t = 0; t < 9; t += 0.1) police.update(0.1, null, true)
	expect(police.heat()).toBe(0)
})

test('hitting a person adds heat once; another drivers hit does not', () => {
	const { police, traffic, player } = setup()
	player.car = createCar({ x: 5, y: 5, speed: 3 })
	traffic.peds.push({ under: createCar({ x: 5, y: 5, speed: 3 }) })
	police.update(0.1)
	expect(police.heat()).toBe(0)
	traffic.peds.push({ under: player.car })
	police.update(0.1)
	police.update(0.1)
	expect(police.heat()).toBe(1)
})

test('coasting past the police at speed does not count as caught', () => {
	const { police, traffic, player } = setup()
	player.car = createCar({ x: 5, y: 5, speed: 3 })
	traffic.cars.push(player.car)
	police.steal(player.car)
	police.update(0.1)
	const cop = police.cops[0]
	for (let t = 0; t < 2; t += 0.1) {
		Object.assign(cop, { x: 5, y: 6, vx: 0, vy: 0, spin: 0 })
		police.update(0.1)
	}
	expect(police.active()).toBe(false)
})
