import { expect, test } from 'bun:test'
import { feedbackText, shortAgent } from '../src/feedback.js'

test('feedback is the player text, a blank line, then where they were', () => {
	const text = feedbackText('  Too many cars  ', {
		url: 'https://nkgta.0sk.ar/',
		area: 'default',
		x: 10,
		y: 20.25,
		street: 'Weserstraße',
		hour: 20.5,
		vehicle: 'bike',
		camera: 'overhead',
		agent: 'Chrome 126 · Linux',
		version: 'abc1234',
	})
	expect(text.startsWith('Too many cars\n\nurl: https://nkgta.0sk.ar/\n')).toBe(true)
	expect(text).toContain('position: x 10.0, y 20.3\nstreet: Weserstraße\nhour: 20:30\nvehicle: bike')
})

test('the browser is named short', () => {
	const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
	expect(shortAgent(ua)).toBe('Chrome 126 · Linux')
})
