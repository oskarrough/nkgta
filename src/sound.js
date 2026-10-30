import { enclosure } from './space.js'

let context
let master
let room // where every source sends, by how enclosed you are
let noise
let playerVoice
let muted = false
// 0–1, scales everything that reaches master; squared so the slider feels even.
let volume = 0.5
try {
	muted = localStorage.getItem('nk-leise') === 'true'
	volume = Math.min(1, Math.max(0, Number(localStorage.getItem('nk-lautstaerke') ?? 0.5) || 0))
} catch {
	// Sound still works when browser storage is unavailable.
}
const events = []
const note = (kind, gain) => {
	events.push({ kind, gain: +gain.toFixed(4) })
	if (events.length > 24) events.shift()
}
// Loud sounds push the music down for a moment, so a crash cuts through a song.
let duckLevel = 0
let duckAt = 0
const DUCK_FADE = 1.2 // seconds back to full
function duck(amount) {
	if (!context) return
	duckLevel = Math.min(1, Math.max(ducking(), amount))
	duckAt = context.currentTime
}
const ducking = () => (context ? duckLevel * Math.max(0, 1 - (context.currentTime - duckAt) / DUCK_FADE) : 0)
// How much of each source goes to the room when you're shut in. Subtle: the
// dry mix stays as tuned and the room only adds colour.
const SEND = 0.3
const LOOK_EVERY = 0.25 // seconds between looks at the walls
const ROOM = 0.5 // inside a shop, the room is small whatever the street does
let shut = 0 // 0 open to 1 shut in, as heard
let lookAt = -Infinity
const level = () => (muted ? 0 : 0.22 * volume * volume)
const store = (key, value) => {
	try {
		localStorage.setItem(key, String(value))
	} catch {
		// A blocked storage write must not interrupt driving.
	}
}
function applyLevel() {
	if (!master) return
	master.gain.cancelAndHoldAtTime(context.currentTime)
	master.gain.linearRampToValueAtTime(level(), context.currentTime + 0.04)
}
// A bad number from the game mustn't take the game down with it.
const smooth = (param, value, time = 0.1) => Number.isFinite(value) && param.setTargetAtTime(value, context.currentTime, time)

function start() {
	if (!context) {
		context = new AudioContext()
		master = context.createGain()
		master.gain.value = level()
		master.connect(context.destination)
		room = context.createGain()
		room.gain.value = 0
		const body = context.createBiquadFilter()
		body.type = 'highpass'
		body.frequency.value = 250
		const verb = context.createConvolver()
		verb.buffer = impulse(context, 1.3)
		room.connect(body).connect(verb).connect(master)
		noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
		const data = noise.getChannelData(0)
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
		for (const name of ['door-open', 'door-close', 'glass', 'till']) load(name)
	}
	if (context.state === 'suspended') context.resume().catch(() => {})
}

// A made-up room: noise that thins out and darkens, after a few early echoes.
function impulse(ctx, seconds) {
	const rate = ctx.sampleRate
	const buffer = ctx.createBuffer(2, Math.floor(rate * seconds), rate)
	for (let c = 0; c < 2; c++) {
		const data = buffer.getChannelData(c)
		const pre = Math.floor(rate * 0.008)
		let low = 0
		for (let i = pre; i < data.length; i++) {
			const t = (i - pre) / (data.length - pre)
			low += (0.85 - 0.7 * t) * (Math.random() * 2 - 1 - low)
			data[i] = low * (1 - t) ** 3
		}
		for (const ms of [9, 14, 22, 31]) data[Math.floor((rate * (ms + c * 2.3)) / 1000)] += 0.5 * (Math.random() < 0.5 ? -1 : 1)
	}
	return buffer
}

function out(node) {
	node.connect(master)
	node.connect(room)
}

function noiseSource() {
	const source = context.createBufferSource()
	source.buffer = noise
	source.loop = true
	return source
}

function voice() {
	const motor = context.createOscillator()
	motor.type = 'sawtooth'
	const filter = context.createBiquadFilter()
	filter.type = 'lowpass'
	const gain = context.createGain()
	gain.gain.value = 0
	const grit = noiseSource()
	const gritGain = context.createGain()
	gritGain.gain.value = 0
	const pan = context.createStereoPanner()
	// Half-speed square detuned against the saw gives the uneven cylinder beat.
	const sub = context.createOscillator()
	sub.type = 'square'
	const subGain = context.createGain()
	subGain.gain.value = 0.25
	// The firing pulse throbs the level, so it chugs instead of humming.
	const chug = context.createGain()
	const pulse = context.createOscillator()
	const depth = context.createGain()
	depth.gain.value = 0
	pulse.connect(depth).connect(chug.gain)
	motor.connect(filter)
	sub.connect(subGain).connect(filter)
	grit.connect(gritGain).connect(filter)
	filter.connect(chug).connect(gain).connect(pan)
	out(pan)
	motor.start()
	sub.start()
	pulse.start()
	grit.start()
	return { motor, sub, subGain, chug, pulse, depth, filter, gain, grit, gritGain, pan }
}

