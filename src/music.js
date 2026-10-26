// Music from places: a Späti radio, a bar door, an open window, a passing car,
// a wedding convoy. Each plays one of the songs in public/music, plain text the
// jukebox synth plays live, quieter and duller the further away it is. Only the
// nearest few play at all, and each one carries on where it had got to while
// you were away.
// A song can belong to a street or a kind of place (`at doener`, `at feld`);
// sources there mostly play its songs. A big open field plays too, softly, from
// all round you.
import { compile } from './jukebox/score.js'
import { createSynth } from './jukebox/synth.js'
import { T } from './tiles.js'

export const SCORES = [
	'hermannplatz',
	'weserstrasse',
	'sonnenallee',
	'sonnenallee-nacht',
	'wriezener',
	'hasenheide',
	'ringbahn',
	'konvoi',
	'richardstr',
	'weichselplatz',
	'karl-marx',
	'a100',
	'grenzallee',
	'buschkrugallee',
	'tempelhof',
	'luftbruecke',
]
export const HEAR = 18 // tiles, how far music carries
export const CONVOY = 'konvoi' // the wedding convoy's own song, played nowhere else
const PLACE_SCORES = SCORES.filter((s) => s !== CONVOY)
const PLAYING = 2 // sources sounding at once
// Which shops have music on, as what, and one in how many.
const SHOPS = {
	spaeti: ['radio', 3],
	bar: ['bar', 3],
	doener: ['radio', 3],
	imbiss: ['radio', 5],
	cafe: ['radio', 5],
}
const WINDOW_EVERY = 80 // one building in this many has a window open
const RADIO_EVERY = 5 // one moving car in this many has the radio on
const LOCAL = 2 / 3 // how often a source on a street or at a place with its own songs plays one
const REACH = 8 // tiles, how far from a source to look for its street
export const AHEAD = 0.3 // seconds of notes scheduled ahead
// How each kind of source sounds: level, brightest cutoff in Hz, reverb send,
// and how many tiles it carries if further than HEAR.
export const KINDS = {
	radio: { level: 0.55, cutoff: 3200, wet: 0.25 },
	bar: { level: 0.8, cutoff: 1400, wet: 0.5 },
	window: { level: 0.7, cutoff: 2200, wet: 0.6 },
	car: { level: 1, cutoff: 900, wet: 0.15 },
	field: { level: 0.4, cutoff: 5000, wet: 0.8 },
	convoy: { level: 1.2, cutoff: 4200, wet: 0.2, hear: 45 }, // windows down, all of it
}
export const reach = (kind) => KINDS[kind].hear ?? HEAR
const CELL = 8 // tiles, how coarsely the field is mapped
const FIELD = 150 // hectares of open grass before it counts as a field

// A number in [0, 1) that is always the same for the same n.
const hash = (n) => {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
	return s - Math.floor(s)
}

// The name of the street nearest (x, y), within REACH tiles, or ''.
export function streetNear(world, x, y) {
	if (!world.streetAt) return ''
	let best = ''
	let bestD = Infinity
	for (let r = 0; r <= REACH && !best; r++)
		for (let dy = -r; dy <= r; dy++)
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
				const name = world.streetAt(x + dx, y + dy)
				const d = dx * dx + dy * dy
				if (name && d < bestD) [best, bestD] = [name, d]
			}
	return best
}

// Which song a source plays: on a street or at a kind of place with songs of
// its own, one of those LOCAL of the time; otherwise any song. `homes` maps a
// song to where it belongs: { street, at: [kinds] }.
export function pickScore(homes, street, at, seed) {
	const local = PLACE_SCORES.filter((n) => (street && homes[n]?.street === street) || (at && homes[n]?.at?.includes(at)))
	const pool = local.length && hash(seed + 0.75) < LOCAL ? local : PLACE_SCORES
	return pool[Math.floor(hash(seed + 0.5) * pool.length)]
}

// Spätis, bars, döner shops, cafés and the odd open window, each with its song
// and how long ago it started.
export function placeSources(world, shops, homes = {}) {
	const sources = []
	for (const [i, shop] of shops.entries()) {
		const [kind, every] = SHOPS[shop.kind] ?? []
		if (kind && hash(1000 + i) * every < 1) sources.push(source(world, homes, kind, shop.x, shop.y, 1000 + i, shop.kind))
	}
	for (const [i, b] of world.buildings.entries()) {
		if (hash(i) * WINDOW_EVERY >= 1) continue
		const r = b.rings[0]
		sources.push(source(world, homes, 'window', r[0], r[1], i))
	}
	return sources
}

