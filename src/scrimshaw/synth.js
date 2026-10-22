// The Web Audio synth, started from Simon Willison's Scrimshaw Jukebox
// (https://tools.simonwillison.net/scrimshaw-jukebox, Apache License 2.0, see LICENSE here).
// Ours now: change it to whatever the game needs.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

/* --------------------------------------------------------------- helpers */
function G(S, v = 0) {
	const g = S.ctx.createGain()
	g.gain.value = v
	return g
}
function F(S, type, f, q = 0.7, gainDb) {
	const b = S.ctx.createBiquadFilter()
	b.type = type
	b.frequency.value = clamp(f, 10, S.nyq * 0.95)
	b.Q.value = q
	if (gainDb != null) b.gain.value = gainDb
	return b
}
function O(S, type, f, t, stop, p, ratio = 1, detune = 0) {
	const o = S.ctx.createOscillator()
	if (typeof type === 'string') o.type = type
	else o.setPeriodicWave(type)
	const ff = clamp(f * ratio, 1, S.nyq * 0.98)
	if (p && p.from) {
		o.frequency.setValueAtTime(clamp(p.from * ratio, 1, S.nyq * 0.98), t)
		o.frequency.exponentialRampToValueAtTime(ff, t + p.glide)
	} else o.frequency.setValueAtTime(ff, t)
	if (detune) o.detune.value = detune
	o.start(t)
	o.stop(stop)
	return o
}
// sustained envelope; returns time when the voice is silent
function adsr(param, t, d, { a = 0.01, dc = 0.1, s = 1, r = 0.1, peak = 1 }) {
	const tOn = t + a,
		tOff = Math.max(t + d, tOn + 0.003)
	param.setValueAtTime(0, t)
	param.linearRampToValueAtTime(peak, tOn)
	if (s < 1) param.setTargetAtTime(peak * s, tOn, Math.max(0.002, dc / 3))
	param.setTargetAtTime(0, tOff, Math.max(0.002, r / 4))
	return tOff + r * 1.8 + 0.03
}
// struck envelope; optional damping time
function perc(param, t, { a = 0.002, tau = 0.3, peak = 1, damp = null, dampTau = 0.06 }) {
	param.setValueAtTime(0, t)
	param.linearRampToValueAtTime(peak, t + a)
	param.setTargetAtTime(0, t + a, Math.max(0.002, tau))
	let end = t + a + tau * 7
	if (damp != null && damp + dampTau * 7 < end) {
		const td = Math.max(damp, t + a + 0.002)
		param.setTargetAtTime(0, td, dampTau)
		end = td + dampTau * 7
	}
	return end
}
function partial(S, out, t, f, opt) {
	if (f >= S.nyq * 0.9) return
	const g = G(S)
	g.connect(out)
	const end = perc(g.gain, t, opt)
	const o = O(S, opt.type || 'sine', f, t, end)
	if (opt.bend) {
		o.frequency.setValueAtTime(f * opt.bend, t)
		o.frequency.setTargetAtTime(f, t, opt.bendTau || 0.02)
	}
	o.connect(g)
	return end
}
function noise(S, out, t, { type = 'bandpass', f = 2000, q = 1, a = 0.001, tau = 0.01, peak = 0.1 }) {
	const src = S.ctx.createBufferSource()
	src.buffer = S.noise
	src.loop = true
	const fl = F(S, type, f, q)
	const g = G(S)
	g.gain.setValueAtTime(0, t)
	g.gain.linearRampToValueAtTime(peak, t + a)
	g.gain.setTargetAtTime(0, t + a, Math.max(0.001, tau))
	src.connect(fl).connect(g).connect(out)
	src.start(t, Math.random() * (S.noise.duration - 0.5))
	src.stop(t + a + tau * 7 + 0.01)
	return { src, fl, g }
}
function noiseSrc(S, t, stop) {
	const src = S.ctx.createBufferSource()
	src.buffer = S.noise
	src.loop = true
	src.start(t, Math.random() * (S.noise.duration - 0.5))
	src.stop(stop)
	return src
}
function vibrato(S, t, stop, targets, { rate = 5, depth = 10, delay = 0.2, rise = 0.3 }) {
	const lfo = S.ctx.createOscillator()
	lfo.frequency.value = rate * (0.94 + Math.random() * 0.12)
	const g = G(S)
	g.gain.setValueAtTime(0, t)
	g.gain.setValueAtTime(0, t + delay)
	g.gain.linearRampToValueAtTime(depth, t + delay + rise)
	lfo.connect(g)
	targets.forEach((o) => g.connect(o.detune))
	lfo.start(t)
	lfo.stop(stop)
}
function metal(S, out, t, stop, mult = 1) {
	const sum = G(S, 0.16)
	sum.connect(out)
	for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) O(S, 'square', f * mult, t, stop).connect(sum)
	return sum
}

/* -------------------------------------------------------------- waveforms */
const WAVES = {
	organ: [1, 0.8, 0.5, 0.42, 0, 0.25, 0, 0.2],
	pipe: [1, 0.55, 0.32, 0.4, 0.08, 0.18, 0, 0.2, 0, 0.07, 0, 0.06],
	clarinet: [1, 0.05, 0.72, 0.04, 0.45, 0.02, 0.26, 0, 0.12, 0, 0.06],
	oboe: [0.5, 1, 0.85, 0.5, 0.36, 0.22, 0.15, 0.1, 0.06],
	bassoon: [0.45, 1, 0.78, 0.56, 0.42, 0.3, 0.22, 0.14, 0.1, 0.06],
	reed: [1, 0.55, 0.45, 0.32, 0.3, 0.22, 0.18, 0.13, 0.11, 0.08, 0.06, 0.05],
	horn: [1, 0.5, 0.3, 0.18, 0.1, 0.05],
}
function wave(S, name) {
	if (!S.waves[name]) {
		const h = WAVES[name],
			n = h.length + 1
		const re = new Float32Array(n),
			im = new Float32Array(n)
		h.forEach((a, i) => {
			im[i + 1] = a
		})
		S.waves[name] = S.ctx.createPeriodicWave(re, im)
	}
	return S.waves[name]
}

