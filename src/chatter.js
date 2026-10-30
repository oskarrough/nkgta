// Kiez chatter: people talk, without words. Each phrase is a run of formant
// syllables with the rhythm and consonants of German, Turkish or Arabic, sung
// by one sawtooth through three band-pass filters, so it costs a few nodes per
// voice and nothing per frame. Quiet, placed where the speaker stands, and
// muffled by the same walls as the music.
import { muffling } from './space.js'

const fract = (x) => x - Math.floor(x)
const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453)
const pick = (list, rand) => list[Math.floor(rand() * list.length)]

// Neukölln: half German, a good part Turkish, the rest Arabic.
export function languageOf(seed) {
	const r = hash(seed * 97.31 + 1)
	return r < 0.5 ? 'de' : r < 0.78 ? 'tr' : 'ar'
}

// A voice from a seed: its language, pitch, and how big the speaker sounds.
export function voiceOf(seed) {
	const low = hash(seed * 31.7 + 2) < 0.55
	return { lang: languageOf(seed), f0: (low ? 100 : 185) + hash(seed * 17.3 + 3) * 35, size: low ? 1 : 1.17 }
}

// Formants (F1, F2, F3) of a male voice.
const VOWELS = {
	a: [730, 1090, 2440],
	ä: [660, 1720, 2410],
	e: [530, 1840, 2480],
	i: [270, 2290, 3010],
	o: [570, 840, 2410],
	u: [300, 870, 2240],
	ə: [500, 1500, 2500],
	ö: [450, 1550, 2300],
	ü: [270, 1750, 2150],
	ı: [320, 1250, 2400],
}
const NASAL = [250, 1100, 2300]
const THROAT = [820, 1250, 2500] // the Arabic ʕ: an open, pressed vowel

const stop = (hz, amp = 0.5) => ({ kind: 'stop', hz, amp, dur: 0.07 })
const fric = (hz, amp, dur = 0.09) => ({ kind: 'fric', hz, amp, dur })
const C = {
	t: stop(3600),
	d: stop(3000, 0.3),
	k: stop(1800),
	g: stop(1500, 0.3),
	p: stop(900),
	b: stop(800, 0.25),
	q: stop(900, 0.5),
	s: fric(6500, 0.35),
	sh: fric(3300, 0.45, 0.1),
	ch: fric(2600, 0.3),
	x: fric(1500, 0.35, 0.1),
	h: fric(1800, 0.2, 0.06),
	f: fric(5000, 0.2, 0.08),
	ħ: fric(1300, 0.4),
	m: { kind: 'nasal', dur: 0.06 },
	n: { kind: 'nasal', dur: 0.06 },
	ʕ: { kind: 'throat', dur: 0.07 },
}
const VOICED = new Set(['nasal', 'throat'])
const BACK = ['a', 'ı', 'o', 'u']
const FRONT = ['e', 'i', 'ö', 'ü']

// What makes each language sound like itself: German stresses the first
// syllable of a word and swallows the rest into schwas, with sh and ch about;
// Turkish is all open syllables of one length, rising to the end of each word;
// Arabic sings up and down, with throat and back-of-the-mouth consonants.
const LANGS = {
	de: {
		syllables: (rand) => 1 + Math.floor(rand() * 3),
		onsets: ['t', 'd', 'k', 'g', 'b', 'p', 's', 'sh', 'ch', 'h', 'f', 'm', 'n', null, null],
		onset: 0.65,
		codas: ['n', 'n', 't', 'ch', 's', 'm'],
		coda: 0.45,
		vowel: (rand, k) => (k === 0 ? pick(['a', 'e', 'i', 'o', 'u', 'ö', 'ü', 'ä'], rand) : rand() < 0.7 ? 'ə' : pick(['e', 'i'], rand)),
		length: (k) => (k === 0 ? 0.19 : 0.09),
		pitch: (k, n, w) => (k === 0 ? 1.22 : 0.95) - 0.04 * w,
	},
	tr: {
		syllables: (rand) => 2 + Math.floor(rand() * 3),
		onsets: ['t', 'k', 'm', 'n', 's', 'sh', 'd', 'b'],
		onset: 0.85,
		codas: ['n', 'm', 't', 'k'],
		coda: 0.15,
		vowel: (rand, k, set) => pick(set, rand),
		length: () => 0.14,
		pitch: (k, n, w) => (k === n - 1 ? 1.12 : 0.95) - 0.04 * w,
	},
	ar: {
		syllables: (rand) => 1 + Math.floor(rand() * 3),
		onsets: ['t', 'd', 'k', 'q', 'b', 'm', 'n', 'sh', 'x', 'ħ', 'ʕ', 'h', 's'],
		onset: 0.8,
		codas: ['n', 'm', 't', 'ħ', 'b', 's', 'ʕ'],
		coda: 0.4,
		vowel: (rand) => pick(['a', 'a', 'a', 'i', 'u'], rand),
		length: (k, rand) => (rand() < 0.35 ? 0.21 : 0.13),
		pitch: (k, n, w) => 1.05 + 0.15 * Math.sin(k * 2.1 + w * 1.7),
	},
}

