import { describe, expect, test } from 'bun:test'
import { MODELS, pickModel } from '../src/models.js'

const share = (model, where) => {
	let n = 0
	for (let i = 0; i < 1000; i++) if (pickModel((i + 0.5) / 1000, where) === model) n++
	return n / 1000
}

describe('what drives past', () => {
	test('taxis wait by the U-Bahn', () => {
		expect(share(MODELS.taxi, { station: true })).toBeGreaterThan(share(MODELS.taxi, {}) * 2)
	})

	test('vans are out in the morning', () => {
		const vans = (hour) => share(MODELS.sprinter, { hour }) + share(MODELS.dhl, { hour })
		expect(vans(8)).toBeGreaterThan(vans(15) * 1.5)
	})

	test('buses, cops, bin lorries and cargo bikes never park', () => {
		for (const m of [MODELS.bus, MODELS.police, MODELS.bsr, MODELS.cargo]) expect(share(m, { parked: true, bigRoad: true })).toBe(0)
	})

	test('buses keep to big roads, cargo bikes to small ones', () => {
		expect(share(MODELS.bus, {})).toBe(0)
		expect(share(MODELS.cargo, {})).toBeGreaterThan(share(MODELS.cargo, { bigRoad: true }))
	})

	test('the plain small car rules a side street and never runs out', () => {
		for (const m of Object.values(MODELS)) if (m !== MODELS.car) expect(share(MODELS.car, {})).toBeGreaterThan(share(m, {}))
		expect(share(MODELS.car, { bigRoad: true, hour: 8, station: true })).toBeGreaterThan(0.05)
	})
})
