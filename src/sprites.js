// Text is slow to draw every frame, so badges and street names are drawn
// once into small canvases and stamped from there.
import { FAMILIES, FAMILY } from './places.js'

const INK = '#1A1E1B'

// A round badge per kind of place, in the family of the H and U signs: its
// family's colour, a dark ink rim, and one bold glyph, drawn on a 64 px grid
// so it still reads stamped at 20 px.
export function badgeSprites() {
	const sprites = {}
	for (const [kind, family] of Object.entries(FAMILY)) {
		const { color, glyph } = FAMILIES[family]
		const c = document.createElement('canvas')
		c.width = c.height = 64
		const g = c.getContext('2d')
		g.beginPath()
		g.arc(32, 32, 28, 0, Math.PI * 2)
		g.fillStyle = color
		g.fill()
		g.lineWidth = 5
		g.strokeStyle = INK
		g.stroke()
		g.fillStyle = g.strokeStyle = glyph
		g.lineCap = g.lineJoin = 'round'
		GLYPHS[kind](g, color)
		sprites[kind] = c
	}
	return sprites
}

const poly = (g, ...pts) => {
	g.beginPath()
	pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
	g.closePath()
	g.fill()
}
const line = (g, width, ...pts) => {
	g.beginPath()
	pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
	g.lineWidth = width
	g.stroke()
}
const disc = (g, x, y, r) => {
	g.beginPath()
	g.arc(x, y, r, 0, Math.PI * 2)
	g.fill()
}
const ring = (g, x, y, r, width) => {
	g.beginPath()
	g.arc(x, y, r, 0, Math.PI * 2)
	g.lineWidth = width
	g.stroke()
}
const box = (g, x0, y0, x1, y1, r = 0) => {
	g.beginPath()
	g.roundRect(x0, y0, x1 - x0, y1 - y0, r)
	g.fill()
}

