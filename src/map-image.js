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

// Roofs, prerendered the same way and laid over the tops of the building
// boxes. Each building picks a roof (red tiles, brown tiles or grey tar) and
// gets a parapet rim where it ends, plus the odd chimney or skylight.
const ROOFS = [
	{ base: '#b05a40', lines: true },
	{ base: '#a4533e', lines: true },
	{ base: '#b8694a', lines: true },
	{ base: '#8a4a38', lines: true },
	{ base: '#9a958e', lines: false },
]
const SHED_ROOF = { base: '#8f8a84', lines: false }

export function renderRoofImage(world) {
	const { W, H, tiles, heights, buildingOf } = world
	// Finer than the ground, but within what every GPU takes as one texture.
	const RPX = Math.max(2, Math.min(8, Math.floor(8192 / Math.max(W, H))))
	const canvas = document.createElement('canvas')
	canvas.width = W * RPX
	canvas.height = H * RPX
	const g = canvas.getContext('2d')
	const img = g.createImageData(canvas.width, canvas.height)
	const px = img.data
	const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
	const roofs = ROOFS.map((r) => ({ ...r, rgb: rgb(r.base) }))
	const shed = { ...SHED_ROOF, rgb: rgb(SHED_ROOF.base) }
	const hash = (n) => ((Math.imul(n, 2654435761) >>> 0) % 10007) / 10007
	const same = (i, x, y) => {
		if (x < 0 || y < 0 || x >= W || y >= H) return false
		const j = y * W + x
		return tiles[j] === T.BUILDING && buildingOf[j] === buildingOf[i] && heights[j] === heights[i]
	}

	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = y * W + x
			if (tiles[i] !== T.BUILDING) continue
			const low = heights[i] <= 5
			const roof = low ? shed : roofs[Math.floor(hash(buildingOf[i] + 1) * roofs.length)]
			const n = !same(i, x, y - 1)
			const s = !same(i, x, y + 1)
			const w = !same(i, x - 1, y)
			const e = !same(i, x + 1, y)
			const inner = !(n || s || w || e)
			const r = hash(x * 7919 + y * 104729)
			const chimney = inner && !low && r < 0.1
			const skylight = inner && !roof.lines && r > 0.95
			for (let dy = 0; dy < RPX; dy++) {
				for (let dx = 0; dx < RPX; dx++) {
					const gx = x * RPX + dx
					const gy = y * RPX + dy
					let k = 0.92 + (hash(gx * 31 + gy * 977) - 0.5) * 0.1
					if (roof.lines && gy % 3 === 0) k *= 0.85
					// Parapet: dark outer edge, a lit band just inside it.
					const d = Math.min(n ? dy : RPX, s ? RPX - 1 - dy : RPX, w ? dx : RPX, e ? RPX - 1 - dx : RPX)
					if (d === 0) k = 0.55
					else if (d === 1 && RPX > 3) k = 1.12
					let c = roof.rgb
					const m = Math.floor(RPX / 4)
					if (chimney && dx >= m && dx < RPX - m && dy >= m && dy < RPX - m) {
						c = [92, 74, 66]
						k = dx === m || dy === m ? 1.25 : 1
					} else if (skylight && dx >= m && dx < RPX - m && dy >= m + 1 && dy < RPX - m - 1) {
						c = [150, 170, 185]
						k = 1
					}
					const o = (gy * canvas.width + gx) * 4
					px[o] = Math.min(255, c[0] * k)
					px[o + 1] = Math.min(255, c[1] * k)
					px[o + 2] = Math.min(255, c[2] * k)
					px[o + 3] = 255
				}
			}
		}
	}
	g.putImageData(img, 0, 0)
	return canvas
}
