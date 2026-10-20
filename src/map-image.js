// Paint the ground once from the map's shapes, antialiased, so roads and
// pavements curve the way they do in town. It becomes the ground texture of
// the 3D scene. The tile grid underneath still decides where you can walk.
import { T, COLORS, INK, KERB, MARK } from './tiles.js'

export const PX = 4 // screen pixels per tile at zoom 1

// Look. Everything here is a knob to tune against the reference.
const GROUND_PX = 12 // texture pixels per tile, at most
const ROOF_PX = 12
const TONE_SHIFT = 1.1 // tiles the lighter ground tone slides south-west
const SHAPE_OUTLINE = 0.7 // ink around parks and water, tiles
const PLOT_OUTLINE = 0.5 // contact ink around building plots, tiles
const KERB_EXTRA = 0.6 // pale kerb band outside the tarmac, tiles
const ROAD_INK_EXTRA = 0.34 // dark edge inside the kerb, tiles
const MARK_DASH = [1.1, 1.3]
const MARK_WIDTH = 0.18
const ROOF_TILE_TONE = 0.1 // second tone on pitched roofs, mixed towards white
const ROOF_FLAT_TONE = 0.06
const ROOF_ROW_INK = 0.05 // faint tile rows on pitched roofs
const ROOF_ROW_STEP = 0.5 // tiles between rows
const ROOF_ROW_WIDTH = 0.2
const RIDGE_WIDTH = 0.18
const RIDGE_INK = 'rgba(0, 0, 0, 0.22)'
const PARAPET_LIGHT = 0
const PARAPET_LIGHT_WIDTH = 0.6
const PARAPET_INK = 0.6
const PARAPET_INK_WIDTH = 0.34
const CHIMNEY_COLOR = '#544a44'
const CHIMNEY_LIT = 'rgba(255, 255, 255, 0.3)'
const SKYLIGHT_COLOR = '#8fa3ae'
const HATCH_INK = '#877e70'
const HATCH_WIDTH = 2

// Flat second tone for parks and water, one step lighter than the base.
const TONES = {
	[T.GRASS]: '#679a3d',
	[T.PITCH]: '#5a8a48',
	[T.PLAYGROUND]: '#d3b171',
	[T.WATER]: '#4b6a69',
	[T.SIDEWALK]: '#bcb3a4',
}
const OUTLINED = new Set([T.GRASS, T.WATER, T.PITCH, T.PLAYGROUND, T.PRIVATE, T.SIDEWALK])

const trace = (g, pts) => {
	g.moveTo(pts[0], pts[1])
	for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
}

const ringPath = (rings) => {
	const path = new Path2D()
	for (const r of rings) {
		trace(path, r)
		path.closePath()
	}
	return path
}