// Each glyph gets the badge colour too, for cutting lines into itself.
const GLYPHS = {
	// A Pfand bottle.
	spaeti(g) {
		box(g, 25, 28, 39, 51, 4)
		box(g, 29, 16, 35, 30)
		box(g, 28, 12, 36, 17, 1)
	},
	// The spit: a cone of meat in layers on its pole.
	doener(g, cut) {
		box(g, 30.5, 10, 33.5, 54, 1)
		poly(g, [20, 16], [44, 16], [39, 45], [25, 45])
		g.strokeStyle = cut
		line(g, 2.5, [21, 26], [43, 26])
		line(g, 2.5, [22, 35], [42, 35])
	},
	// Fries in their carton.
	imbiss(g, cut) {
		for (const [x, top] of [
			[24, 18],
			[29, 13],
			[34, 16],
			[39, 20],
		])
			box(g, x - 2, top, x + 2, 36, 1)
		poly(g, [20, 31], [44, 31], [40, 52], [24, 52])
		g.strokeStyle = cut
		line(g, 2.5, [20, 31], [44, 31])
	},
	// A cup on its saucer, steaming.
	cafe(g) {
		poly(g, [19, 27], [41, 27], [38, 45], [22, 45])
		ring(g, 41, 34, 5.5, 4)
		line(g, 4, [16, 50], [44, 50])
		line(g, 3, [26, 22], [28, 18], [26, 14])
		line(g, 3, [33, 22], [35, 18], [33, 14])
	},
	// A beer mug with a head on it.
	bar(g, cut) {
		box(g, 19, 22, 38, 51, 3)
		ring(g, 40, 36, 6.5, 5)
		disc(g, 22, 21, 5)
		disc(g, 29, 18, 6)
		disc(g, 36, 21, 5)
		g.strokeStyle = cut
		line(g, 2.5, [25, 30], [25, 45])
		line(g, 2.5, [32, 30], [32, 45])
	},
	// Fork and knife.
	restaurant(g) {
		for (const x of [19, 24, 29]) line(g, 3, [x, 12], [x, 24])
		box(g, 17.5, 22, 30.5, 28, 3)
		box(g, 22, 26, 26, 53, 2)
		poly(g, [38, 11], [45, 18], [45, 34], [38, 34])
		box(g, 38, 32, 43, 53, 2)
	},
	// A bicycle.
	bikeshop(g) {
		ring(g, 19, 40, 9, 4)
		ring(g, 45, 40, 9, 4)
		line(g, 3.5, [19, 40], [29, 40], [38, 27], [25, 27], [29, 40])
		line(g, 3.5, [38, 27], [45, 40])
		line(g, 3.5, [22, 22], [29, 22])
		line(g, 3.5, [36, 21], [41, 21])
	},
	// A shopping trolley.
	supermarket(g) {
		line(g, 4, [11, 18], [17, 18], [24, 41], [45, 41])
		poly(g, [18, 23], [50, 23], [45, 37], [22, 37])
		disc(g, 27, 48, 4)
		disc(g, 42, 48, 4)
	},
	// A croissant: a fat crescent cut into its rolls.
	bakery(g, cut) {
		g.beginPath()
		g.arc(32, 44, 15, Math.PI * 1.08, Math.PI * 1.92)
		g.lineWidth = 12
		g.stroke()
		g.strokeStyle = cut
		for (const a of [1.32, 1.5, 1.68]) {
			const c = Math.cos(Math.PI * a)
			const s = Math.sin(Math.PI * a)
			line(g, 2.5, [32 + c * 9, 44 + s * 9], [32 + c * 21, 44 + s * 21])
		}
	},
	// The pharmacy cross.
	pharmacy(g) {
		box(g, 26, 14, 38, 50, 2)
		box(g, 14, 26, 50, 38, 2)
	},
	// An open book.
	school(g) {
		poly(g, [13, 19], [30, 23], [30, 49], [13, 45])
		poly(g, [34, 23], [51, 19], [51, 45], [34, 49])
	},
	// A teddy.
	kita(g, cut) {
		disc(g, 20, 20, 6.5)
		disc(g, 44, 20, 6.5)
		disc(g, 32, 34, 15)
		g.fillStyle = cut
		disc(g, 32, 40, 6)
		disc(g, 26, 30, 2.5)
		disc(g, 38, 30, 2.5)
	},
	// A swing.
	playground(g) {
		line(g, 4, [14, 51], [23, 14], [41, 14], [50, 51])
		line(g, 2.5, [28, 14], [28, 38])
		line(g, 2.5, [36, 14], [36, 38])
		line(g, 5, [25, 39], [39, 39])
	},
}

// Transit signs the Berlin way: white U on a blue square, green H on a
// yellow disc.
export function transitSprites() {
	const sign = (draw) => {
		const c = document.createElement('canvas')
		c.width = c.height = 64
		const g = c.getContext('2d')
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.font = '700 44px system-ui'
		draw(g)
		return c
	}
	return {
		ubahn: sign((g) => {
			g.fillStyle = '#fff'
			g.fillRect(2, 2, 60, 60)
			g.fillStyle = '#115d91'
			g.fillRect(6, 6, 52, 52)
			g.fillStyle = '#fff'
			g.fillText('U', 32, 35)
		}),
		bus: sign((g) => {
			g.beginPath()
			g.arc(32, 32, 29, 0, Math.PI * 2)
			g.fillStyle = '#f5d000'
			g.fill()
			g.lineWidth = 4
			g.strokeStyle = '#2f7d32'
			g.stroke()
			g.fillStyle = '#2f7d32'
			g.fillText('H', 32, 35)
		}),
	}
}

export const LABEL_PX = 28

export function labelSprites(names) {
	const sprites = {}
	const font = `700 ${LABEL_PX}px system-ui`
	for (const name of new Set(names)) {
		const c = document.createElement('canvas')
		const g = c.getContext('2d')
		g.font = font
		c.width = Math.ceil(g.measureText(name).width) + 12
		c.height = LABEL_PX + 12
		g.font = font
		g.textBaseline = 'middle'
		g.lineWidth = 6
		g.lineJoin = 'round'
		g.strokeStyle = '#222'
		g.fillStyle = '#fff'
		g.strokeText(name, 6, c.height / 2)
		g.fillText(name, 6, c.height / 2)
		sprites[name] = c
	}
	return sprites
}