function source(world, homes, kind, x, y, seed, at = '') {
	return { kind, x, y, score: pickScore(homes, streetNear(world, x, y), at, seed), since: hash(seed + 0.25) * 600 }
}

// The big open fields on the map, like Tempelhofer Feld: grass with no road,
// building or water in it, mapped in cells of CELL tiles, joined up and kept if
// they come to FIELD hectares. Returns how far (x, y) is from the nearest
// field, in tiles, up to HEAR; or null if the map has none.
export function openField(world) {
	const { W, H, tiles } = world
	if (!tiles) return null
	const CW = Math.ceil(W / CELL)
	const CH = Math.ceil(H / CELL)
	const open = new Uint8Array(CW * CH)
	for (let cy = 0; cy < CH; cy++)
		for (let cx = 0; cx < CW; cx++) {
			let grass = 0
			let n = 0
			let shut = false
			for (let y = cy * CELL; y < Math.min(H, cy * CELL + CELL); y++)
				for (let x = cx * CELL; x < Math.min(W, cx * CELL + CELL); x++) {
					const t = tiles[y * W + x]
					n++
					if (t === T.BUILDING || t === T.ROAD || t === T.WATER) shut = true
					else if (t === T.GRASS) grass++
				}
			open[cy * CW + cx] = !shut && grass >= n / 4 ? 1 : 0
		}
	const field = new Uint8Array(CW * CH)
	const seen = new Uint8Array(CW * CH)
	const big = (FIELD * 1e4) / (CELL * CELL * world.tileM * world.tileM)
	let any = false
	for (let s = 0; s < CW * CH; s++) {
		if (!open[s] || seen[s]) continue
		const cells = []
		const stack = [s]
		seen[s] = 1
		while (stack.length) {
			const i = stack.pop()
			cells.push(i)
			const x = i % CW
			for (const j of [x > 0 ? i - 1 : -1, x < CW - 1 ? i + 1 : -1, i - CW, i + CW])
				if (j >= 0 && j < CW * CH && open[j] && !seen[j]) {
					seen[j] = 1
					stack.push(j)
				}
		}
		if (cells.length < big) continue
		any = true
		for (const i of cells) field[i] = 1
	}
	if (!any) return null
	const R = Math.ceil(HEAR / CELL) + 1
	return (x, y) => {
		let best = HEAR
		const cx = Math.floor(x / CELL)
		const cy = Math.floor(y / CELL)
		for (let j = Math.max(0, cy - R); j <= Math.min(CH - 1, cy + R); j++)
			for (let i = Math.max(0, cx - R); i <= Math.min(CW - 1, cx + R); i++) {
				if (!field[j * CW + i]) continue
				const dx = Math.max(i * CELL - x, 0, x - (i + 1) * CELL)
				const dy = Math.max(j * CELL - y, 0, y - (j + 1) * CELL)
				best = Math.min(best, Math.hypot(dx, dy))
			}
		return best
	}
}

// Your own car's radio is a station: the songs that say `at autoradio` (any
// song, if none do), each played through once, then the next.
export function stationPool(homes) {
	const own = SCORES.filter((n) => homes[n]?.at?.includes('autoradio'))
	return own.length ? own : PLACE_SCORES
}
// R turns the dial: the rock station, everything the Kiez plays, then off.
export const STATIONS = [
	{ name: 'Radio A100', pool: stationPool },
	{ name: 'Kiezfunk', pool: (homes) => PLACE_SCORES.filter((n) => !stationPool(homes).includes(n)) },
	{ name: null }, // off
]
export const nextOnAir = (pool, score) => pool[(pool.indexOf(score) + 1) % pool.length]

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