export function renderMapImage(world) {
	const { W, H, shapes, buildings } = world
	const GPX = Math.max(2, Math.min(GROUND_PX, Math.floor(8192 / Math.max(W, H))))
	const canvas = document.createElement('canvas')
	canvas.width = W * GPX
	canvas.height = H * GPX
	const g = canvas.getContext('2d')
	g.fillStyle = COLORS[T.GROUND]
	g.fillRect(0, 0, canvas.width, canvas.height)
	g.scale(GPX, GPX)
	g.lineCap = 'round'
	g.lineJoin = 'round'

	// Diagonal hatching on private ground, like a plan's no-go area.
	const hatchTile = document.createElement('canvas')
	hatchTile.width = hatchTile.height = 8
	const hg = hatchTile.getContext('2d')
	hg.fillStyle = COLORS[T.PRIVATE]
	hg.fillRect(0, 0, 8, 8)
	hg.strokeStyle = HATCH_INK
	hg.lineWidth = HATCH_WIDTH
	hg.beginPath()
	for (const o of [-8, 0, 8]) {
		hg.moveTo(o, 8)
		hg.lineTo(o + 8, 0)
	}
	hg.stroke()
	const hatch = g.createPattern(hatchTile, 'repeat')
	hatch.setTransform(new DOMMatrix().scale(1 / GPX))
	const paint = (t) => (t === T.PRIVATE ? hatch : COLORS[t])

	const stroke = (s, style, width) => {
		g.beginPath()
		trace(g, s.line)
		g.strokeStyle = style
		g.lineWidth = width
		g.stroke()
	}

	for (let k = 0; k < shapes.length; k++) {
		const s = shapes[k]
		if (s.rings) {
			const path = ringPath(s.rings)
			g.fillStyle = paint(s.t)
			g.fill(path, 'evenodd')

			// Two flat tones: slide a lighter copy south-west, leaving the
			// north-east edge in the base colour. Hard, not noisy.
			const tone = TONES[s.t]
			if (tone) {
				g.save()
				g.clip(path, 'evenodd')
				g.translate(-TONE_SHIFT, TONE_SHIFT)
				g.fillStyle = tone
				g.fill(path, 'evenodd')
				g.restore()
			}
			// Ink around the shape, clipped so it stays inside the fill.
			if (OUTLINED.has(s.t)) {
				g.save()
				g.clip(path, 'evenodd')
				g.strokeStyle = INK
				g.lineWidth = SHAPE_OUTLINE
				g.stroke(path)
				g.restore()
			}
		} else if (s.t === 'mark') {
			g.setLineDash(MARK_DASH)
			g.lineCap = 'butt'
			stroke(s, MARK, Math.max(MARK_WIDTH, s.w))
			g.setLineDash([])
			g.lineCap = 'round'
		} else if (s.t === T.ROAD && shapes[k - 1]?.t !== T.ROAD) {
			// All the kerbs first, then all the tarmac, so junctions stay open.
			let end = k
			while (shapes[end]?.t === T.ROAD) end++
			for (let j = k; j < end; j++) stroke(shapes[j], KERB, shapes[j].w + KERB_EXTRA)
			for (let j = k; j < end; j++) stroke(shapes[j], INK, shapes[j].w + ROAD_INK_EXTRA)
			for (let j = k; j < end; j++) stroke(shapes[j], COLORS[T.ROAD], shapes[j].w)
			k = end - 1
		} else {
			stroke(s, paint(s.t), s.w)
		}
	}

	// A dark contact line just outside every building plot, so the walls sit in
	// the ground rather than float on it. Buildings themselves are painted by
	// their roofs in the 3D scene.
	for (const b of buildings) {
		if (!b.rings.length) continue
		g.beginPath()
		for (const r of b.rings) {
			trace(g, r)
			g.closePath()
		}
		g.strokeStyle = INK
		g.lineWidth = PLOT_OUTLINE
		g.stroke()
	}
	return canvas
}

// Roofs, painted from the building outlines and laid over the tops of the
// 3D buildings. Each building picks a roof (tiles or slate) and gets flat
// two-tone shading split along its ridge, plus the odd chimney or skylight.
const ROOFS = [
	{ base: '#a55f45', ridge: 1 },
	{ base: '#96553f', ridge: 1 },
	{ base: '#b06b4b', ridge: 1 },
	{ base: '#7f4f3f', ridge: 1 },
	{ base: '#858d92', ridge: 0 },
	{ base: '#6f787d', ridge: 0 },
]
const SHED_ROOF = { base: '#8a8b86', ridge: 0 }

export const roofHash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007

