import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { compile, noteToMidi } from '../src/jukebox/score.js'
import { mtof } from '../src/jukebox/synth.js'
import {
	CONVOY,
	HEAR,
	SCORES,
	convoyCar,
	cueAt,
	join,
	nearest,
	openField,
	pickScore,
	placeSources,
	shape,
	streetNear,
} from '../src/music.js'
import { T } from '../src/tiles.js'

const score = (name) => compile(readFileSync(new URL(`../public/music/${name}.song`, import.meta.url), 'utf8'))

describe('scores', () => {
	for (const name of SCORES) {
		test(`${name} plays without errors and loops`, () => {
			const song = score(name)
			expect(song.errors).toEqual([])
			expect(song.loop.dur).toBeGreaterThan(10)
		})
	}
})

describe('quarter tones', () => {
	test('q is a half-flat, a quarter tone under the note', () => {
		expect(noteToMidi('Eq4')).toBe(63.5)
		expect(noteToMidi('Bq3')).toBe(58.5)
		expect(mtof(63.5) / mtof(63)).toBeCloseTo(2 ** (1 / 24))
	})

	test('half-flats play, in melodies and glides', () => {
		const song = compile(`voice oud oud
pattern A
oud | D4- Eq4- F4- ~Eq4- D4------- |`)
		expect(song.errors).toEqual([])
		const notes = song.loop.events.map((e) => e.m[0])
		expect(notes).toEqual([62, 63.5, 65, 63.5, 62])
		expect(song.loop.events[3].g).toBe(65)
	})

	test('the Sonnenallee songs are in a maqam with quarter tones', () => {
		for (const name of ['sonnenallee', 'sonnenallee-nacht']) {
			const song = score(name)
			expect(song.street).toBe('Sonnenallee')
			expect(song.loop.events.some((e) => e.m?.some((m) => m % 1))).toBe(true)
		}
	})
})

describe('songs belong to streets', () => {
	const streets = { sonnenallee: { street: 'Sonnenallee', at: [] }, 'sonnenallee-nacht': { street: 'Sonnenallee', at: [] } }
	const picks = (street) => Array.from({ length: 600 }, (_, i) => pickScore(streets, street, '', i))
	const share = (list, names) => list.filter((n) => names.includes(n)).length / list.length

	test("on its street, a source plays one of that street's songs about two times in three", () => {
		const there = picks('Sonnenallee')
		// two in three by choice, plus the odd one from the whole pool
		expect(share(there, ['sonnenallee', 'sonnenallee-nacht'])).toBeGreaterThan(0.6)
		expect(share(there, ['sonnenallee', 'sonnenallee-nacht'])).toBeLessThan(0.85)
		expect(new Set(there).size).toBe(SCORES.length - 1) // all but the convoy's
	})

	test('everywhere else, any song', () => {
		for (const street of ['Weserstraße', '']) {
			const elsewhere = picks(street)
			expect(share(elsewhere, ['sonnenallee', 'sonnenallee-nacht'])).toBeLessThan(0.4)
			expect(new Set(elsewhere).size).toBe(SCORES.length - 1)
		}
	})

	test('a source belongs to the nearest street, if one is near', () => {
		// Sonnenallee along y = 0, Weserstraße along y = 6
		const world = { streetAt: (x, y) => ((y | 0) === 0 ? 'Sonnenallee' : (y | 0) === 6 ? 'Weserstraße' : '') }
		expect(streetNear(world, 10, 2)).toBe('Sonnenallee')
		expect(streetNear(world, 10, 5)).toBe('Weserstraße')
		expect(streetNear(world, 10, 40)).toBe('')
		expect(streetNear({}, 10, 2)).toBe('')
	})

	test('the Spätis on Sonnenallee mostly play its songs; picked areas without it play anything', () => {
		const shops = Array.from({ length: 900 }, (_, i) => ({ kind: 'spaeti', x: i, y: 2 }))
		const onIt = { buildings: [], streetAt: (x, y) => ((y | 0) === 0 ? 'Sonnenallee' : '') }
		const elsewhere = { buildings: [], streetAt: (x, y) => ((y | 0) === 0 ? 'Karl-Marx-Straße' : '') }
		const scores = (world) => placeSources(world, shops, streets).map((s) => s.score)
		expect(share(scores(onIt), ['sonnenallee', 'sonnenallee-nacht'])).toBeGreaterThan(0.6)
		expect(share(scores(elsewhere), ['sonnenallee', 'sonnenallee-nacht'])).toBeLessThan(0.4)
	})
})