// How it's said: how fast, how wide the pitch swings, how loud.
const MOODS = {
	calm: { words: [2, 3], pace: 1, range: 1, lift: 1, amp: 0.6 },
	snippet: { words: [1, 2], pace: 1, range: 0.9, lift: 1, amp: 0.55 },
	angry: { words: [2, 4], pace: 0.82, range: 1.7, lift: 1.12, amp: 1 },
	shout: { words: [1, 1], pace: 2.2, range: 1.8, lift: 1.3, amp: 1.6 },
}

// A phrase as plain numbers: syllables with when they start, how long they
// last, a pitch ratio at each end, and the consonants round the vowel.
export function phrase(lang, rand = Math.random, mood = 'calm') {
	const L = LANGS[lang]
	const M = MOODS[mood]
	const words = M.words[0] + Math.floor(rand() * (M.words[1] - M.words[0] + 1))
	const syllables = []
	let t = 0
	for (let w = 0; w < words; w++) {
		const n = mood === 'shout' ? 1 + Math.floor(rand() * 2) : L.syllables(rand)
		const set = rand() < 0.5 ? BACK : FRONT
		for (let k = 0; k < n; k++) {
			const last = w === words - 1 && k === n - 1
			const onset = rand() < L.onset ? C[pick(L.onsets, rand)] : null
			const coda = rand() < L.coda ? C[pick(L.codas, rand)] : null
			const vowel = L.vowel(rand, k, set)
			const shape = 1 + (L.pitch(k, n, w) - 1) * M.range
			const ratio = shape * M.lift
			const dur = L.length(k, rand) * M.pace * (last ? 1.3 : 1) * (0.85 + rand() * 0.3)
			syllables.push({
				at: t,
				dur: dur + (onset?.dur ?? 0) + (coda?.dur ?? 0),
				formants: VOWELS[vowel],
				f0: ratio,
				f0end: ratio * (last ? 0.78 : k === 0 && lang === 'de' ? 0.94 : 1),
				amp: M.amp * (k === 0 ? 1 : 0.75),
				onset,
				coda,
			})
			t += syllables.at(-1).dur
		}
		t += 0.07 + rand() * 0.07
	}
	return { lang, mood, syllables, duration: t }
}

const MAX_VOICES = 4
const HEAR = { snippet: 5, calm: 7, angry: 9, shout: 16 } // tiles
const LEVEL = 0.1 // a close voice at amp 1, before master
const SCENE_EVERY = [30, 70] // seconds between one scene's turns at the same spot
const TICK = 0.3 // seconds between decisions about who talks

