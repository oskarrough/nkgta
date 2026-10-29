import { expect, test } from 'bun:test'
import { crowdAt } from '../src/pedestrians.js'

test('the street is quiet before dawn and on Sunday, but busy on Weserstraße in the evening', () => {
	expect(crowdAt(4, 0)).toBeLessThan(crowdAt(14, 0))
	expect(crowdAt(14, 6)).toBeLessThan(crowdAt(14, 0))
	expect(crowdAt(20, 0, 'Weserstraße')).toBeGreaterThan(crowdAt(20, 0, 'Other street'))
})