/* -------------------------------------------- plucked strings (Karplus-Strong) */
function ks(S, f, cfg) {
	const sr = S.ctx.sampleRate
	const N = Math.max(2, Math.floor(sr / f - cfg.b))
	const key = cfg.id + ':' + N
	let e = S.ks[key]
	if (!e) {
		const len = Math.floor(sr * cfg.dur)
		const buf = S.ctx.createBuffer(1, len, sr)
		const y = buf.getChannelData(0)
		let lp = 0,
			mean = 0
		for (let i = 0; i < N; i++) {
			lp += (1 - cfg.color) * (Math.random() * 2 - 1 - lp)
			y[i] = lp
			mean += lp
		}
		mean /= N
		let pk = 1e-6
		for (let i = 0; i < N; i++) {
			y[i] -= mean
			pk = Math.max(pk, Math.abs(y[i]))
		}
		for (let i = 0; i < N; i++) y[i] /= pk
		const b = cfg.b,
			dk = cfg.decay
		for (let i = N; i < len; i++) y[i] = dk * ((1 - b) * y[i - N] + b * (i - N - 1 >= 0 ? y[i - N - 1] : 0))
		const fade = Math.floor(len * 0.25)
		for (let i = 0; i < fade; i++) {
			const k = i / fade
			y[len - fade + i] *= (1 - k) * (1 - k)
		}
		e = S.ks[key] = { buf, f0: sr / (N + b) }
	}
	return e
}
function pluck(S, out, t, d, f, v, cfg, chain) {
	const e = ks(S, f, cfg)
	const src = S.ctx.createBufferSource()
	src.buffer = e.buf
	const rate = f / e.f0
	src.playbackRate.value = rate
	const g = G(S)
	const end = perc(g.gain, t, { a: 0.001, tau: 50, peak: v, damp: t + d + cfg.hang, dampTau: cfg.dampTau })
	let node = src
	for (const n of chain) {
		node.connect(n)
		node = n
	}
	node.connect(g).connect(out)
	src.start(t)
	src.stop(Math.min(end, t + e.buf.duration / rate))
}

const PLUCK = {
	harp: { id: 'harp', b: 0.45, decay: 0.9985, color: 0.55, dur: 2.8, hang: 1.4, dampTau: 0.25 },
	guitar: { id: 'gtr', b: 0.38, decay: 0.997, color: 0.4, dur: 1.9, hang: 0.2, dampTau: 0.06 },
	banjo: { id: 'banjo', b: 0.18, decay: 0.988, color: 0.05, dur: 1.1, hang: 0.1, dampTau: 0.05 },
	harpsichord: { id: 'hpsi', b: 0.14, decay: 0.994, color: 0, dur: 1.6, hang: 0.12, dampTau: 0.05 },
	pizz: { id: 'pizz', b: 0.5, decay: 0.982, color: 0.6, dur: 0.8, hang: 0.15, dampTau: 0.05 },
	upright: { id: 'upr', b: 0.5, decay: 0.996, color: 0.7, dur: 1.7, hang: 0.04, dampTau: 0.07 },
}

