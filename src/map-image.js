// Paint the ground once from the map's shapes, antialiased, so roads and
// pavements curve the way they do in town. It becomes the ground texture of
// the 3D scene. The tile grid underneath still decides where you can walk.
import { T, COLORS } from './tiles.js'

export const PX = 4 // screen pixels per tile at zoom 1

export function renderMapImage(world) {
	const { W, H, shapes } = world
	const GPX = Math.max(2, Math.min(8, Math.floor(8192 / Math.max(W, H))))
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
	hg.strokeStyle = '#7d7466'
	hg.lineWidth = 2
	hg.beginPath()
	for (const o of [-8, 0, 8]) {
		hg.moveTo(o, 8)
		hg.lineTo(o + 8, 0)
	}
	hg.stroke()
	const hatch = g.createPattern(hatchTile, 'repeat')
	hatch.setTransform(new DOMMatrix().scale(1 / GPX))
	const paint = (t) => (t === T.PRIVATE ? hatch : COLORS[t])

	const trace = (pts) => {
		g.moveTo(pts[0], pts[1])
		for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
	}
	const stroke = (s, style, width) => {
		g.beginPath()
		trace(s.line)
		g.strokeStyle = style
		g.lineWidth = width
		g.stroke()
	}

	for (let k = 0; k < shapes.length; k++) {
		const s = shapes[k]
		if (s.rings) {
			g.beginPath()
			for (const r of s.rings) {
				trace(r)
				g.closePath()
			}
			g.fillStyle = paint(s.t)
			g.fill('evenodd')
		} else if (s.t === 'mark') {
			g.setLineDash([1, 1.5])
			g.lineCap = 'butt'
			stroke(s, 'rgba(235, 230, 215, 0.7)', 0.15)
			g.setLineDash([])
			g.lineCap = 'round'
		} else if (s.t === T.ROAD && shapes[k - 1]?.t !== T.ROAD) {
			// All the kerbs first, then all the tarmac, so junctions stay open.
			let end = k
			while (shapes[end]?.t === T.ROAD) end++
			for (let j = k; j < end; j++) stroke(shapes[j], '#d8d2c6', shapes[j].w + 0.3)
			for (let j = k; j < end; j++) stroke(shapes[j], COLORS[T.ROAD], shapes[j].w)
			k = end - 1
		} else {
			stroke(s, paint(s.t), s.w)
		}
	}
	return canvas
}

// Roofs, painted from the building outlines and laid over the tops of the
// 3D buildings. Each building picks a roof (red tiles, brown tiles or grey
// tar) and gets a parapet rim along its edge, plus the odd chimney or
// skylight. Tile rows run along the building's longest wall.
const ROOFS = [
	{ base: '#b05a40', lines: true },
	{ base: '#a4533e', lines: true },
	{ base: '#b8694a', lines: true },
	{ base: '#8a4a38', lines: true },
	{ base: '#9a958e', lines: false },
]
const SHED_ROOF = { base: '#8f8a84', lines: false }

export const roofHash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007

export function renderRoofImage(world) {
	const { W, H, buildings } = world
	// Finer than the ground, but within what every GPU takes as one texture.
	const RPX = Math.max(2, Math.min(8, Math.floor(8192 / Math.max(W, H))))
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

		if (roof.lines) {
			const cx = (minX + maxX) / 2
			const cy = (minY + maxY) / 2
			const reach = Math.hypot(maxX - minX, maxY - minY) / 2 + 1
			g.save()
			g.translate(cx, cy)
			g.rotate(angle)
			g.fillStyle = 'rgba(0, 0, 0, 0.14)'
			for (let y = -reach; y < reach; y += 0.5) g.fillRect(-reach, y, reach * 2, 0.2)
			g.restore()
		}

		// Chimneys and skylights, at spots fixed per building.
		let seed = n * 7919
		const rand = () => roofHash((seed += 104729))
		const tries = ((maxX - minX) * (maxY - minY)) / 12
		for (let k = 0; k < tries; k++) {
			const x = minX + rand() * (maxX - minX)
			const y = minY + rand() * (maxY - minY)
			if (!g.isPointInPath(path, x * RPX, y * RPX, 'evenodd')) continue
			if (b.h > 5 && rand() < 0.5) {
				g.fillStyle = '#5c4a42'
				g.fillRect(x - 0.3, y - 0.3, 0.6, 0.6)
				g.fillStyle = 'rgba(255, 255, 255, 0.25)'
				g.fillRect(x - 0.3, y - 0.3, 0.6, 0.12)
			} else if (!roof.lines && rand() < 0.3) {
				g.fillStyle = '#96aab9'
				g.fillRect(x - 0.35, y - 0.25, 0.7, 0.5)
			}
		}

		// Parapet: a lit band just inside the edge, then a dark outer line.
		g.strokeStyle = 'rgba(255, 255, 255, 0.2)'
		g.lineWidth = 0.7
		g.stroke(path)
		g.strokeStyle = 'rgba(0, 0, 0, 0.45)'
		g.lineWidth = 0.3
		g.stroke(path)
		g.restore()
	})
	return canvas
}
