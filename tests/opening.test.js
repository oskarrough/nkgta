import { expect, test } from 'bun:test'
import { isOpen } from '../src/opening.js'

test('mapped hours override defaults and handle overnight and Sunday', () => {
	const shop = { kind: 'supermarket', openingHours: 'Mo-Fr 20:00-02:00; Su off' }
	expect(isOpen(shop, 21, 0)).toBe(true)
	expect(isOpen(shop, 1, 1)).toBe(true)
	expect(isOpen(shop, 12, 0)).toBe(false)
	expect(isOpen(shop, 21, 6)).toBe(false)
})

test('unmapped or invalid hours fall back by kind', () => {
	expect(isOpen({ kind: 'supermarket' }, 12, 6)).toBe(false)
	expect(isOpen({ kind: 'spaeti', openingHours: 'nonsense' }, 23, 6)).toBe(true)
	expect(isOpen({ kind: 'cafe' }, 4, 0)).toBe(false)
})

test('opening state changes only when the clock crosses a boundary', async () => {
	const { createOpening } = await import('../src/opening.js')
	const opening = createOpening()
	const changes = []
	opening.watch({ kind: 'cafe', openingHours: 'Mo-Fr 09:00-18:00' }, (value) => changes.push(value))
	opening.set(17.9, 0)
	opening.set(18, 0)
	opening.set(19, 0)
	opening.set(10, 1)
	expect(changes).toEqual([true, false, true])
})
