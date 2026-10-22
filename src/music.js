// Music from places: a Späti radio, a bar door, an open window, a passing car,
// a wedding convoy. Each plays one of the scores in public/music, plain text
// the Scrimshaw synth plays live, quieter and duller the further away it is.
// Only the nearest few play at all, and each one carries on where it had got
// to while you were away.
import { compile } from './scrimshaw/score.js'
import { createSynth } from './scrimshaw/synth.js'

export const SCORES = ['hermannplatz', 'weserstrasse', 'sonnenallee', 'wriezener', 'hasenheide', 'konvoi']
export const HEAR = 18 // tiles, how far music carries
export const CONVOY = 'konvoi' // the wedding convoy's own song, played nowhere else
const PLACE_SCORES = SCORES.filter((s) => s !== CONVOY)
const PLAYING = 2 // sources sounding at once
const SHOP_EVERY = 3 // one Späti or bar in this many has music on
const WINDOW_EVERY = 80 // one building in this many has a window open
const RADIO_EVERY = 5 // one moving car in this many has the radio on
export const AHEAD = 0.3 // seconds of notes scheduled ahead
// How each kind of source sounds: level, brightest cutoff in Hz, reverb send,
// and how many tiles it carries if further than HEAR.
export const KINDS = {
	radio: { level: 0.55, cutoff: 3200, wet: 0.25 },
	bar: { level: 0.8, cutoff: 1400, wet: 0.5 },
	window: { level: 0.7, cutoff: 2200, wet: 0.6 },
	car: { level: 1, cutoff: 900, wet: 0.15 },
	convoy: { level: 1.2, cutoff: 4200, wet: 0.2, hear: 45 }, // windows down, all of it
}
const reach = (kind) => KINDS[kind].hear ?? HEAR

// A number in [0, 1) that is always the same for the same n.
const hash = (n) => {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
	return s - Math.floor(s)
}

// Spätis, bars and the odd open window, each with its score and how long ago
// its song started.
export function placeSources(world, shops) {
	const sources = []
	for (const [i, shop] of shops.entries()) {
		const kind = shop.kind === 'spaeti' ? 'radio' : shop.kind === 'bar' ? 'bar' : null
		if (kind && hash(1000 + i) * SHOP_EVERY < 1) sources.push(source(kind, shop.x, shop.y, 1000 + i))
	}
	for (const [i, b] of world.buildings.entries()) {
		if (hash(i) * WINDOW_EVERY >= 1) continue
		const r = b.rings[0]
		sources.push(source('window', r[0], r[1], i))
	}
	return sources
}

function source(kind, x, y, seed, score = PLACE_SCORES[Math.floor(hash(seed + 0.5) * PLACE_SCORES.length)]) {
	return { kind, x, y, score, since: hash(seed + 0.25) * 600 }
}

// A convoy plays from whichever of its cars is nearest (x, y), so the song
// carries on until the last one has gone by.
export function convoyCar(cars, x, y) {
	let best = null
	let bestD = Infinity
	for (const c of cars) {
		const d = c.convoy && c.ai ? (c.x - x) ** 2 + (c.y - y) ** 2 : Infinity
		if (d < bestD) [best, bestD] = [c, d]
	}
	return best
}

// The PLAYING sources nearest (x, y), within earshot, nearness measured
// against how far each carries.
export function nearest(sources, x, y) {
	return sources
		.map((s) => ({ s, d: Math.hypot(s.x - x, s.y - y) / reach(s.kind) }))
		.filter((n) => n.d < 1)
		.sort((a, b) => a.d - b.d)
		.slice(0, PLAYING)
		.map((n) => n.s)
}

// Where a song has got to after `elapsed` seconds: which timeline, the index of
// the next note and that timeline's start, in seconds from the song's start.
export function cueAt(song, elapsed) {
	let list = 'intro'
	let offset = 0
	if (elapsed >= song.intro.dur && song.loop.dur > 0) {
		list = 'loop'
		offset = song.intro.dur + Math.floor((elapsed - song.intro.dur) / song.loop.dur) * song.loop.dur
	}
	const events = song[list].events
	let i = events.findIndex((e) => offset + e.t >= elapsed)
	if (i < 0) i = events.length
	return { list, i, offset }
}

// Radios don't wait for you: a source's song started `since` seconds before the
// audio clock did, so joining at `now` picks it up wherever it has got to.
export function join(song, since, now) {
	const start = -since
	return { start, cue: cueAt(song, now - start) }
}

// Schedules a session's notes up to `horizon`, looping forever.
export function feed(p, horizon, now) {
	const song = p.song
	for (let guard = 0; guard < 5000; guard++) {
		const events = song[p.cue.list].events
		if (p.cue.i >= events.length) {
			if (!song.loop.dur) return
			const next = p.cue.list === 'intro' ? song.intro.dur : p.cue.offset + song.loop.dur
			if (p.start + next > horizon) return
			p.cue = { list: 'loop', i: 0, offset: next }
			continue
		}
		const ev = events[p.cue.i]
		const t = p.start + p.cue.offset + ev.t
		if (t > horizon) return
		if (t >= now - 0.03) p.session.play(ev, Math.max(t, now + 0.005))
		p.cue.i++
	}
}

