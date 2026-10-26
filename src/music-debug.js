// Musik-Debug: where music comes from. Every source gets a speaker and a ring
// on the ground as far as it carries (HEAR, or the convoy's own reach); the
// level falls off as (1 - d / reach)², so there's no full-volume inner ring.
// The ones you hear glow and pulse with their gain. Overhead view only, like
// the rest of the flat layer.
import { KINDS, reach } from './music.js'

const icon = new Image()
icon.src = '/icons/speaker-source.png'

export function drawMusicDebug(ctx, { sources, gains }, toScreen, scale) {
	const dpr = devicePixelRatio
	const { width, height } = ctx.canvas
	const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120)
	const size = 32 * dpr
	ctx.lineWidth = 3 * dpr
	for (const src of sources) {
		const r = reach(src.kind) * scale
		const [sx, sy] = toScreen(src.x, src.y)
		if (sx < -r || sy < -r || sx > width + r || sy > height + r) continue
		// How loud it is now against how loud it could be, 0–1.
		const on = gains.has(src) ? Math.min(1, gains.get(src) / KINDS[src.kind].level) : 0
		ctx.beginPath()
		ctx.arc(sx, sy, r, 0, Math.PI * 2)
		ctx.fillStyle = `rgba(232, 194, 26, ${0.06 + 0.3 * on})`
		ctx.fill()
		ctx.strokeStyle = gains.has(src) ? `rgba(232, 194, 26, ${0.6 + 0.4 * pulse})` : 'rgba(231, 231, 229, 0.35)'
		ctx.stroke()
		const s = size * (1 + 0.35 * on * pulse)
		if (icon.complete) ctx.drawImage(icon, sx - s / 2, sy - s / 2, s, s)
	}
	// What's playing, loudest first.
	const lines = [...gains].sort((a, b) => b[1] - a[1]).map(([src, gain]) => `${src.kind} · ${src.score} · ${gain.toFixed(2)}`)
	ctx.font = `800 ${13 * dpr}px system-ui, sans-serif`
	ctx.fillStyle = '#fff'
	ctx.shadowColor = '#000'
	ctx.shadowOffsetY = 2 * dpr
	for (const [i, line] of (lines.length ? lines : ['Musik: still']).entries()) ctx.fillText(line, 16 * dpr, height - (16 + 18 * i) * dpr)
	ctx.shadowColor = 'transparent'
	ctx.shadowOffsetY = 0
}