/* ------------------------------------------------------------ instruments */
// play(S, out, t, dur, freq, vel, p) ; p = {from, glide, bright, att, rel}
const INST = {
	steeldrum: {
		rev: 0.22,
		level: 0.66,
		play(S, out, t, d, f, v, p) {
			const tau = clamp(0.5 * Math.pow(440 / f, 0.45), 0.15, 1.1)
			const lp = F(S, 'lowpass', 5200 * p.bright, 0.5)
			lp.connect(out)
			const damp = t + d + 0.9
			;[
				[1, 1, 1, 0.002],
				[1.0035, 0.32, 1.1, 0.002],
				[2, 0.52, 0.55, 0.016],
				[3, 0.17, 0.32, 0.004],
				[4.07, 0.06, 0.18, 0.002],
			].forEach(([r, a, tm, at]) => partial(S, lp, t, f * r, { a: at, tau: tau * tm, peak: v * a * 0.5, damp }))
			noise(S, lp, t, { f: 2600, q: 0.8, tau: 0.006, peak: v * 0.05 })
		},
	},
	marimba: {
		rev: 0.18,
		level: 0.5,
		play(S, out, t, d, f, v, p) {
			const tau = clamp(0.26 * Math.sqrt(330 / f), 0.08, 0.6)
			partial(S, out, t, f, { a: 0.002, tau, peak: v * 0.8 })
			partial(S, out, t, f * 3.98, { a: 0.001, tau: tau * 0.18, peak: v * 0.22 * p.bright })
			partial(S, out, t, f * 9.9, { a: 0.001, tau: tau * 0.05, peak: v * 0.05 * p.bright })
			noise(S, out, t, { f: f * 2.5, q: 1.2, tau: 0.004, peak: v * 0.06 })
		},
	},
	vibes: {
		rev: 0.35,
		level: 0.4,
		play(S, out, t, d, f, v, p) {
			const trem = G(S, 0.82)
			trem.connect(out)
			const tau = clamp(1.1 * Math.pow(440 / f, 0.3), 0.4, 1.8)
			const end = t + Math.min(tau * 7, d + 2.2)
			const lfo = S.ctx.createOscillator()
			lfo.frequency.value = 5.2
			const lg = G(S, 0.18)
			lfo.connect(lg).connect(trem.gain)
			lfo.start(t)
			lfo.stop(end)
			partial(S, trem, t, f, { a: 0.002, tau, peak: v * 0.7, damp: t + d + 1.2, dampTau: 0.2 })
			partial(S, trem, t, f * 4, { a: 0.001, tau: 0.18, peak: v * 0.14 * p.bright })
			noise(S, trem, t, { f: f * 3, q: 1, tau: 0.004, peak: v * 0.03 })
		},
	},
	celesta: {
		rev: 0.35,
		level: 0.63,
		play(S, out, t, d, f, v, p) {
			const tau = clamp(0.55 * Math.pow(440 / f, 0.3), 0.2, 0.9)
			partial(S, out, t, f, { a: 0.002, tau, peak: v * 0.7 })
			partial(S, out, t, f * 2, { a: 0.001, tau: tau * 0.4, peak: v * 0.14 })
			partial(S, out, t, f * 4.02, { a: 0.001, tau: tau * 0.12, peak: v * 0.1 * p.bright })
			noise(S, out, t, { f: 5000, q: 1, tau: 0.003, peak: v * 0.04 })
		},
	},
	glock: {
		rev: 0.35,
		level: 0.53,
		play(S, out, t, d, f, v, p) {
			partial(S, out, t, f, { a: 0.001, tau: 0.7, peak: v * 0.6 })
			partial(S, out, t, f * 2.76, { a: 0.001, tau: 0.22, peak: v * 0.25 * p.bright })
			partial(S, out, t, f * 5.4, { a: 0.001, tau: 0.07, peak: v * 0.14 * p.bright })
			partial(S, out, t, f * 8.93, { a: 0.001, tau: 0.03, peak: v * 0.06 * p.bright })
		},
	},
	xylophone: {
		rev: 0.2,
		level: 0.72,
		play(S, out, t, d, f, v, p) {
			const tau = clamp(0.13 * Math.sqrt(440 / f), 0.05, 0.25)
			partial(S, out, t, f, { a: 0.001, tau, peak: v * 0.75 })
			partial(S, out, t, f * 3, { a: 0.001, tau: tau * 0.4, peak: v * 0.35 * p.bright })
			partial(S, out, t, f * 6, { a: 0.001, tau: tau * 0.15, peak: v * 0.1 * p.bright })
			noise(S, out, t, { f: 4000, q: 1, tau: 0.004, peak: v * 0.1 })
		},
	},
	musicbox: {
		rev: 0.4,
		level: 0.64,
		play(S, out, t, d, f, v, p) {
			partial(S, out, t, f, { a: 0.001, tau: 0.5, peak: v * 0.7 })
			partial(S, out, t, f * 3, { a: 0.001, tau: 0.12, peak: v * 0.12 })
			partial(S, out, t, f * 5.2, { a: 0.001, tau: 0.05, peak: v * 0.06 * p.bright })
			noise(S, out, t, { f: 7000, q: 2, tau: 0.002, peak: v * 0.05 })
		},
	},
	bell: {
		rev: 0.45,
		level: 0.71,
		play(S, out, t, d, f, v, p) {
			const damp = t + d + 3
			;[
				[0.5, 0.35, 3.5],
				[1, 1, 2.4],
				[1.19, 0.55, 1.7],
				[1.5, 0.38, 1.4],
				[2, 0.45, 1.1],
				[2.52, 0.22, 0.8],
				[3.01, 0.16, 0.55],
				[4.1, 0.08, 0.35],
			].forEach(([r, a, tau]) => partial(S, out, t, f * r, { a: 0.002, tau, peak: v * a * 0.35, damp, dampTau: 0.4 }))
			noise(S, out, t, { f: f * 4, q: 1, tau: 0.01, peak: v * 0.05 })
		},
	},
	organ: {
		rev: 0.15,
		level: 0.98,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', 5500 * p.bright, 0.5)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.005, r: p.rel || 0.06, peak: v * 0.5 })
			const o = O(S, wave(S, 'organ'), f, t, end, p)
			o.connect(lp)
			vibrato(S, t, end, [o], { rate: 6.3, depth: 5, delay: 0, rise: 0.05 })
			noise(S, out, t, { type: 'lowpass', f: 2500, q: 0.5, tau: 0.002, peak: v * 0.1 })
		},
	},
	pipe: {
		rev: 0.55,
		level: 1.01,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', 4200 * p.bright, 0.5)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.06, r: p.rel || 0.28, peak: v * 0.38 })
			O(S, wave(S, 'pipe'), f, t, end, p).connect(lp)
			const sub = G(S, 0.45)
			sub.connect(lp)
			O(S, 'sine', f, t, end, p, 0.5).connect(sub)
			noise(S, out, t, { f: f * 3, q: 2, a: 0.01, tau: 0.02, peak: v * 0.04 })
		},
	},
	strings: {
		rev: 0.4,
		level: 3.18,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', Math.min(9000, (1300 + f * 2.6) * p.bright), 0.6)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.16, dc: 0.3, s: 0.9, r: p.rel || 0.38, peak: v * 0.5 })
			const os = [-8, 0, 8].map((c) => {
				const o = O(S, 'sawtooth', f, t, end, p, 1, c)
				const og = G(S, 0.22)
				o.connect(og).connect(lp)
				return o
			})
			vibrato(S, t, end, os, { rate: 5.3, depth: 7, delay: 0.15, rise: 0.4 })
		},
	},
	pad: {
		rev: 0.5,
		level: 2.18,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', (600 + f * 1.4) * p.bright, 0.9)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.5, r: p.rel || 1.0, peak: v * 0.45 })
			;[-12, 0, 11].forEach((c) => {
				const og = G(S, 0.24)
				O(S, 'sawtooth', f, t, end, p, 1, c).connect(og).connect(lp)
			})
		},
	},
	choir: {
		rev: 0.5,
		level: 2.02,
		play(S, out, t, d, f, v, p) {
			choirVoice(S, out, t, d, f, v, p, [
				[730, 7, 1],
				[1090, 8, 0.55],
				[2440, 10, 0.25],
			])
		},
	},
	voices: {
		rev: 0.5,
		level: 2.01,
		play(S, out, t, d, f, v, p) {
			choirVoice(S, out, t, d, f, v, p, [
				[380, 6, 1],
				[820, 8, 0.35],
				[2500, 10, 0.1],
			])
		},
	},
	brass: {
		rev: 0.25,
		level: 0.83,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', f, 1.3)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.03, dc: 0.2, s: 0.85, r: p.rel || 0.12, peak: v * 0.42 })
			const pk = Math.min(11000, (f * 5 + 700) * p.bright * (0.55 + 0.45 * v))
			lp.frequency.setValueAtTime(f * 1.1, t)
			lp.frequency.linearRampToValueAtTime(pk, t + 0.06)
			lp.frequency.setTargetAtTime(f * 1.2 + (pk - f) * 0.5, t + 0.06, 0.2)
			const os = [-5, 5].map((c) => {
				const o = O(S, 'sawtooth', f, t, end, p, 1, c)
				o.connect(lp)
				return o
			})
			vibrato(S, t, end, os, { rate: 5.2, depth: 6, delay: 0.35, rise: 0.3 })
		},
	},
	trumpet: {
		rev: 0.25,
		level: 1.17,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', f, 1.6)
			const pk2 = F(S, 'peaking', 1400, 1, 5)
			lp.connect(pk2).connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.02, dc: 0.15, s: 0.8, r: p.rel || 0.09, peak: v * 0.4 })
			const pk = Math.min(12000, (f * 7 + 900) * p.bright * (0.5 + 0.5 * v))
			lp.frequency.setValueAtTime(f * 1.5, t)
			lp.frequency.linearRampToValueAtTime(pk, t + 0.04)
			lp.frequency.setTargetAtTime(f * 2 + (pk - f) * 0.45, t + 0.04, 0.15)
			const o = O(S, 'sawtooth', f, t, end, p)
			o.connect(lp)
			vibrato(S, t, end, [o], { rate: 5.6, depth: 11, delay: 0.25, rise: 0.25 })
		},
	},
	horn: {
		rev: 0.4,
		level: 0.7,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', f * 2, 0.8)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.06, dc: 0.3, s: 0.9, r: p.rel || 0.2, peak: v * 0.5 })
			lp.frequency.setValueAtTime(f * 1.2, t)
			lp.frequency.linearRampToValueAtTime(Math.min(6000, (f * 3 + 300) * p.bright), t + 0.08)
			const o1 = O(S, 'sawtooth', f, t, end, p)
			const g1 = G(S, 0.5)
			o1.connect(g1).connect(lp)
			const o2 = O(S, wave(S, 'horn'), f, t, end, p, 1, 4)
			o2.connect(lp)
			vibrato(S, t, end, [o1, o2], { rate: 4.8, depth: 5, delay: 0.4, rise: 0.4 })
		},
	},
	tuba: {
		rev: 0.2,
		level: 0.7,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', (f * 3 + 150) * p.bright, 1.0)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.035, dc: 0.2, s: 0.8, r: p.rel || 0.1, peak: v * 0.55 })
			O(S, 'sawtooth', f, t, end, p).connect(lp)
			const sg = G(S, 0.5)
			O(S, 'sine', f, t, end, p).connect(sg).connect(lp)
		},
	},
	flute: {
		rev: 0.38,
		level: 1.0,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			g.connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.055, dc: 0.15, s: 0.85, r: p.rel || 0.09, peak: v * 0.48 })
			const o1 = O(S, 'sine', f, t, end, p)
			const g1 = G(S, 0.75)
			o1.connect(g1).connect(g)
			const o2 = O(S, 'triangle', f, t, end, p)
			const g2 = G(S, 0.22 * p.bright)
			o2.connect(g2).connect(g)
			const o3 = O(S, 'sine', f, t, end, p, 2)
			const g3 = G(S, 0.07)
			o3.connect(g3).connect(g)
			vibrato(S, t, end, [o1, o2, o3], { rate: 5, depth: 13, delay: 0.22, rise: 0.35 })
			// breath
			const n = noiseSrc(S, t, end)
			const hp = F(S, 'bandpass', Math.min(f * 2.2, 9000), 0.7)
			const ng = G(S)
			ng.gain.setValueAtTime(0, t)
			ng.gain.linearRampToValueAtTime(v * 0.05, t + 0.03)
			ng.gain.setTargetAtTime(v * 0.012, t + 0.03, 0.06)
			ng.gain.setTargetAtTime(0, Math.max(t + d, t + 0.04), 0.03)
			n.connect(hp).connect(ng).connect(out)
		},
	},
	clarinet: {
		rev: 0.3,
		level: 1.16,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', Math.min(9000, 3000 * p.bright), 0.6)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.035, dc: 0.2, s: 0.9, r: p.rel || 0.08, peak: v * 0.42 })
			const o = O(S, wave(S, 'clarinet'), f, t, end, p)
			o.connect(lp)
			vibrato(S, t, end, [o], { rate: 4.6, depth: 5, delay: 0.4, rise: 0.4 })
			noise(S, out, t, { f: f * 3, q: 1, a: 0.01, tau: 0.02, peak: v * 0.02 })
		},
	},
	oboe: {
		rev: 0.3,
		level: 1.98,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', Math.min(9000, 3800 * p.bright), 0.6)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.03, dc: 0.2, s: 0.9, r: p.rel || 0.08, peak: v * 0.36 })
			const o = O(S, wave(S, 'oboe'), f, t, end, p)
			o.connect(lp)
			vibrato(S, t, end, [o], { rate: 5.5, depth: 8, delay: 0.25, rise: 0.3 })
		},
	},
	bassoon: {
		rev: 0.25,
		level: 1.72,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', Math.min(6000, 1700 * p.bright), 0.7)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.04, dc: 0.2, s: 0.85, r: p.rel || 0.08, peak: v * 0.45 })
			const o = O(S, wave(S, 'bassoon'), f, t, end, p)
			o.connect(lp)
			vibrato(S, t, end, [o], { rate: 5, depth: 5, delay: 0.35, rise: 0.3 })
		},
	},
	accordion: {
		rev: 0.22,
		level: 2.06,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', Math.min(9000, (2600 + f) * p.bright), 0.7)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.025, dc: 0.2, s: 0.92, r: p.rel || 0.07, peak: v * 0.4 })
			;[0, 15, -13].forEach((c, i) => {
				const og = G(S, i ? 0.28 : 0.36)
				O(S, wave(S, 'reed'), f, t, end, p, 1, c).connect(og).connect(lp)
			})
		},
	},
	fiddle: {
		rev: 0.3,
		level: 0.93,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const body = F(S, 'peaking', 2800, 1.2, 6)
			const body2 = F(S, 'peaking', 480, 1.5, 4)
			const lp = F(S, 'lowpass', 6500 * p.bright, 0.6)
			body.connect(body2).connect(lp).connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.06, dc: 0.2, s: 0.9, r: p.rel || 0.14, peak: v * 0.3 })
			const os = [-4, 4].map((c) => {
				const o = O(S, 'sawtooth', f, t, end, p, 1, c)
				o.connect(body)
				return o
			})
			vibrato(S, t, end, os, { rate: 5.8, depth: 14, delay: 0.18, rise: 0.25 })
			noise(S, out, t, { type: 'highpass', f: 3000, q: 0.5, a: 0.01, tau: 0.03, peak: v * 0.03 })
		},
	},
	harp: {
		rev: 0.45,
		level: 1.07,
		play(S, out, t, d, f, v, p) {
			pluck(S, out, t, d, f, v * 0.55, PLUCK.harp, [F(S, 'lowpass', 3500 * p.bright, 0.5)])
			partial(S, out, t, f, { a: 0.003, tau: 0.9, peak: v * 0.12 })
		},
	},
	guitar: {
		rev: 0.25,
		level: 1.53,
		play(S, out, t, d, f, v, p) {
			pluck(S, out, t, d, f, v * 0.55, PLUCK.guitar, [F(S, 'lowpass', 4200 * p.bright, 0.5), F(S, 'peaking', 220, 1, 3)])
		},
	},
	banjo: {
		rev: 0.18,
		level: 1.18,
		play(S, out, t, d, f, v, p) {
			pluck(S, out, t, d, f, v * 0.5, PLUCK.banjo, [F(S, 'highpass', 250, 0.5), F(S, 'peaking', 2500, 1.5, 5)])
		},
	},
	harpsichord: {
		rev: 0.3,
		level: 1.74,
		play(S, out, t, d, f, v, p) {
			const hp = F(S, 'highpass', 180, 0.5)
			pluck(S, out, t, d, f, v * 0.42, PLUCK.harpsichord, [hp])
			pluck(S, out, t, d, f * 2, v * 0.16 * p.bright, PLUCK.harpsichord, [F(S, 'highpass', 400, 0.5)])
		},
	},
	pizz: {
		rev: 0.35,
		level: 1.21,
		play(S, out, t, d, f, v, p) {
			pluck(S, out, t, d, f, v * 0.6, PLUCK.pizz, [F(S, 'lowpass', 2400 * p.bright, 0.6)])
			partial(S, out, t, f, { a: 0.002, tau: 0.12, peak: v * 0.18 })
		},
	},
	upright: {
		rev: 0.15,
		level: 0.72,
		play(S, out, t, d, f, v, p) {
			pluck(S, out, t, d, f, v * 0.5, PLUCK.upright, [F(S, 'lowpass', 1400 * p.bright, 0.6)])
			partial(S, out, t, f, { a: 0.004, tau: 0.5, peak: v * 0.45, damp: t + d + 0.04, dampTau: 0.07 })
			noise(S, out, t, { type: 'lowpass', f: 900, q: 0.5, tau: 0.01, peak: v * 0.12 })
		},
	},
	fretless: {
		rev: 0.12,
		level: 0.69,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', 300, 3.2)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.012, dc: 0.6, s: 0.72, r: p.rel || 0.08, peak: v * 0.6 })
			const top = Math.min(4000, (f * 4.5 + 250) * p.bright)
			lp.frequency.setValueAtTime(f * 1.2 + 80, t)
			lp.frequency.linearRampToValueAtTime(top, t + 0.07)
			lp.frequency.setTargetAtTime(f * 2.2 + 150, t + 0.07, 0.25)
			const o1 = O(S, 'sawtooth', f, t, end, p)
			const g1 = G(S, 0.38)
			o1.connect(g1).connect(lp)
			const o2 = O(S, 'sine', f, t, end, p)
			const g2 = G(S, 0.75)
			o2.connect(g2).connect(lp)
			vibrato(S, t, end, [o1, o2], { rate: 4.5, depth: 6, delay: 0.3, rise: 0.4 })
		},
	},
	synbass: {
		rev: 0.08,
		level: 0.76,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', 300, 5)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.003, dc: 0.35, s: 0.55, r: p.rel || 0.06, peak: v * 0.5 })
			lp.frequency.setValueAtTime(Math.min(5000, 2600 * p.bright * v), t)
			lp.frequency.setTargetAtTime(f * 2 + 80, t, 0.07)
			O(S, 'sawtooth', f, t, end, p).connect(lp)
			const sq = G(S, 0.5)
			O(S, 'square', f, t, end, p, 1, -6).connect(sq).connect(lp)
		},
	},
	timpani: {
		rev: 0.45,
		level: 0.53,
		play(S, out, t, d, f, v, p) {
			const damp = t + Math.max(d, 0.15) + 0.5
			partial(S, out, t, f, { a: 0.004, tau: 0.55, peak: v * 0.85, bend: 1.035, bendTau: 0.05, damp, dampTau: 0.15 })
			partial(S, out, t, f * 1.505, { a: 0.003, tau: 0.35, peak: v * 0.32, damp, dampTau: 0.15 })
			partial(S, out, t, f * 1.99, { a: 0.003, tau: 0.25, peak: v * 0.2, damp, dampTau: 0.15 })
			partial(S, out, t, f * 2.44, { a: 0.002, tau: 0.15, peak: v * 0.1 })
			noise(S, out, t, { type: 'lowpass', f: 500, q: 0.7, tau: 0.03, peak: v * 0.5 })
		},
	},
	chip: {
		rev: 0.15,
		level: 1.17,
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', 6000 * p.bright, 0.5)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.003, dc: 0.1, s: 0.8, r: p.rel || 0.04, peak: v * 0.3 })
			const o = O(S, 'square', f, t, end, p)
			o.connect(lp)
			vibrato(S, t, end, [o], { rate: 6, depth: 12, delay: 0.25, rise: 0.1 })
		},
	},
}
;['sine', 'square', 'saw', 'triangle'].forEach((w) => {
	INST[w] = {
		rev: 0.2,
		level: { sine: 0.94, triangle: 1.15, square: 0.78, saw: 1.35 }[w],
		play(S, out, t, d, f, v, p) {
			const g = G(S)
			const lp = F(S, 'lowpass', 8000 * p.bright, 0.5)
			lp.connect(g).connect(out)
			const end = adsr(g.gain, t, d, { a: p.att || 0.008, dc: 0.2, s: 0.85, r: p.rel || 0.08, peak: v * 0.4 })
			O(S, w === 'saw' ? 'sawtooth' : w, f, t, end, p).connect(lp)
		},
	}
})

