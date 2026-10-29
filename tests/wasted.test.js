import { expect, test } from 'bun:test'
import { createPlayer } from '../src/player.js'
import { createWasted } from '../src/wasted.js'

test('lying down fades out, respawns, then fades in', () => {
	const player = createPlayer({ x: 1, y: 1 })
	let spawned = 0
	let veil = 0
	const wasted = createWasted({
		player,
		onDown() {},
		respawn: () => spawned++,
		fade: (a) => {
			veil = a
		},
	})
	wasted.hit(10)
	expect(wasted.active()).toBe(true)
	expect(player.down).toBe(true)
	wasted.update(2.6)
	expect(spawned).toBe(0)
	expect(veil).toBeGreaterThan(0)
	wasted.update(0.5)
	expect(spawned).toBe(1)
	expect(veil).toBe(1)
	expect(player.down).toBe(false)
	expect(wasted.active()).toBe(true)
	wasted.update(0.45)
	expect(wasted.active()).toBe(false)
	expect(veil).toBe(0)
})

test('without a lethal hit you stay on your feet', () => {
	const player = createPlayer({ x: 1, y: 1 })
	const wasted = createWasted({ player, onDown() {}, respawn() {} })
	wasted.hit(1)
	expect(wasted.active()).toBe(false)
})
