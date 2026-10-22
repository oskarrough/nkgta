import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { compile } from '../src/scrimshaw/score.js'
import { CONVOY, HEAR, SCORES, convoyCars, cueAt, join, nearest, placeSources, shape } from '../src/music.js'

const score = (name) => compile(readFileSync(new URL(`../public/music/${name}.scrim`, import.meta.url), 'utf8'))

describe('scores', () => {
	for (const name of SCORES) {
		test(`${name} plays without errors and loops`, () => {
			const song = score(name)
			expect(song.errors).toEqual([])
			expect(song.loop.dur).toBeGreaterThan(10)
		})
	}
})

describe('music in the street', () => {
	const world = { buildings: Array.from({ length: 300 }, (_, i) => ({ rings: [[i * 10, 0, i * 10 + 5, 0]] })) }
	const shops = Array.from({ length: 300 }, (_, i) => ({ kind: ['spaeti', 'doener', 'bar'][i % 3], x: i * 10, y: 5 }))

	test('some Spätis have a radio on, some bars play through the door, some windows are open', () => {
		const sources = placeSources(world, shops)
		const count = (kind) => sources.filter((s) => s.kind === kind).length
		for (const kind of ['radio', 'bar']) {
			expect(count(kind)).toBeGreaterThan(15)
			expect(count(kind)).toBeLessThan(60)
		}
		expect(count('window')).toBeGreaterThan(0)
		expect(count('window')).toBeLessThan(15)
		expect(placeSources(world, shops)).toEqual(sources)
		for (const s of sources) expect(SCORES).toContain(s.score)
		expect(sources.map((s) => s.score)).not.toContain(CONVOY)
	})

	test('you hear a wedding convoy coming from much further than a car radio, and louder', () => {
		const convoy = { kind: 'convoy', x: HEAR * 2, y: 0 }
		const car = { kind: 'car', x: HEAR * 2, y: 0 }
		expect(nearest([car, convoy], 0, 0)).toEqual([convoy])
		const far = shape('convoy', HEAR * 1.5)
		const near = shape('convoy', 5)
		expect(far.level).toBeGreaterThan(0)
		expect(near.level).toBeGreaterThan(far.level)
		expect(near.cutoff).toBeGreaterThan(far.cutoff)
		expect(near.level).toBeGreaterThan(shape('car', 5).level)
	})

	test('only the nearest two in earshot play', () => {
		const sources = [
			{ kind: 'radio', x: 0, y: 0 },
			{ kind: 'bar', x: 5, y: 0 },
			{ kind: 'window', x: 2, y: 0 },
			{ kind: 'window', x: 100, y: 0 },
		]
		expect(nearest(sources, 0, 0)).toEqual([sources[0], sources[2]])
		expect(nearest(sources, 100, 0)).toEqual([sources[3]])
		expect(nearest(sources, 60, 0)).toEqual([])
	})

	test('a passing convoy keeps playing until its last car has gone by', () => {
		const group = {}
		const convoy = [0, 1, 2, 3, 4].map((k) => ({ ai: {}, convoy: group, x: 40 - k * 2.4, y: 0 }))
		const others = [{ ai: {}, x: 31, y: 0 }]
		// Standing beside the tail, with the front car 9.6 tiles on.
		const at = convoyCars([...convoy, ...others], 30.4, 1)
		expect([...at]).toEqual([[group, convoy[4]]])
		expect(Math.hypot(at.get(group).x - 30.4, at.get(group).y - 1)).toBe(1)
	})

	test('coming back, a source carries on where its song had got to', () => {
		const song = score('hermannplatz')
		expect(cueAt(song, 0)).toEqual({ list: 'intro', i: 0, offset: 0 })
		const later = song.intro.dur + song.loop.dur * 3 + 5
		const cue = cueAt(song, later)
		expect(cue.list).toBe('loop')
		expect(cue.offset).toBeCloseTo(song.intro.dur + song.loop.dur * 3)
		const next = song.loop.events[cue.i]
		expect(cue.offset + next.t).toBeGreaterThanOrEqual(later)
		expect(cue.offset + song.loop.events[cue.i - 1].t).toBeLessThan(later)
	})

	test('a source joined later is further on in its song', () => {
		const song = score('hermannplatz')
		const first = join(song, 100, 5)
		const again = join(song, 100, 5 + 25)
		expect(first.start).toBe(again.start)
		const at = (j) => j.cue.offset + song[j.cue.list].events[j.cue.i].t
		expect(at(again)).toBeGreaterThan(at(first) + 20)
		expect(first.start + at(first)).toBeGreaterThanOrEqual(5)
	})
})