describe('music in the street', () => {
	const world = { buildings: Array.from({ length: 300 }, (_, i) => ({ rings: [[i * 10, 0, i * 10 + 5, 0]] })) }
	const shops = Array.from({ length: 300 }, (_, i) => ({ kind: ['spaeti', 'doener', 'bar'][i % 3], x: i * 10, y: 5 }))

	test('some Spätis and döner shops have a radio on, some bars play through the door, some windows are open', () => {
		const sources = placeSources(world, shops)
		const count = (kind) => sources.filter((s) => s.kind === kind).length
		// 100 Spätis and 100 döner shops, one in three each
		expect(count('radio')).toBeGreaterThan(40)
		expect(count('radio')).toBeLessThan(90)
		expect(count('bar')).toBeGreaterThan(15)
		expect(count('bar')).toBeLessThan(60)
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
		const turns = new Map()
		const convoy = [0, 1, 2, 3, 4].map((k) => ({ ai: {}, convoy: turns, x: 40 - k * 2.4, y: 0 }))
		const stranger = { ai: {}, x: 31, y: 0 }
		// Standing beside the tail, with the front car 9.6 tiles on.
		expect(convoyCar([...convoy, stranger], 30.4, 1)).toBe(convoy[4])
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

describe('songs belong to kinds of places', () => {
	const homes = { wriezener: { street: '', at: ['doener'] }, hasenheide: { street: '', at: ['cafe'] } }
	const share = (list, name) => list.filter((n) => n === name).length / list.length

	test('döner shops mostly play the döner song, cafés the café song, Spätis anything', () => {
		const shops = Array.from({ length: 1800 }, (_, i) => ({ kind: ['doener', 'cafe', 'spaeti'][i % 3], x: i, y: 0 }))
		const sources = placeSources({ buildings: [] }, shops, homes)
		const at = (kind) => sources.filter((s, i) => shops.find((shop) => shop.x === s.x).kind === kind).map((s) => s.score)
		expect(share(at('doener'), 'wriezener')).toBeGreaterThan(0.6)
		expect(share(at('doener'), 'wriezener')).toBeLessThan(0.85)
		expect(share(at('cafe'), 'hasenheide')).toBeGreaterThan(0.6)
		expect(share(at('spaeti'), 'wriezener')).toBeLessThan(0.25)
		expect(at('cafe').length).toBeGreaterThan(60)
	})

	test('a street and a place both count', () => {
		const both = { ...homes, sonnenallee: { street: 'Sonnenallee', at: [] } }
		const picks = Array.from({ length: 600 }, (_, i) => pickScore(both, 'Sonnenallee', 'doener', i))
		expect(share(picks, 'wriezener') + share(picks, 'sonnenallee')).toBeGreaterThan(0.6)
		expect(share(picks, 'wriezener')).toBeGreaterThan(0.2)
		expect(share(picks, 'sonnenallee')).toBeGreaterThan(0.2)
	})

	test("the convoy's song is never a place's, even if it says so", () => {
		const picks = Array.from({ length: 600 }, (_, i) => pickScore({ konvoi: { street: '', at: ['doener'] } }, '', 'doener', i))
		expect(picks).not.toContain(CONVOY)
	})

	test('the songs say where they belong', () => {
		expect(score('konvoi').at).toEqual([])
		expect(score('hasenheide').at).toEqual(['cafe'])
		for (const name of ['tempelhof', 'luftbruecke']) expect(score(name).at).toEqual(['feld'])
		expect(compile('at Doener  cafe\nvoice a sine\npattern A\na | C4 |').at).toEqual(['doener', 'cafe'])
	})
})

describe('the open field', () => {
	// 600 by 400 tiles of 3 m: a field of 120 by 120 tiles (13 ha) on the left
	// would be too small; one of 500 by 400 (180 ha) counts.
	const world = (fieldW) => {
		const W = 600
		const H = 400
		const tiles = new Uint8Array(W * H).fill(T.ROAD)
		for (let y = 0; y < H; y++) for (let x = 0; x < fieldW; x++) tiles[y * W + x] = T.GRASS
		return { W, H, tiles, tileM: 3 }
	}

	test('a big open field is heard from on it and at its edge, not further off', () => {
		const near = openField(world(500))
		expect(near(100, 100)).toBe(0)
		// mapped in cells of 8 tiles, so the edge is a little rough
		expect(near(504, 100)).toBeGreaterThan(0)
		expect(near(504, 100)).toBeLessThan(10)
		expect(near(560, 100)).toBe(18)
	})

	test('a small park is no field, and nor is a map without tiles', () => {
		expect(openField(world(120))).toBe(null)
		expect(openField({ buildings: [] })).toBe(null)
	})

	test('Tempelhofer Feld is a field; Hasenheide and the streets are not', async () => {
		const { decodeMap } = await import('../src/map-codec.js')
		const map = decodeMap(await Bun.file('public/map.json').json())
		const near = openField({ ...map, W: map.w, H: map.h })
		const at = (lat, lon) => {
			const { bbox } = map
			const x = ((lon - bbox.west) * 111320 * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)) / map.tileM
			return near(x, ((bbox.north - lat) * 111320) / map.tileM)
		}
		expect(at(52.4745, 13.4)).toBe(0) // the middle of the Feld
		expect(at(52.4845, 13.4165)).toBe(18) // Hasenheide
		expect(at(52.4812, 13.4352)).toBe(18) // Rathaus Neukölln
	})
})