function stopVoice(v) {
	if (!v) return
	const end = context.currentTime + 0.2
	smooth(v.gain.gain, 0, 0.025)
	for (const o of [v.motor, v.sub, v.pulse, v.grit]) o.stop(end)
	v.motor.onended = () => {
		for (const node of [v.motor, v.sub, v.subGain, v.chug, v.pulse, v.depth, v.filter, v.gain, v.grit, v.gritGain, v.pan]) node.disconnect()
	}
}

function burst(frequency, amount, duration) {
	if (!context || muted || amount <= 0) return
	const source = noiseSource()
	const filter = context.createBiquadFilter()
	filter.type = 'bandpass'
	filter.frequency.value = frequency
	filter.Q.value = 0.7
	const gain = context.createGain()
	gain.gain.setValueAtTime(amount, context.currentTime)
	gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
	source.connect(filter).connect(gain)
	out(gain)
	source.start()
	source.stop(context.currentTime + duration)
	source.onended = () => {
		source.disconnect()
		filter.disconnect()
		gain.disconnect()
	}
	duck(amount * 3)
	note('impact', amount)
}

let squeal
let lastImpact = -Infinity
function engine(car) {
	if (!context) return
	if (playerVoice?.car !== car) {
		stopVoice(playerVoice)
		playerVoice = car ? { ...voice(), car } : null
	}
	if (!squeal && car) {
		const source = noiseSource()
		const filter = context.createBiquadFilter()
		filter.type = 'bandpass'
		filter.frequency.value = 1500
		filter.Q.value = 1.4
		const gain = context.createGain()
		gain.gain.value = 0
		source.connect(filter).connect(gain)
		out(gain)
		source.start()
		squeal = { source, filter, gain }
	}
	if (squeal && !car) {
		const old = squeal
		smooth(old.gain.gain, 0, 0.025)
		old.source.stop(context.currentTime + 0.2)
		old.source.onended = () => {
			old.source.disconnect()
			old.filter.disconnect()
			old.gain.disconnect()
		}
		squeal = null
	}
	if (squeal) smooth(squeal.gain.gain, car ? Math.min(0.055, Math.max(0, car.slip - 0.5) * 0.018) : 0, 0.04)
	if (!playerVoice) return
	const speed = Math.hypot(car.vx, car.vy)
	const load = Math.abs(car.throttle ?? 0) * (car.braking ? 0.15 : 1)
	// Revs climb through each gear and drop on the shift, instead of one long vroom.
	const gears = [0, 2, 4.2, 6.8, 10]
	let gear = gears.findLastIndex((g) => speed >= g)
	gear = Math.min(gear, gears.length - 2)
	const inGear = Math.min(1, (speed - gears[gear]) / (gears[gear + 1] - gears[gear]))
	const revs = Math.min(1, 0.12 + inGear * 0.7 + load * 0.18)
	if (gear !== playerVoice.gear) {
		if (playerVoice.gear !== undefined) playerVoice.gain.gain.setTargetAtTime(0.02, context.currentTime, 0.02)
		playerVoice.gear = gear
	}
	const hz = 26 + revs * 34
	smooth(playerVoice.motor.frequency, hz, 0.06)
	smooth(playerVoice.sub.frequency, hz * 0.503, 0.06)
	smooth(playerVoice.pulse.frequency, hz / 2, 0.06)
	smooth(playerVoice.depth.gain, 0.25 - revs * 0.15, 0.1)
	smooth(playerVoice.filter.frequency, 90 + revs * 220 + load * 150, 0.08)
	smooth(playerVoice.gritGain.gain, 0.012 + load * 0.035)
	smooth(playerVoice.gain.gain, 0.038 + revs * 0.02 + load * 0.012, 0.12)
	if (car.impact > 0.6 && context.currentTime - lastImpact > 0.18) {
		burst(85, Math.min(0.38, car.impact * 0.035), 0.18)
		lastImpact = context.currentTime
	}
	car.impact = 0
}

