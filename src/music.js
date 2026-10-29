import { shuffled } from './random.js'
import { compile, parse } from 'jukebox/score'
import { AHEAD, HEAR, KINDS, begin, end, feed, reach, shape as soundAt, synthFor, tune } from 'jukebox/player'
import { SONGS } from 'jukebox/songs'
import { muffling } from './space.js'
import { T } from './tiles.js'

// The jukebox also holds songs for other games.
export const SCORES = Object.keys(SONGS).filter((n) => {
	const { game } = parse(SONGS[n]).song
	return !game || game === 'nkgta'
})
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
const CELL = 8 // tiles, how coarsely the field is mapped
const FIELD = 150 // hectares of open grass before it counts as a field

const hash = (n) => {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
	return s - Math.floor(s)
}

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

export function placeSources(world, shops, homes = {}) {
	const sources = []
	for (const [i, shop] of shops.entries()) {
		const [kind, every] = SHOPS[shop.kind] ?? []
		if (kind && hash(1000 + i) * every < 1)
			sources.push({ ...source(world, homes, kind, shop.x, shop.y, 1000 + i, shop.kind), place: shop.name })
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
// song, if none do), each played through once, then the next in a shuffled order.
export function stationPool(homes) {
	const own = SCORES.filter((n) => homes[n]?.at?.includes('autoradio'))
	return own.length ? own : PLACE_SCORES
}
const STATIONS = [
	{ name: 'Radio A100', pool: stationPool },
	{ name: 'Kiezfunk', pool: (homes) => PLACE_SCORES.filter((n) => !stationPool(homes).includes(n)) },
	{ name: null }, // off
]

// The pool in a fresh random order that doesn't open with `last`, so a song
// never plays twice running, not even across the turn of the round.
export function shuffle(pool, rand, last) {
	const order = shuffled(pool, rand)
	if (order.length > 1 && order[0] === last) {
		const j = 1 + Math.floor(rand() * (order.length - 1))
		;[order[0], order[j]] = [order[j], order[0]]
	}
	return order
}

export function nextOnAir(station, pool, rand) {
	if (!station.queue?.length) station.queue = shuffle(pool, rand, station.score)
	return station.queue.shift()
}
// Getting into a car, the radio is off this often (one in this many), else on a station.
const RADIO_OFF = 5

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

// How a source of `kind` sounds `d` tiles away, as the jukebox has it, with a
// building in the way (`walled`, 0–1) taking level and brightness off.
export function shape(kind, d, own = false, inCar = false, walled = 0) {
	const s = soundAt(kind, d, own, inCar)
	return { ...s, level: s.level * (1 - 0.3 * walled), cutoff: s.cutoff * (1 - 0.65 * walled) }
}

// The loudest of the sources playing, your own radio aside. The one before
// keeps the lead until another is clearly louder, so the name doesn't flicker
// between two about as loud.
function loudestOf(want, shapes, own, before) {
	let best = null
	let bestLevel = 0
	for (const [i, src] of want.entries()) {
		if (own.includes(src)) continue
		const level = shapes[i].level * (src === before ? 1.25 : 1)
		if (level > bestLevel) [best, bestLevel] = [src, level]
	}
	return best
}

function placeOf(src) {
	if (src.place) return src.place
	return { window: 'Offenes Fenster', car: 'Autoradio', convoy: 'Hochzeitskorso', field: 'Auf dem Feld', bar: 'Bar' }[src.kind] ?? 'Radio'
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

export function createMusic(world, shops, rand = Math.random) {
	const songs = new Map()
	const fieldNear = openField(world)
	const field = { kind: 'field', x: 0, y: 0, score: null, since: 0 }
	let fieldSeed = 9000
	const radios = new WeakMap()
	let convoy = null // the convoy's song, while it lasts
	// Your car radio, on whenever you sit in a car and still on air while you
	// don't. Every station keeps going while you listen to another.
	const stations = STATIONS.map((s) => s.name && { kind: 'car', x: 0, y: 0, score: null, since: 0, name: s.name, pool: s.pool, queue: [] })
	let dial = 0
	let ridden = null // the car you sit in
	const dials = new WeakMap() // what each car's radio was last left on
	let tunedIn = null // the station and song last announced
	let onAir = null // what the radio display shows: { name, title }, name null when off
	let announceAt = Infinity
	let wasInCar = false
	let bus = null
	let carSeed = 0
	const playing = new Map()
	let synth = null
	let heard = null // every source in the last frame, for the music debug view
	let loudest = null // the source you hear most, outside your own car radio
	for (const name of SCORES) {
		const text = SONGS[name]
		const song = compile(text)
		if (song.errors.length) console.warn(`Song ${name}:`, song.errors)
		songs.set(name, song)
	}
	// A song says where it belongs, so sources are placed once every song is in.
	const homes = Object.fromEntries([...songs].map(([name, song]) => [name, { street: song.street, at: song.at }]))
	const fixed = placeSources(world, shops, homes)

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
			station.score = nextOnAir(station, pool, rand)
			station.since = rand() * length(station.score)
		}
		for (let guard = 0; guard < 100 && now + station.since >= length(station.score); guard++) {
			station.since -= length(station.score)
			station.score = nextOnAir(station, pool, rand)
		}
		station.x = car.x
		station.y = car.y
		return [station]
	}

	function announce(now) {
		const station = stations[dial]
		const key = station ? `${station.name}:${station.score}` : 'off'
		if (key === tunedIn || now < announceAt) return
		tunedIn = key
		onAir = station ? { name: station.name, title: songs.get(station.score)?.title ?? station.score } : { name: null, title: null }
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

	function update(audio, cars, listener, view, { inCar = false, inside = false, down = false } = {}) {
		if (!audio || audio.muted) {
			heard = fixed
			loudest = null
			if (audio) for (const p of playing.values()) stop(p, audio.context)
			return
		}
		const { context, master, room } = audio
		if (!bus) {
			bus = { gain: context.createGain(), tone: context.createBiquadFilter() }
			bus.gain.gain.value = 0
			bus.tone.type = 'lowpass'
			bus.tone.frequency.value = 18000
			bus.gain.connect(bus.tone).connect(master)
			bus.tone.connect(room)
		}
		synth ??= synthFor(context, bus.gain)
		const now = context.currentTime
		if (inCar && !wasInCar) {
			announceAt = now + 1.8
			tunedIn = null
		}
		wasInCar = inCar
		if (listener.car !== ridden) {
			ridden = listener.car
			if (ridden && !dials.has(ridden))
				dials.set(ridden, rand() * RADIO_OFF < 1 ? stations.length - 1 : Math.floor(rand() * (stations.length - 1)))
			if (ridden) dial = dials.get(ridden)
		}
		const own = stationIn(listener.car, now)
		if (inCar && (!own.length || songs.has(own[0].score))) announce(now)
		else if (!inCar) onAir = null
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
		// A shop's wall already muffles the whole bus; here only the street's walls count.
		const walled = (src) => (inside || own.includes(src) || src.kind === 'field' ? 0 : muffling(world, src, listener))
		const shapes = lead(
			want.map((src) => shape(src.kind, Math.hypot(src.x - listener.x, src.y - listener.y), own.includes(src), inCar, walled(src))),
			want.map((src) => src.kind),
		)
		loudest = loudestOf(want, shapes, own, loudest)
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

	// R: the next station, or off (`step` -1: the one before). Only in a car;
	// nothing on the dial on foot.
	function nextStation(inCar, step = 1) {
		if (!inCar) return false
		dial = (dial + step + stations.length) % stations.length
		if (ridden) dials.set(ridden, dial)
		announceAt = 0
		return true
	}

	return {
		update,
		nextStation,
		radio: () => onAir,
		hearing: () => loudest && { name: placeOf(loudest), title: songs.get(loudest.score)?.title ?? loudest.score },
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