function choirVoice(S, out, t, d, f, v, p, formants) {
	const g = G(S)
	g.connect(out)
	const end = adsr(g.gain, t, d, { a: p.att || 0.28, dc: 0.3, s: 0.95, r: p.rel || 0.6, peak: v * 1.6 })
	const src = G(S, 1)
	const os = [-7, 6].map((c) => {
		const o = O(S, 'sawtooth', f, t, end, p, 1, c)
		const og = G(S, 0.5)
		o.connect(og).connect(src)
		return o
	})
	vibrato(S, t, end, os, { rate: 5.1, depth: 12, delay: 0.2, rise: 0.5 })
	for (const [ff, q, a] of formants) {
		const bp = F(S, 'bandpass', ff * (p.bright > 1 ? 1.1 : 1), q)
		const fg = G(S, a)
		src.connect(bp).connect(fg).connect(g)
	}
	const n = noiseSrc(S, t, end)
	const nb = F(S, 'bandpass', formants[1][0], 2)
	const ng = G(S, v * 0.04)
	n.connect(nb).connect(ng).connect(g)
}

/* ----------------------------------------------------------------- drums */
const DRUM = {
	kick: {
		rev: 0.05,
		level: 0.95,
		hit(S, out, t, v) {
			const g = G(S)
			g.connect(out)
			const end = perc(g.gain, t, { a: 0.003, tau: 0.13, peak: v * 1.0 })
			const o = O(S, 'sine', 150, t, end)
			o.frequency.setValueAtTime(150, t)
			o.frequency.exponentialRampToValueAtTime(46, t + 0.11)
			o.connect(g)
			noise(S, out, t, { type: 'lowpass', f: 3000, q: 0.5, tau: 0.003, peak: v * 0.28 })
		},
	},
	snare: {
		rev: 0.25,
		level: 1.12,
		hit(S, out, t, v) {
			noise(S, out, t, { type: 'highpass', f: 1100, q: 0.5, tau: 0.055, peak: v * 0.6 })
			noise(S, out, t, { type: 'bandpass', f: 4500, q: 0.8, tau: 0.03, peak: v * 0.25 })
			partial(S, out, t, 185, { type: 'triangle', a: 0.001, tau: 0.035, peak: v * 0.5, bend: 1.25, bendTau: 0.02 })
		},
	},
	rim: {
		rev: 0.2,
		level: 1.66,
		hit(S, out, t, v) {
			partial(S, out, t, 1650, { a: 0.001, tau: 0.007, peak: v * 0.5 })
			partial(S, out, t, 520, { a: 0.001, tau: 0.016, peak: v * 0.4 })
			noise(S, out, t, { f: 3200, q: 2, tau: 0.008, peak: v * 0.55 })
		},
	},
	hat: {
		rev: 0.1,
		level: 0.79,
		hit(S, out, t, v) {
			cymbal(S, out, t, v, 0.02, 7500, 0.5)
		},
	},
	ohat: {
		rev: 0.15,
		level: 0.56,
		hit(S, out, t, v) {
			cymbal(S, out, t, v, 0.13, 7000, 0.45)
		},
	},
	ride: {
		rev: 0.25,
		level: 1.65,
		hit(S, out, t, v) {
			const g = G(S)
			const bp = F(S, 'bandpass', 5500, 0.8)
			bp.connect(g).connect(out)
			const end = perc(g.gain, t, { a: 0.001, tau: 0.38, peak: v * 0.5 })
			metal(S, bp, t, end, 1.5)
			noise(S, out, t, { type: 'highpass', f: 8000, q: 0.5, tau: 0.2, peak: v * 0.07 })
		},
	},
	crash: {
		rev: 0.3,
		level: 0.75,
		hit(S, out, t, v) {
			noise(S, out, t, { type: 'highpass', f: 3500, q: 0.5, a: 0.002, tau: 0.55, peak: v * 0.4 })
			const g = G(S)
			const bp = F(S, 'bandpass', 4500, 0.7)
			bp.connect(g).connect(out)
			const end = perc(g.gain, t, { a: 0.002, tau: 0.45, peak: v * 0.35 })
			metal(S, bp, t, end, 1.1)
		},
	},
	shaker: {
		rev: 0.1,
		level: 1.21,
		hit(S, out, t, v) {
			noise(S, out, t, { f: 6500, q: 1.4, a: 0.012, tau: 0.025, peak: v * 0.55 })
		},
	},
	tamb: {
		rev: 0.15,
		level: 0.76,
		hit(S, out, t, v) {
			noise(S, out, t, { type: 'highpass', f: 6500, q: 0.7, a: 0.002, tau: 0.05, peak: v * 0.45 })
			noise(S, out, t + 0.013, { f: 9000, q: 2, a: 0.001, tau: 0.06, peak: v * 0.25 })
		},
	},
	conga: {
		rev: 0.18,
		level: 0.84,
		hit(S, out, t, v) {
			hand(S, out, t, v, 340, 0.11)
		},
	},
	tumba: {
		rev: 0.18,
		level: 0.76,
		hit(S, out, t, v) {
			hand(S, out, t, v, 235, 0.15)
		},
	},
	bongo: {
		rev: 0.15,
		level: 0.91,
		hit(S, out, t, v) {
			hand(S, out, t, v, 520, 0.055)
		},
	},
	bongolo: {
		rev: 0.15,
		level: 0.82,
		hit(S, out, t, v) {
			hand(S, out, t, v, 395, 0.07)
		},
	},
	clave: {
		rev: 0.25,
		level: 0.83,
		hit(S, out, t, v) {
			partial(S, out, t, 2450, { a: 0.001, tau: 0.022, peak: v * 0.6 })
			noise(S, out, t, { f: 2450, q: 8, tau: 0.01, peak: v * 0.2 })
		},
	},
	block: {
		rev: 0.25,
		level: 0.98,
		hit(S, out, t, v) {
			partial(S, out, t, 880, { a: 0.001, tau: 0.028, peak: v * 0.6 })
			partial(S, out, t, 1460, { a: 0.001, tau: 0.014, peak: v * 0.25 })
			noise(S, out, t, { f: 900, q: 6, tau: 0.015, peak: v * 0.25 })
		},
	},
	cowbell: {
		rev: 0.2,
		level: 0.54,
		hit(S, out, t, v) {
			const g = G(S)
			const bp = F(S, 'bandpass', 820, 1.6)
			bp.connect(g).connect(out)
			const end = perc(g.gain, t, { a: 0.001, tau: 0.085, peak: v * 0.7 })
			O(S, 'square', 545, t, end).connect(bp)
			O(S, 'square', 815, t, end).connect(bp)
		},
	},
	guiro: {
		rev: 0.15,
		level: 3.85,
		hit(S, out, t, v) {
			for (let i = 0; i < 10; i++) noise(S, out, t + i * 0.016, { f: 2900, q: 2, tau: 0.004, peak: v * 0.32 * (0.55 + (0.45 * i) / 9) })
		},
	},
	tomlo: {
		rev: 0.25,
		level: 0.74,
		hit(S, out, t, v) {
			tom(S, out, t, v, 92)
		},
	},
	tommid: {
		rev: 0.25,
		level: 0.79,
		hit(S, out, t, v) {
			tom(S, out, t, v, 132)
		},
	},
	tomhi: {
		rev: 0.25,
		level: 0.83,
		hit(S, out, t, v) {
			tom(S, out, t, v, 182)
		},
	},
	bodhran: {
		rev: 0.2,
		level: 0.76,
		hit(S, out, t, v) {
			partial(S, out, t, 78, { a: 0.003, tau: 0.13, peak: v * 0.9, bend: 1.5, bendTau: 0.02 })
			partial(S, out, t, 128, { a: 0.002, tau: 0.05, peak: v * 0.25 })
			noise(S, out, t, { f: 420, q: 1, tau: 0.025, peak: v * 0.4 })
		},
	},
	timbale: {
		rev: 0.25,
		level: 0.74,
		hit(S, out, t, v) {
			partial(S, out, t, 430, { a: 0.001, tau: 0.2, peak: v * 0.5, bend: 1.08 })
			partial(S, out, t, 655, { a: 0.001, tau: 0.12, peak: v * 0.25 })
			noise(S, out, t, { type: 'highpass', f: 2000, q: 0.5, tau: 0.03, peak: v * 0.35 })
		},
	},
	tri: {
		rev: 0.4,
		level: 0.44,
		hit(S, out, t, v) {
			partial(S, out, t, 2650, { a: 0.001, tau: 0.7, peak: v * 0.22 })
			partial(S, out, t, 4140, { a: 0.001, tau: 0.4, peak: v * 0.1 })
			partial(S, out, t, 6320, { a: 0.001, tau: 0.22, peak: v * 0.07 })
		},
	},
	clap: {
		rev: 0.3,
		level: 3.57,
		hit(S, out, t, v) {
			;[0, 0.011, 0.022].forEach((o) => noise(S, out, t + o, { f: 1300, q: 1, tau: 0.006, peak: v * 0.5 }))
			noise(S, out, t + 0.03, { f: 1200, q: 0.8, tau: 0.07, peak: v * 0.4 })
		},
	},
	gong: {
		rev: 0.6,
		level: 0.46,
		hit(S, out, t, v) {
			;[
				[1, 1, 4],
				[1.48, 0.7, 3.2],
				[1.97, 0.6, 2.6],
				[2.34, 0.5, 2.2],
				[2.9, 0.35, 1.6],
				[3.6, 0.3, 1.3],
				[4.4, 0.2, 1],
			].forEach(([r, a, tau], i) => partial(S, out, t, 72 * r, { a: i ? 0.25 : 0.02, tau, peak: v * a * 0.4 }))
			noise(S, out, t, { type: 'lowpass', f: 2000, q: 0.5, tau: 0.4, peak: v * 0.12 })
		},
	},
	thunder: {
		rev: 0.5,
		level: 2.38,
		hit(S, out, t, v) {
			const n = noiseSrc(S, t, t + 9)
			const lp = F(S, 'lowpass', 220, 0.5)
			const g = G(S)
			g.gain.setValueAtTime(0, t)
			g.gain.linearRampToValueAtTime(v * 1.2, t + 0.35)
			g.gain.setTargetAtTime(v * 0.5, t + 0.35, 0.4)
			g.gain.setTargetAtTime(0, t + 1.6, 1.2)
			lp.frequency.setValueAtTime(600, t)
			lp.frequency.setTargetAtTime(160, t + 0.2, 0.8)
			n.connect(lp).connect(g).connect(out)
			noise(S, out, t + 0.05, { type: 'lowpass', f: 1400, q: 0.5, a: 0.01, tau: 0.2, peak: v * 0.35 })
		},
	},
	surf: {
		rev: 0.5,
		level: 1.42,
		hit(S, out, t, v) {
			const n = noiseSrc(S, t, t + 7)
			const lp = F(S, 'lowpass', 300, 0.4)
			const g = G(S)
			lp.frequency.setValueAtTime(300, t)
			lp.frequency.linearRampToValueAtTime(1500, t + 1.5)
			lp.frequency.linearRampToValueAtTime(450, t + 4.5)
			g.gain.setValueAtTime(0, t)
			g.gain.linearRampToValueAtTime(v * 0.55, t + 1.5)
			g.gain.setTargetAtTime(0, t + 1.6, 0.9)
			n.connect(lp).connect(g).connect(out)
		},
	},
}
function cymbal(S, out, t, v, tau, hpf, pk) {
	const g = G(S)
	const hp = F(S, 'highpass', hpf, 0.6)
	const pkf = F(S, 'peaking', 10000, 1, 4)
	hp.connect(pkf).connect(g).connect(out)
	const end = perc(g.gain, t, { a: 0.001, tau, peak: v * pk })
	const n = noiseSrc(S, t, end)
	n.connect(hp)
	metal(S, hp, t, end, 1.0)
}
function hand(S, out, t, v, f, tau) {
	const slap = v > 0.95
	partial(S, out, t, f, { a: 0.002, tau: slap ? tau * 0.6 : tau, peak: v * 0.8, bend: 1.12, bendTau: 0.012 })
	partial(S, out, t, f * 1.52, { a: 0.001, tau: tau * 0.3, peak: v * 0.15 })
	noise(S, out, t, { f: slap ? 2600 : 1600, q: 1, tau: slap ? 0.02 : 0.008, peak: v * (slap ? 0.5 : 0.18) })
}
function tom(S, out, t, v, f) {
	partial(S, out, t, f, { a: 0.002, tau: 0.2, peak: v * 0.85, bend: 1.55, bendTau: 0.025 })
	partial(S, out, t, f * 1.6, { a: 0.001, tau: 0.06, peak: v * 0.15 })
	noise(S, out, t, { type: 'lowpass', f: 1600, q: 0.5, tau: 0.02, peak: v * 0.2 })
}