// One synth for all the music, into `master`.
export function synthFor(context, master) {
	const synth = createSynth(context, master)
	synth.out.gain.value = 0.6
	return synth
}

// How a source of `kind` sounds `d` tiles away: level, reverb send and
// lowpass cutoff. Your own car's radio plays clear; sitting in a car muffles
// everyone else's.
export function shape(kind, d, own = false, inCar = false) {
	const k = KINDS[kind]
	const near = 1 - Math.min(1, d / reach(kind))
	const shut = inCar && !own ? 0.45 : 1
	return { level: k.level * near * near * shut, wet: k.wet * near * shut, cutoff: own ? 6000 : k.cutoff * (0.35 + 0.65 * near) * shut }
}

// Starts a source's song through its own level, lowpass and pan, silent until
// tuned, picking it up wherever it has got to.
export function begin(synth, context, src, song) {
	const kind = KINDS[src.kind]
	const level = context.createGain()
	level.gain.value = 0
	const tone = context.createBiquadFilter()
	tone.type = 'lowpass'
	tone.frequency.value = kind.cutoff
	const pan = context.createStereoPanner()
	level.connect(tone).connect(pan).connect(synth.master)
	const wet = context.createGain()
	wet.gain.value = 0
	wet.connect(synth.verbIn)
	synth.warm(song)
	const now = context.currentTime
	return { src, song, level, tone, pan, wet, session: synth.session(song, level, wet), ...join(song, src.since, now + 0.05) }
}

export function tune(p, { level, wet, cutoff }, pan, now) {
	p.level.gain.setTargetAtTime(level, now, 0.15)
	p.wet.gain.setTargetAtTime(wet, now, 0.15)
	p.tone.frequency.setTargetAtTime(cutoff, now, 0.15)
	p.pan.pan.setTargetAtTime(pan, now, 0.1)
}

// Fades a source out and lets go of its nodes.
export function end(p, context) {
	p.level.gain.setTargetAtTime(0, context.currentTime, 0.3)
	p.wet.gain.setTargetAtTime(0, context.currentTime, 0.3)
	setTimeout(() => {
		p.session.stop(0.01)
		for (const node of [p.level, p.tone, p.pan, p.wet]) node.disconnect()
	}, 2000)
}

export function createMusic(world, shops) {
	const fixed = placeSources(world, shops)
	const radios = new WeakMap()
	let convoy = null // the convoy's song, while it lasts
	let carSeed = 0
	const texts = new Map()
	const songs = new Map()
	const playing = new Map()
	let synth = null

	function stop(p, context) {
		playing.delete(p.src)
		end(p, context)
	}

	function load(name) {
		if (!texts.has(name)) {
			texts.set(name, null)
			fetch(`/music/${name}.scrim`)
				.then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${name}: ${r.status}`))))
				.then((text) => {
					const song = compile(text)
					if (song.errors.length) console.warn(`Score ${name}:`, song.errors)
					songs.set(name, song)
				})
				.catch((error) => console.warn('Music unavailable:', error))
		}
		return songs.get(name)
	}

	function radioOf(car) {
		if (!radios.has(car)) {
			const seed = 5000 + carSeed++
			radios.set(car, hash(seed) * RADIO_EVERY < 1 ? source('car', car.x, car.y, seed) : null)
		}
		const r = radios.get(car)
		if (r) {
			r.x = car.x
			r.y = car.y
		}
		return r
	}

	function convoyOf(cars, listener) {
		const car = convoyCar(cars, listener.x, listener.y)
		if (!car) return []
		if (convoy?.group !== car.convoy) convoy = { ...source('convoy', 0, 0, 9000 + carSeed++, CONVOY), group: car.convoy }
		convoy.x = car.x
		convoy.y = car.y
		return [convoy]
	}

	// Each frame: who's in earshot, how loud and how muffled, and their next notes.
	function update(audio, cars, listener, view, inCar) {
		if (!audio || audio.muted) {
			if (audio) for (const p of playing.values()) stop(p, audio.context)
			return
		}
		const { context, master } = audio
		synth ??= synthFor(context, master)
		const sources = fixed.concat(
			cars
				.filter((c) => (c.ai && !c.convoy) || c === listener.car)
				.map(radioOf)
				.filter(Boolean),
			convoyOf(cars, listener),
		)
		const want = nearest(sources, listener.x, listener.y)
		for (const p of playing.values()) if (!want.includes(p.src)) stop(p, context)
		const now = context.currentTime
		for (const src of want) {
			const song = load(src.score)
			if (!song) continue
			let p = playing.get(src)
			if (!p) playing.set(src, (p = begin(synth, context, src, song)))
			const own = src.kind === 'car' && !!listener.car && radios.get(listener.car) === src
			const d = Math.hypot(src.x - listener.x, src.y - listener.y)
			const pan = own ? 0 : Math.max(-1, Math.min(1, ((src.x - view.x0) / (view.x1 - view.x0)) * 2 - 1))
			tune(p, shape(src.kind, d, own, inCar), pan, now)
			feed(p, now + AHEAD, now)
		}
	}

	return {
		update,
		inspect: () =>
			[...playing.values()].map((p) => ({
				kind: p.src.kind,
				score: p.src.score,
				gain: p.level.gain.value,
				cutoff: p.tone.frequency.value,
			})),
	}
}
