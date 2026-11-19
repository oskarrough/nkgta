import { expect, test } from 'bun:test'
import { DEFAULT_LOOK, LOOK_NAMES, LOOKS, nextLook } from '../src/looks.js'

test('P goes through raw, default and pixel, and back', () => {
	const seen = [DEFAULT_LOOK]
	for (let i = 0; i < 3; i++) seen.push(nextLook(seen.at(-1)))
	expect(new Set(seen)).toEqual(new Set(['default', 'pixel', 'raw']))
	expect(seen.at(-1)).toBe(DEFAULT_LOOK)
})

test('every look has a menu name', () => {
	expect(Object.keys(LOOK_NAMES)).toEqual(Object.keys(LOOKS))
})