// Sing one phrase from a place. Returns the handles to move it.
export function speak(audio, ph, voice, at, hear) {
	const { context: ctx, master, room, noise } = audio
	const t0 = ctx.currentTime + 0.03
	const nodes = []
	const make = (node) => (nodes.push(node), node)
	const osc = make(ctx.createOscillator())
	osc.type = 'sawtooth'
	const amp = make(ctx.createGain())
	amp.gain.value = 0
	const forms = [6, 9, 12].map((q, i) => {
		const f = make(ctx.createBiquadFilter())
		f.type = 'bandpass'
		f.Q.value = q
		const g = make(ctx.createGain())
		g.gain.value = [1, 0.6, 0.35][i] * 3
		osc.connect(f)
		f.connect(g).connect(amp)
		return f
	})
	const tone = make(ctx.createBiquadFilter())
	tone.type = 'lowpass'
	tone.frequency.value = 4000
	const hiss = make(ctx.createBufferSource())
	hiss.buffer = noise
	hiss.loop = true
	const band = make(ctx.createBiquadFilter())
	band.type = 'bandpass'
	band.Q.value = 1.5
	const breath = make(ctx.createGain())
	breath.gain.value = 0
	const level = make(ctx.createGain())
	level.gain.value = 0
	const pan = make(ctx.createStereoPanner())
	hiss.connect(band).connect(breath).connect(tone)
	amp.connect(tone)
	tone.connect(level).connect(pan)
	pan.connect(master)
	pan.connect(room)

	const say = (formants, time, gain) => {
		formants.forEach((hz, i) => forms[i].frequency.setTargetAtTime(hz * voice.size, time, 0.02))
		amp.gain.setTargetAtTime(gain, time, 0.015)
	}
	const consonant = (c, time, gain) => {
		if (c.kind === 'nasal') say(NASAL, time, gain * 0.5)
		else if (c.kind === 'throat') say(THROAT, time, gain * 0.7)
		else {
			band.frequency.setValueAtTime(c.hz, time)
			breath.gain.setTargetAtTime(c.amp * 0.6, time, 0.005)
			breath.gain.setTargetAtTime(0, time + c.dur * (c.kind === 'stop' ? 0.2 : 0.8), 0.015)
		}
	}
	osc.frequency.value = voice.f0
	for (const s of ph.syllables) {
		const start = t0 + s.at
		const vowel = start + (s.onset?.dur ?? 0)
		const end = start + s.dur
		const coda = end - (s.coda?.dur ?? 0)
		if (s.onset) consonant(s.onset, start, s.amp)
		osc.frequency.setTargetAtTime(voice.f0 * s.f0, vowel, 0.01)
		osc.frequency.setTargetAtTime(voice.f0 * s.f0end, vowel + (coda - vowel) * 0.3, (coda - vowel) * 0.4)
		say(s.formants, vowel, s.amp)
		if (s.coda) consonant(s.coda, coda, s.amp)
		if (!s.coda || !VOICED.has(s.coda.kind)) amp.gain.setTargetAtTime(0, coda, 0.02)
		else amp.gain.setTargetAtTime(0, end, 0.02)
	}
	const stopAt = t0 + ph.duration + 0.3
	osc.start(t0)
	hiss.start(t0, Math.random() * 0.5)
	osc.stop(stopAt)
	hiss.stop(stopAt)
	const v = {
		at,
		hear,
		level,
		pan,
		tone,
		until: stopAt,
		loud: ph.mood === 'shout' ? 1.5 : ph.mood === 'angry' ? 1.2 : 1,
		walled: 0,
		looked: -Infinity,
	}
	osc.onended = () => {
		for (const node of nodes) node.disconnect()
	}
	return v
}