// Mix towards white (t > 0) or black (t < 0), for the second roof tone.
function shade(hex, t) {
	const n = parseInt(hex.slice(1), 16)
	const to = t > 0 ? 255 : 0
	const k = Math.abs(t)
	const mix = (c) => Math.round(c + (to - c) * k)
	return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

export function renderRoofImage(world) {
	const { W, H, buildings } = world
	// Finer than the ground, but within what every GPU takes as one texture.
	const RPX = Math.max(2, Math.min(ROOF_PX, Math.floor(8192 / Math.max(W, H))))
	const canvas = document.createElement('canvas')
	canvas.width = W * RPX
	canvas.height = H * RPX
	const g = canvas.getContext('2d')
	g.scale(RPX, RPX)
	g.lineJoin = 'round'

	buildings.forEach((b, n) => {
		// No outline means an endless bounding box below, so skip it. Maps
		// built before build-map.js dropped these still have a few.
		if (!b.rings.length) return
		const roof = b.h <= 5 ? SHED_ROOF : ROOFS[Math.floor(roofHash(n) * ROOFS.length)]
		const path = new Path2D()
		let minX = Infinity
		let minY = Infinity
		let maxX = -Infinity
		let maxY = -Infinity
		let longest = 0
		let angle = 0
		for (const r of b.rings) {
			path.moveTo(r[0], r[1])
			for (let i = 2; i < r.length; i += 2) {
				path.lineTo(r[i], r[i + 1])
				const len = Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1])
				if (len > longest) [longest, angle] = [len, Math.atan2(r[i + 1] - r[i - 1], r[i] - r[i - 2])]
			}
			path.closePath()
			for (let i = 0; i < r.length; i += 2) {
				minX = Math.min(minX, r[i])
				maxX = Math.max(maxX, r[i])
				minY = Math.min(minY, r[i + 1])
				maxY = Math.max(maxY, r[i + 1])
			}
		}

		g.save()
		g.clip(path, 'evenodd')
		g.fillStyle = roof.base
		g.fill(path, 'evenodd')

		const cx = (minX + maxX) / 2
		const cy = (minY + maxY) / 2
		const reach = Math.hypot(maxX - minX, maxY - minY) / 2 + 1
		// Ridge line along the longest wall. The half facing the south-west sun
		// gets the lighter tone; the other keeps the base.
		const lit = 0.6 * Math.sin(angle) + 0.8 * Math.cos(angle)
		g.save()
		g.translate(cx, cy)
		g.rotate(angle)
		g.fillStyle = shade(roof.base, roof.ridge ? ROOF_TILE_TONE : ROOF_FLAT_TONE)
		g.fillRect(-reach, lit > 0 ? 0 : -reach, reach * 2, reach)
		if (roof.ridge) {
			g.strokeStyle = RIDGE_INK
			g.lineWidth = RIDGE_WIDTH
			g.beginPath()
			g.moveTo(-reach, 0)
			g.lineTo(reach, 0)
			g.stroke()
		}
		g.restore()

		// Faint tile rows, running along the longest wall.
		if (roof.ridge) {
			g.save()
			g.translate(cx, cy)
			g.rotate(angle)
			g.fillStyle = `rgba(0, 0, 0, ${ROOF_ROW_INK})`
			for (let y = -reach; y < reach; y += ROOF_ROW_STEP) g.fillRect(-reach, y, reach * 2, ROOF_ROW_WIDTH)
			g.restore()
		}

		// Chimneys and skylights, at spots fixed per building.
		let seed = n * 7919
		const rand = () => roofHash((seed += 104729))
		const tries = ((maxX - minX) * (maxY - minY)) / 30
		for (let k = 0; k < tries; k++) {
			const x = minX + rand() * (maxX - minX)
			const y = minY + rand() * (maxY - minY)
			if (!g.isPointInPath(path, x * RPX, y * RPX, 'evenodd')) continue
			if (b.h > 5 && rand() < 0.5) {
				g.fillStyle = CHIMNEY_COLOR
				g.fillRect(x - 0.3, y - 0.3, 0.6, 0.6)
				g.fillStyle = CHIMNEY_LIT
				g.fillRect(x - 0.3, y - 0.3, 0.6, 0.12)
			} else if (!roof.ridge && rand() < 0.3) {
				g.fillStyle = SKYLIGHT_COLOR
				g.fillRect(x - 0.35, y - 0.25, 0.7, 0.5)
			}
		}

		// Parapet: a lit band just inside the edge, then a dark outer line.
		g.strokeStyle = `rgba(255, 255, 255, ${PARAPET_LIGHT})`
		g.lineWidth = PARAPET_LIGHT_WIDTH
		g.stroke(path)
		g.strokeStyle = `rgba(20, 24, 26, ${PARAPET_INK})`
		g.lineWidth = PARAPET_INK_WIDTH
		g.stroke(path)
		g.restore()
	})
	return canvas
}
