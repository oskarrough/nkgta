// A scrolling piano roll of the song, after the score view in Simon Willison's
// Scrimshaw Jukebox (https://tools.simonwillison.net/scrimshaw-jukebox, Apache
// License 2.0, see LICENSE here). Notes slide left past the yellow line as they
// play; drums tick along the bottom; muted voices fade out.

const COLORS = ['#ffd96b', '#5fd1a6', '#ff8a70', '#8fc8ff', '#c9a2ff', '#f2c48d', '#b4e67a', '#ff9fcf', '#7fe0e0', '#e6e08a']
const DRUM_COLOR = '#8a84b8'

// One colour per voice, melodic voices cycling through COLORS, drums all grey-blue.
export function voiceColors(song) {
	let k = 0
	return song.voices.map((v) => (v.drum ? DRUM_COLOR : COLORS[k++ % COLORS.length]))
}

const ranges = new WeakMap()

// The pitch range of every note in the song, with a little room either side.
function range(song) {
	if (!ranges.has(song)) {
		let lo = 127
		let hi = 0
		for (const tl of [song.intro, song.loop])
			for (const e of tl.events) if (e.m) for (const m of e.m) [lo, hi] = [Math.min(lo, m), Math.max(hi, m)]
		if (lo > hi) [lo, hi] = [48, 72]
		const drums = song.voices.flatMap((v, i) => (v.drum ? [i] : []))
		ranges.set(song, { lo: Math.floor(lo) - 2, hi: Math.ceil(hi) + 2, drums, colors: voiceColors(song) })
	}
	return ranges.get(song)
}

// Draws `song` at `at` seconds from its start (past its length means it has
// looped) onto `canvas`, with the voices named in `muted` faded.
export function drawRoll(canvas, song, at, muted) {
	const dpr = window.devicePixelRatio || 1
	const W = canvas.clientWidth
	const H = canvas.clientHeight
	if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
		canvas.width = Math.round(W * dpr)
		canvas.height = Math.round(H * dpr)
	}
	const g = canvas.getContext('2d')
	g.setTransform(dpr, 0, 0, dpr, 0, 0)
	g.fillStyle = '#111'
	g.fillRect(0, 0, W, H)
	const { lo, hi, drums, colors } = range(song)
	const span = W < 500 ? 4.5 : 7 // seconds across
	const pre = span * 0.22 // of them already played
	const pps = W / span
	const x0 = W * 0.22
	const drumH = drums.length ? Math.min(5, 44 / drums.length) : 0
	const drumTop = H - drums.length * drumH - 6
	const noteH = Math.max(3, (drumTop - 12) / (hi - lo + 1))
	const yOf = (m) => 6 + (hi - m) * noteH

	// a faint line at every C
	g.fillStyle = '#262626'
	for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12) g.fillRect(0, Math.round(yOf(m)), W, 1)

	// the intro once, then as many turns of the loop as are on screen
	const a = at - pre
	const z = at + span - pre
	const windows = []
	if (a < song.intro.dur) windows.push([song.intro, 0])
	if (song.loop.dur) {
		const k0 = Math.max(0, Math.floor((a - song.intro.dur) / song.loop.dur))
		const k1 = Math.floor((z - song.intro.dur) / song.loop.dur)
		for (let k = k0; k <= k1 && k < k0 + 4; k++) windows.push([song.loop, song.intro.dur + k * song.loop.dur])
	}
	g.font = '11px ui-monospace, monospace'
	for (const [tl, off] of windows) {
		for (const s of tl.sections)
			for (let b = 0; b < s.bars; b++) {
				const bt = off + s.start + b * s.barDur
				if (bt < a - 1 || bt > z) continue
				const x = Math.round(x0 + (bt - at) * pps)
				g.fillStyle = b === 0 ? '#555' : '#2c2c2c'
				g.fillRect(x, 0, 1, H)
				if (b === 0) {
					g.fillStyle = '#999'
					g.fillText(s.name + (s.trans ? (s.trans > 0 ? '+' : '') + s.trans : ''), x + 4, 14)
				}
			}
		for (const e of tl.events) {
			const t = off + e.t
			if (t > z || t + (e.d || 0.05) < a) continue
			const v = song.voices[e.v]
			const dim = muted.has(v.name)
			const x = x0 + (t - at) * pps
			const on = at >= t && at < t + (e.d || 0.08)
			g.fillStyle = colors[e.v]
			if (v.drum) {
				g.globalAlpha = dim ? 0.2 : on || (at >= t && at < t + 0.12) ? 1 : 0.7
				g.fillRect(Math.round(x), Math.round(drumTop + drums.indexOf(e.v) * drumH), 3, Math.max(1, drumH - 1))
				continue
			}
			const w = Math.round(Math.max(2, e.d * pps - 1))
			const h = Math.max(2, Math.round(noteH) - (noteH > 4 ? 1 : 0))
			g.globalAlpha = dim ? 0.15 : on ? 1 : t > at ? 0.78 : 0.38
			for (const m of e.m) g.fillRect(Math.round(x), Math.round(yOf(m)), w, h)
			if (on && !dim) {
				g.fillStyle = '#fff'
				g.globalAlpha = 0.55
				for (const m of e.m) g.fillRect(Math.round(x), Math.round(yOf(m)), 2, h)
			}
		}
	}
	g.globalAlpha = 1
	g.fillStyle = '#ffd96b'
	g.fillRect(Math.round(x0), 0, 2, H)
}