// However many play, one leads: a source steps back behind a louder one as
// that one gets near, so you hear a song and some street, not two songs at
// once. Two about as loud share the space; your own radio leaves the street a
// murmur.
export function lead(shapes, kinds) {
	return shapes.map((s, i) => {
		let back = 0
		for (const [j, o] of shapes.entries()) {
			if (j === i || !s.level) continue
			const louder = Math.min(1, Math.max(0, (o.level / s.level - 1) * 2))
			back = Math.max(back, BACK * louder * Math.min(1, o.level / KINDS[kinds[j]].level))
		}
		return { ...s, level: s.level * (1 - back), wet: s.wet * (1 - back) }
	})
}
const BACK = 0.85 // how far the others step back behind a louder one right beside you

// The music bus, as loud as the moment wants: low on foot so the street and
// the doors come through, up when your own radio is on, ducked under a loud
// noise, muffled in a shop, sunk under water when you're wasted.
export function mix({ radio, duck = 0, inside = false, down = false }) {
	const level = (radio ? 0.6 : 0.3) * (1 - 0.65 * duck) * (down ? 0.45 : 1)
	return { level, cutoff: down ? 320 : inside ? 900 : 18000 }
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

export function createMusic(world, shops, say = () => {}) {
	const songs = new Map()
	// Sources are placed once every song is in, since a song says where it belongs.
	let fixed = null
	let homes = {}
	const fieldNear = openField(world)
	// The field follows you along its edge, and picks a song again each time you come back.
	const field = { kind: 'field', x: 0, y: 0, score: null, since: 0 }
	let fieldSeed = 9000
	const radios = new WeakMap()
	let convoy = null // the convoy's song, while it lasts
	// Your car radio, on whenever you sit in a car and still on air while you
	// don't. Every station keeps going while you listen to another.
	const stations = STATIONS.map(
		(s, i) => s.name && { kind: 'car', x: 0, y: 0, score: null, since: 0, name: s.name, pool: s.pool, seed: 7000 + i },
	)
	let dial = 0
	let tunedIn = null // the station and song last announced
	let announceAt = Infinity
	let wasInCar = false
	let bus = null
	let carSeed = 0
	const playing = new Map()
	let synth = null
	let heard = null // every source in the last frame, for the music debug view
	Promise.all(
		SCORES.map((name) =>
			fetch(`/music/${name}.song`)
				.then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${name}: ${r.status}`))))
				.then((text) => {
					const song = compile(text)
					if (song.errors.length) console.warn(`Song ${name}:`, song.errors)
					songs.set(name, song)
				})
				.catch((error) => console.warn('Music unavailable:', error)),
		),
	).then(() => {
		homes = Object.fromEntries([...songs].map(([name, song]) => [name, { street: song.street, at: song.at }]))
		fixed = placeSources(world, shops, homes)
	})

	function stop(p, context) {
		playing.delete(p.src)
		end(p, context)
	}

	function radioOf(car) {
		if (!radios.has(car)) {
			const seed = 5000 + carSeed++
			radios.set(car, hash(seed) * RADIO_EVERY < 1 ? source(world, homes, 'car', car.x, car.y, seed) : null)
		}
		const r = radios.get(car)
		if (r) {
			r.x = car.x
			r.y = car.y
		}
		return r
	}

	// The field sounds from where you are, as far off as its nearest edge.
	function fieldAt(x, y) {
		const d = fieldNear?.(x, y) ?? HEAR
		if (d >= HEAR) {
			field.score = null
			return null
		}
		if (!field.score) {
			fieldSeed++
			// The field isn't a radio: it plays its own songs, if it has any.
			const own = SCORES.filter((n) => homes[n]?.at?.includes('feld'))
			const pool = own.length ? own : PLACE_SCORES
			field.score = pool[Math.floor(hash(fieldSeed + 0.5) * pool.length)]
			field.since = hash(fieldSeed + 0.25) * 600
		}
		field.x = x + d
		field.y = y
		return field
	}

	// The station follows you from car to car. Getting in, you join whatever's
	// on; when a song ends the next starts, on air whether you listen or not.
	function stationIn(car, now) {
		const station = stations[dial]
		if (!car || !station) return []
		const pool = station.pool(homes)
		const length = (n) => (songs.has(n) ? songs.get(n).intro.dur + songs.get(n).loop.dur : Infinity)
		if (!station.score) {
			station.score = pool[Math.floor(hash(station.seed + 0.5) * pool.length)]
			station.since = hash(station.seed + 0.25) * length(station.score)
		}
		for (let guard = 0; guard < 100 && now + station.since >= length(station.score); guard++) {
			station.since -= length(station.score)
			station.score = nextOnAir(pool, station.score)
		}
		station.x = car.x
		station.y = car.y
		return [station]
	}

	// What's on, in the place line: the station and the song, once each.
	function announce(now) {
		const station = stations[dial]
		const key = station ? `${station.name}:${station.score}` : 'off'
		if (key === tunedIn || now < announceAt) return
		tunedIn = key
		say(station ? `${station.name} · ${songs.get(station.score)?.title ?? station.score}` : 'Radio aus')
	}

	function convoyOf(cars, listener) {
		const car = convoyCar(cars, listener.x, listener.y)
		if (!car) return []
		if (convoy?.group !== car.convoy)
			convoy = { kind: 'convoy', x: 0, y: 0, score: CONVOY, since: hash(9000 + carSeed++) * 600, group: car.convoy }
		convoy.x = car.x
		convoy.y = car.y
		return [convoy]
	}

	// Each frame: who's in earshot, how loud and how muffled, and their next notes.
	function update(audio, cars, listener, view, { inCar = false, inside = false, down = false } = {}) {
		if (!fixed || !audio || audio.muted) {
			heard = fixed
			if (audio) for (const p of playing.values()) stop(p, audio.context)
			return
		}
		const { context, master } = audio
		if (!bus) {
			bus = { gain: context.createGain(), tone: context.createBiquadFilter() }
			bus.gain.gain.value = 0
			bus.tone.type = 'lowpass'
			bus.tone.frequency.value = 18000
			bus.gain.connect(bus.tone).connect(master)
		}
		synth ??= synthFor(context, bus.gain)
		const now = context.currentTime
		if (inCar && !wasInCar) {
			// Let the car's name show first.
			announceAt = now + 1.8
			tunedIn = null
		}
		wasInCar = inCar
		const own = stationIn(listener.car, now)
		if (inCar && (!own.length || songs.has(own[0].score))) announce(now)
		const sources = fixed.concat(
			cars
				.filter((c) => c.ai && !c.convoy && c !== listener.car)
				.map(radioOf)
				.filter(Boolean),
			own,
			convoyOf(cars, listener),
			[fieldAt(listener.x, listener.y)].filter(Boolean),
		)
		heard = sources
		const want = nearest(sources, listener.x, listener.y).filter((src) => songs.has(src.score))
		for (const p of playing.values()) if (!want.includes(p.src) || p.song !== songs.get(p.src.score)) stop(p, context)
		const shapes = lead(
			want.map((src) => shape(src.kind, Math.hypot(src.x - listener.x, src.y - listener.y), own.includes(src), inCar)),
			want.map((src) => src.kind),
		)
		for (const [i, src] of want.entries()) {
			let p = playing.get(src)
			if (!p) playing.set(src, (p = begin(synth, context, src, songs.get(src.score))))
			const pan =
				own.includes(src) || src.kind === 'field' ? 0 : Math.max(-1, Math.min(1, ((src.x - view.x0) / (view.x1 - view.x0)) * 2 - 1))
			tune(p, shapes[i], pan, now)
			feed(p, now + AHEAD, now)
		}
		const m = mix({ radio: own.length > 0, duck: audio.duck?.() ?? 0, inside, down })
		bus.gain.gain.setTargetAtTime(m.level, now, 0.12)
		bus.tone.frequency.setTargetAtTime(m.cutoff, now, down ? 0.25 : 0.15)
	}

	// R: the next station, or off. Only in a car; nothing on the dial on foot.
	function nextStation(inCar) {
		if (!inCar || !fixed) return false
		dial = (dial + 1) % stations.length
		announceAt = 0
		return true
	}

	return {
		update,
		nextStation,
		// Musik-Debug: every source, and the gain of the ones playing.
		debug: () => ({ sources: heard ?? [], gains: new Map([...playing].map(([src, p]) => [src, p.level.gain.value])) }),
		inspect: () =>
			[...playing.values()].map((p) => ({
				kind: p.src.kind,
				score: p.src.score,
				street: streetNear(world, p.src.x, p.src.y),
				gain: p.level.gain.value,
				cutoff: p.tone.frequency.value,
			})),
	}
}
