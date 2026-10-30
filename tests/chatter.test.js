import { describe, expect, test } from 'bun:test'
import { languageOf, phrase, voiceOf } from '../src/chatter.js'

// A repeatable stream of numbers in [0, 1).
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const many = (lang, mood = 'calm', n = 200) => Array.from({ length: n }, (_, i) => phrase(lang, seeded(i + 1), mood))
const spread = (xs) => {
	const mean = xs.reduce((a, b) => a + b) / xs.length
	return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) / mean
}

describe('who speaks what', () => {
	test('a seed always gets the same voice', () => expect(voiceOf(0.42)).toEqual(voiceOf(0.42)))
	test('the street is a mix of all three languages', () => {
		const seen = new Set(Array.from({ length: 200 }, (_, i) => languageOf(i / 200)))
		expect([...seen].sort()).toEqual(['ar', 'de', 'tr'])
	})
})

describe('phrases', () => {
	test('syllables run in order inside the phrase', () => {
		for (const lang of ['de', 'tr', 'ar'])
			for (const ph of many(lang, 'angry', 50)) {
				let t = 0
				for (const s of ph.syllables) {
					expect(s.at).toBeGreaterThanOrEqual(t)
					t = s.at + s.dur
				}
				expect(ph.duration).toBeGreaterThanOrEqual(t)
			}
	})
	test('German rhythm is uneven, Turkish even', () => {
		const beat = (lang) => spread(many(lang).flatMap((p) => p.syllables.map((s) => s.dur)))
		expect(beat('de')).toBeGreaterThan(beat('tr') * 1.5)
	})
	test('Turkish is mostly open syllables, Arabic reaches for the throat', () => {
		const syllables = (lang) => many(lang).flatMap((p) => p.syllables)
		const closed = (lang) => syllables(lang).filter((s) => s.coda).length / syllables(lang).length
		expect(closed('tr')).toBeLessThan(0.25)
		expect(closed('ar')).toBeGreaterThan(0.3)
		expect(syllables('ar').some((s) => s.onset?.kind === 'throat')).toBe(true)
		expect(syllables('de').some((s) => s.onset?.kind === 'throat')).toBe(false)
	})
	test('a shout is short and loud, an argument louder than a call', () => {
		const shout = phrase('de', seeded(3), 'shout')
		expect(shout.syllables.length).toBeLessThanOrEqual(2)
		expect(shout.duration).toBeLessThan(1.2)
		const peak = (mood) => Math.max(...phrase('tr', seeded(3), mood).syllables.map((s) => s.amp))
		expect(peak('shout')).toBeGreaterThan(peak('angry'))
		expect(peak('angry')).toBeGreaterThan(peak('calm'))
	})
})