/* ----------------------------------------------------------------- engine */
function makeIR(ctx, seconds, decayPow) {
	const sr = ctx.sampleRate,
		len = Math.floor(sr * seconds)
	const buf = ctx.createBuffer(2, len, sr)
	const pre = Math.floor(sr * 0.012)
	for (let ch = 0; ch < 2; ch++) {
		const y = buf.getChannelData(ch)
		let lp = 0
		for (let i = pre; i < len; i++) {
			const x = (i - pre) / (len - pre)
			const a = 0.9 - 0.75 * x // darker as it decays
			lp += a * (Math.random() * 2 - 1 - lp)
			y[i] = lp * Math.pow(1 - x, decayPow)
		}
		// a few early reflections
		for (const [ms, amp] of [
			[11, 0.6],
			[19, 0.4],
			[27, 0.32],
			[37, 0.22],
			[53, 0.15],
		]) {
			const k = Math.floor((sr * (ms + ch * 2.3)) / 1000)
			if (k < len) y[k] += amp * (Math.random() < 0.5 ? -1 : 1)
		}
	}
	return buf
}

function createSynth(ctx, dest, opts = {}) {
	const S = { ctx, nyq: ctx.sampleRate / 2, waves: {}, ks: {} }
	const nlen = ctx.sampleRate * 3
	S.noise = ctx.createBuffer(1, nlen, ctx.sampleRate)
	const nd = S.noise.getChannelData(0)
	for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1

	const master = G(S, 0.72)
	const lowShelf = F(S, 'lowshelf', 180, 0.7, 2)
	const highShelf = F(S, 'highshelf', 7500, 0.7, -2.5)
	const comp = ctx.createDynamicsCompressor()
	comp.threshold.value = -15
	comp.knee.value = 10
	comp.ratio.value = 3.2
	comp.attack.value = 0.006
	comp.release.value = 0.22
	const out = G(S, 1)
	const limiter = ctx.createDynamicsCompressor()
	limiter.threshold.value = -3
	limiter.knee.value = 0
	limiter.ratio.value = 20
	limiter.attack.value = 0.001
	limiter.release.value = 0.1
	if (opts.raw) {
		// measurement chain: rough K-weighting, no compression
		master
			.connect(F(S, 'highpass', 60, 0.7))
			.connect(F(S, 'highshelf', 1500, 0.7, 4))
			.connect(out)
			.connect(dest)
	} else master.connect(lowShelf).connect(highShelf).connect(comp).connect(limiter).connect(out).connect(dest)
	const analyser = ctx.createAnalyser()
	analyser.fftSize = 1024
	out.connect(analyser)

	const verb = ctx.createConvolver()
	verb.buffer = makeIR(ctx, 2.8, 3.4)
	const verbIn = F(S, 'highpass', 220, 0.6)
	const verbRet = G(S, 0.9)
	verbIn.connect(verb).connect(verbRet).connect(master)

	return {
		S,
		master,
		out,
		analyser,
		verbIn,
		verbRet,
		// a session bus lets "stop" silence everything already scheduled
		// build plucked-string buffers ahead of time, a few at a time
		warm(song, budgetMs = 12) {
			const todo = []
			song.voices.forEach((v, vi) => {
				const cfg = PLUCK[v.inst]
				if (!cfg) return
				const seen = new Set()
				for (const tl of [song.intro, song.loop])
					for (const e of tl.events)
						if (e.v === vi)
							for (const m of e.m) {
								if (seen.has(m)) continue
								seen.add(m)
								todo.push([mtof(m), cfg])
								if (v.inst === 'harpsichord') todo.push([mtof(m) * 2, cfg])
							}
			})
			let i = 0
			const step = () => {
				const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
				while (i < todo.length && (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 < budgetMs) {
					ks(S, todo[i][0], todo[i][1])
					i++
				}
				if (i < todo.length) setTimeout(step, 15)
			}
			step()
		},
		session(song, dry = master, wet = verbIn) {
			if (Object.keys(S.ks).length > 160) S.ks = {}
			const bus = G(S, 1)
			bus.connect(dry)
			const sendBus = G(S, 1)
			sendBus.connect(wet)
			verbRet.gain.setValueAtTime(0.25 + 1.6 * (song.reverb != null ? song.reverb : 0.3), ctx.currentTime)
			const ch = song.voices.map((v) => {
				const def = v.drum ? DRUM[v.inst] : INST[v.inst]
				const input = G(S, v.vol * def.level)
				const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
				if (pan) {
					pan.pan.value = v.pan
					input.connect(pan).connect(bus)
				} else input.connect(bus)
				const send = G(S, v.rev != null ? v.rev : def.rev)
				input.connect(send).connect(sendBus)
				return { v, def, input }
			})
			return {
				bus,
				sendBus,
				ch,
				play(ev, t) {
					const c = ch[ev.v]
					if (!c) return
					try {
						if (c.v.drum) {
							c.def.hit(S, c.input, t, ev.vel)
							return
						}
						const n = ev.m.length,
							vs = ev.vel / Math.sqrt(n)
						const p = { bright: c.v.bright, att: c.v.att, rel: c.v.rel, glide: c.v.glide, from: null }
						ev.m.forEach((m, i) => {
							p.from = ev.g != null && i === n - 1 ? mtof(ev.g) : null
							c.def.play(S, c.input, t, ev.d, mtof(m), vs, p)
						})
					} catch (e) {
						/* keep the music going if one note fails */
					}
				},
				stop(fade = 0.06) {
					const now = ctx.currentTime
					bus.gain.cancelScheduledValues(now)
					bus.gain.setTargetAtTime(0, now, fade)
					sendBus.gain.cancelScheduledValues(now)
					sendBus.gain.setTargetAtTime(0, now, fade)
					setTimeout(() => {
						try {
							bus.disconnect()
							sendBus.disconnect()
						} catch (e) {}
					}, 1500)
				},
			}
		},
	}
}

export { createSynth, INST, DRUM, mtof }