// Sources under /home/osk/sites/dodgethis/sounds/osk-sfx/:
// door-open.ogg: chest-and-doors/door-open.wav
// door-close.ogg: chest-and-doors/door-close.wav
// city.ogg: ambience/city-ambience-loop.wav
// glass.ogg: misc/glass-001.ogg
// till.ogg: game/shop/cash-001.wav
// Mono Vorbis, 24 kHz / ~64 kbps; short cues trimmed and faded.
const buffers = new Map()
function load(name) {
	if (!buffers.has(name)) {
		buffers.set(
			name,
			fetch(`/sfx/${name}.ogg`)
				.then((r) => {
					if (!r.ok) throw new Error(`${name}: ${r.status}`)
					return r.arrayBuffer()
				})
				.then((data) => context.decodeAudioData(data))
				.catch((error) => {
					console.warn('Sound unavailable:', error)
					return null
				}),
		)
	}
	return buffers.get(name)
}

function horns() {
	const filter = context.createBiquadFilter()
	filter.type = 'lowpass'
	filter.frequency.value = 1800
	const gain = context.createGain()
	gain.gain.value = 0
	const pan = context.createStereoPanner()
	for (const hz of [370, 466]) {
		const osc = context.createOscillator()
		osc.type = 'square'
		osc.frequency.value = hz
		osc.connect(filter)
		osc.start()
	}
	filter.connect(gain).connect(pan)
	out(pan)
	return { gain, pan }
}

function play(buffer, name, amount, rate = 1, delay = 0) {
	if (!buffer || muted || context.state !== 'running') return
	const source = context.createBufferSource()
	const gain = context.createGain()
	source.buffer = buffer
	source.playbackRate.value = rate
	gain.gain.value = amount
	source.connect(gain)
	out(gain)
	source.start(context.currentTime + delay)
	source.onended = () => {
		source.disconnect()
		gain.disconnect()
	}
	note(name, amount)
}

async function cue(name, amount, rate = 1, delay = 0) {
	if (!context || muted) return
	const buffer = await load(name)
	play(buffer, name, amount, rate, delay)
}

const neighbours = new Map()
const spareTraffic = []
const waiting = new WeakMap()
let hornAfter = 0
// A wedding convoy leans on its horns: dıt dıt dıııt, eight steps a second, in
// bursts, heard about as far off as its song.
const HONK = 'x.x.xxxxxx......'
const HONK_HEAR = 40
let honk
let city
let cityLoading = false
function street(cars, player, view, dt) {
	if (!context) return
	const now = context.currentTime
	const distance = (c) => Math.hypot(c.x - player.x, c.y - player.y)
	const nearest = cars
		.filter((c) => c.ai && c !== player.car && distance(c) < 18)
		.sort((a, b) => distance(a) - distance(b))
		.slice(0, 2)
	for (const [car, v] of neighbours) {
		if (nearest.includes(car)) continue
		smooth(v.gain.gain, 0, 0.06)
		spareTraffic.push(v)
		neighbours.delete(car)
	}
	for (const car of nearest) {
		if (!neighbours.has(car)) neighbours.set(car, spareTraffic.pop() ?? voice())
		const v = neighbours.get(car)
		const dx = player.x - car.x
		const dy = player.y - car.y
		const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle)
		const across = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle)
		const blocked =
			Math.hypot(car.vx, car.vy) < 0.25 && forward > 0 && forward < car.model.length / 2 + 3 && Math.abs(across) < car.model.width / 2 + 0.6
		const wait = blocked ? (waiting.get(car) ?? 0) + dt : 0
		waiting.set(car, wait)
		if (!muted && wait > 4 && now > hornAfter) {
			v.hornUntil = now + 0.16
			hornAfter = now + 18 + Math.random() * 15
			waiting.set(car, 0)
			duck(0.3)
			note('horn', 0.07)
		}
		if (!muted && car.ai.honk) {
			v.hornUntil = now + 0.5
			duck(0.3)
			note('horn', 0.07)
		}
		// A horn borrows its engine oscillator: still only two traffic voices.
		const horn = now < (v.hornUntil ?? 0)
		const hz = horn ? 330 : 29 + Math.min(50, Math.hypot(car.vx, car.vy) * 7)
		smooth(v.motor.frequency, hz, 0.04)
		smooth(v.sub.frequency, hz * 0.503, 0.04)
		smooth(v.pulse.frequency, hz / 2, 0.04)
		smooth(v.filter.frequency, horn ? 950 : 170, 0.04)
		smooth(v.gain.gain, horn ? 0.07 : 0.025 * (1 - distance(car) / 18) ** 2 * (player.car ? 0.55 : 1), 0.06)
		smooth(v.pan.pan, Math.max(-1, Math.min(1, ((car.x - view.x0) / (view.x1 - view.x0)) * 2 - 1)))
	}
	let lead = null
	for (const c of cars) if (c.convoy && c.ai && (!lead || distance(c) < distance(lead))) lead = c
	if (lead && !honk) honk = horns()
	if (honk) {
		const step = Math.floor(now * 8)
		if (step !== honk.step && step % HONK.length === 0) honk.on = Math.random() < 0.6
		honk.step = step
		const near = lead ? Math.max(0, 1 - distance(lead) / HONK_HEAR) : 0
		smooth(honk.gain.gain, honk.on && HONK[step % HONK.length] === 'x' ? 0.05 * near * near : 0, 0.01)
		if (lead) smooth(honk.pan.pan, Math.max(-1, Math.min(1, ((lead.x - view.x0) / (view.x1 - view.x0)) * 2 - 1)))
	}
	if (!cityLoading) {
		cityLoading = true
		load('city').then((buffer) => {
			if (!buffer) return
			const source = context.createBufferSource()
			const gain = context.createGain()
			source.buffer = buffer
			source.loop = true
			gain.gain.value = 0
			source.connect(gain)
			out(gain)
			source.start()
			city = { source, gain }
		})
	}
	if (city) smooth(city.gain.gain, player.car ? 0.012 : 0.035, 0.8)
}

