import { T } from './tiles.js'

export const SURFACE = { paint: 0, plain: 1, setts: 2, pavement: 3, asphalt: 4, square: 5 }

// Full-way distances keep the pattern fixed when a chunk unloads or a curve
// crosses a patch boundary. Canonical direction also survives reversed ways.
export function surfaceFrame(shape, tileM = 3) {
	if (!shape.line || shape.line.length < 4) return null
	const points = Array.from({ length: shape.line.length / 2 }, (_, i) => [shape.line[i * 2] * tileM, shape.line[i * 2 + 1] * tileM])
	const first = points[0],
		last = points.at(-1)
	if (first[0] > last[0] || (first[0] === last[0] && first[1] > last[1])) points.reverse()
	const segments = []
	let distance = 0
	for (let i = 0; i + 1 < points.length; i++) {
		const [x, y] = points[i]
		const dx = points[i + 1][0] - x,
			dy = points[i + 1][1] - y
		const length = Math.hypot(dx, dy)
		if (!length) continue
		const axis = [dx / length, dy / length]
		if (!segments.length) distance = x * axis[0] + y * axis[1]
		segments.push({ x, y, axis, length, distance })
		distance += length
	}
	// build-map paints these two road-centred strokes out to the façades.
	const shoulder = shape.layer === -1 ? 10 : shape.layer === 3 ? 4 : 0
	const band = shape.t === T.SIDEWALK && shoulder ? Math.max(0, (shape.w * tileM) / 2 - shoulder) + 2 : 0
	return { segments, band, tileM }
}

export function surfacePoint(frame, x, y) {
	let best = Infinity,
		u = x * (frame?.tileM ?? 3),
		v = y * (frame?.tileM ?? 3)
	if (!frame) return [u, v]
	x *= frame.tileM
	y *= frame.tileM
	for (const s of frame.segments) {
		const dx = x - s.x,
			dy = y - s.y
		const along = dx * s.axis[0] + dy * s.axis[1]
		const t = Math.max(0, Math.min(s.length, along))
		const distance = (dx - s.axis[0] * t) ** 2 + (dy - s.axis[1] * t) ** 2
		if (distance >= best) continue
		best = distance
		u = s.distance + along
		v = -dx * s.axis[1] + dy * s.axis[0]
	}
	return [u, frame.band ? Math.abs(v) - frame.band : v]
}