// The talkers of a map, and who is talking now. `update` runs every frame from
// the sound layer; it decides, a few times a second, who says what.
export function createChatter(world, shops) {
	// Where a scene plays out: an argument at a Späti door, a phone call at a bus stop.
	const scenes = [
		...shops.filter((s) => s.kind === 'spaeti').map((s) => ({ kind: 'argue', x: s.stand.x, y: s.stand.y })),
		...(world.transit ?? []).filter((t) => t.kind === 'bus').map((t) => ({ kind: 'phone', x: t.x, y: t.y })),
	]
	scenes.forEach((s, i) =>
		Object.assign(s, { seed: hash(s.x * 3.1 + s.y * 7.7 + i), queue: [], next: -1, hear: s.kind === 'argue' ? HEAR.angry : HEAR.calm }),
	)
	const voices = []
	const spoke = new WeakMap()
	let tickAt = 0
	let passAt = 0
	let audioOf = null

	function say(ph, seed, at, hear) {
		if (!audioOf || voices.length >= MAX_VOICES) return
		voices.push(speak(audioOf, ph, voiceOf(seed), at, hear))
	}

	// An argument: two voices trading angry phrases, now and then cutting in.
	// A call: one voice, with the other end's turns left silent.
	function plan(scene, now) {
		const argue = scene.kind === 'argue'
		const turns = argue ? 4 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 3)
		let at = now
		for (let i = 0; i < turns; i++) {
			const seed = argue ? scene.seed + (i % 2) * 0.37 : scene.seed
			const ph = phrase(voiceOf(seed).lang, Math.random, argue ? 'angry' : 'calm')
			scene.queue.push({ at, ph, seed })
			at += ph.duration + (argue ? -0.15 + Math.random() * 0.7 : 1.3 + Math.random() * 1.5)
		}
	}

	function update(audio, people, player, view, { inside = false } = {}) {
		if (!audio || audio.muted || audio.context.state !== 'running' || !audio.noise) return
		audioOf = audio
		const ctx = audio.context
		const now = ctx.currentTime
		const near = (o) => Math.hypot(o.x - player.x, o.y - player.y)

		for (const scene of scenes) {
			if (scene.queue.length) {
				if (near(scene) > scene.hear + 6) scene.queue.length = 0
				else if (scene.queue[0].at <= now) {
					const { ph, seed } = scene.queue.shift()
					say(ph, seed, scene, HEAR[ph.mood])
					if (!scene.queue.length) scene.next = now + SCENE_EVERY[0] + Math.random() * (SCENE_EVERY[1] - SCENE_EVERY[0])
				}
			}
		}

		if (now >= tickAt) {
			tickAt = now + TICK
			for (const scene of scenes) {
				if (scene.queue.length || near(scene) > scene.hear * 0.8) continue
				if (scene.next < 0) scene.next = now + Math.random() * 12
				if (now < scene.next) continue
				scene.next = now + 10 + Math.random() * 20
				if (Math.random() < 0.65) plan(scene, now)
			}
			if (now >= passAt) {
				for (const p of people) {
					if (!p.track || p.dodge || p.flee || near(p) > HEAR.snippet || now - (spoke.get(p) ?? -Infinity) < 40) continue
					const phone = p.pause > 0 && !p.track.edge
					if (Math.random() > (phone ? 0.5 : 0.3)) continue
					spoke.set(p, now)
					passAt = now + 3 + Math.random() * 5
					const mood = phone ? 'calm' : 'snippet'
					say(phrase(voiceOf(p.seed ?? 0.5).lang, Math.random, mood), p.seed ?? 0.5, p, HEAR[mood])
					break
				}
			}
		}

		for (let i = voices.length - 1; i >= 0; i--) {
			const v = voices[i]
			if (now > v.until) {
				voices.splice(i, 1)
				continue
			}
			const d = near(v.at)
			const fall = Math.max(0, 1 - d / v.hear)
			if (now - v.looked > TICK) {
				v.looked = now
				v.walled = inside ? 0.8 : muffling(world, v.at, player)
			}
			const set = (param, value, time = 0.08) => Number.isFinite(value) && param.setTargetAtTime(value, now, time)
			set(v.level.gain, LEVEL * v.loud * fall * fall)
			set(v.tone.frequency, 4500 * (1 - 0.5 * (d / v.hear)) * (1 - 0.85 * v.walled))
			set(v.pan.pan, Math.max(-1, Math.min(1, ((v.at.x - view.x0) / (view.x1 - view.x0)) * 2 - 1)))
		}
	}

	// Someone yelling at a car that nearly had them.
	function shout(p) {
		const seed = p.seed ?? 0.5
		say(phrase(voiceOf(seed).lang, Math.random, 'shout'), seed, p, HEAR.shout)
	}

	return { update, shout, voices: () => voices.length }
}