// No sound in a hidden tab; the next physical key resumes it.
addEventListener('visibilitychange', () => {
	if (document.hidden && context?.state === 'running') context.suspend().catch(() => {})
})
let lastClink = -Infinity

function listen(world, x, y, inside) {
	if (!context || context.currentTime - lookAt < LOOK_EVERY) return
	lookAt = context.currentTime
	shut = Math.max(enclosure(world, x, y), inside ? ROOM : 0)
	smooth(room.gain, SEND * shut, 0.4)
}

export const sound = {
	start,
	listen,
	enclosure: () => shut,
	audio: () => context && { context, master, room, noise, muted, duck: ducking },
	engine,
	street,
	async door() {
		if (!context || muted) return
		const [open, close] = await Promise.all([load('door-open'), load('door-close')])
		duck(0.35)
		play(open, 'door-open', 0.18)
		play(close, 'door-close', 0.15, 1, 0.3)
	},
	hit(speed) {
		burst(105, Math.min(0.4, speed * 0.07), 0.22)
	},
	spill(count) {
		for (let i = 0; i < Math.min(5, count); i++) cue('glass', 0.075 / (1 + i * 0.2), 1.25 + i * 0.17, 0.06 + i * 0.075)
	},
	clink() {
		if (!context || context.currentTime - lastClink < 0.12) return
		lastClink = context.currentTime
		cue('glass', 0.09, 1.1 + Math.random() * 0.15)
	},
	till() {
		duck(0.4)
		cue('till', 0.13)
	},
	tick() {
		burst(2800, 0.04, 0.035)
	},
	isMuted: () => muted,
	toggleMute() {
		muted = !muted
		// Unmuting at zero volume would stay silent, so come back at half.
		if (!muted && volume === 0) volume = 0.5
		applyLevel()
		store('nk-leise', muted)
		store('nk-lautstaerke', volume)
		return muted
	},
	volume: () => volume,
	setVolume(value) {
		volume = Math.min(1, Math.max(0, value))
		muted = volume === 0
		applyLevel()
		store('nk-leise', muted)
		store('nk-lautstaerke', volume)
		return muted
	},
	// Read actual AudioParams for browser verification without an audio device.
	inspect() {
		return {
			state: context?.state ?? 'unstarted',
			muted,
			volume,
			master: master?.gain.value ?? 0,
			engine: playerVoice && {
				hz: playerVoice.motor.frequency.value,
				gain: playerVoice.gain.gain.value,
				grit: playerVoice.gritGain.gain.value,
			},
			squeal: squeal?.gain.gain.value ?? 0,
			traffic: [...neighbours.values()].map((v) => ({ hz: v.motor.frequency.value, gain: v.gain.gain.value, pan: v.pan.pan.value })),
			trafficVoices: neighbours.size + spareTraffic.length,
			city: city?.gain.gain.value ?? 0,
			enclosure: shut,
			room: room?.gain.value ?? 0,
			events: [...events],
		}
	},
}
