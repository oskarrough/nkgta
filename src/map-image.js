// Paint the ground once from the map's shapes, antialiased, so roads and
// pavements curve the way they do in town. It becomes the ground texture of
// the 3D scene. The tile grid underneath still decides where you can walk.
import { T, COLORS, INK, MARK } from './tiles.js'
import { flatTops } from './roofs.js'

export const PX = 4 // screen pixels per tile at zoom 1

// Look. Everything here is a knob to tune against the reference.
const GROUND_PX = 12 // texture pixels per tile, at most
const ROOF_PX = 12
export const TONE_SHIFT = 1.1 // tiles the lighter ground tone slides south-west
export const SHAPE_OUTLINE = 0.7 // ink around parks and water, tiles
const PLOT_OUTLINE = 0.5 // contact ink around building plots, tiles
// Contact shade on the ground round every building, in hard steps: total
// width in tiles and how much darker each step makes it.
const CONTACT_SHADE = [
	[1.5, 0.12],
	[0.9, 0.16],
]
const CONTACT_COLOR = '24, 28, 44'
const ROOF_TILE_TONE = 0.1 // second tone on pitched roofs, mixed towards white
const ROOF_ROW_INK = 0.05 // faint tile rows on pitched roofs
const ROOF_ROW_STEP = 0.5 // tiles between rows
const ROOF_ROW_WIDTH = 0.2
const RIDGE_WIDTH = 0.18
const RIDGE_INK = 'rgba(0, 0, 0, 0.22)'
const PARAPET_LIGHT = 0
const PARAPET_LIGHT_WIDTH = 0.6
const PARAPET_INK = 0.6
const PARAPET_INK_WIDTH = 0.34
const HATCH_AREA = 9 // square tiles of roof per try at a roof hatch
const HATCH_SHARE = 0.5
const HATCH_MARGIN = 0.5 // tiles clear of the roof's edge
const ROOF_SPOT_AREA = 10 // square tiles of roof per try at a chimney or skylight
const CHIMNEY_SHARE = 0.55
const SKYLIGHT_SHARE = 0.1
const CHIMNEY_SOOT = 'rgba(30, 26, 24, 0.25)'
const SKYLIGHT_COLOR = '#8fa3ae'
// Water: paler shallows along every bank, a granite quay coping and an ink
// line round it, and the quay wall's shadow on the water, which lies below
// the street; in the shadow the shallows don't show. Sizes in tiles; the shadow falls away from the south-west sun.
const WATER = {
	shallows: '#5f8e8a',
	shallowsWidth: 0.9,
	coping: '#b9b2a2',
	copingWidth: 0.35,
	ink: '#1a1e1b',
	inkWidth: 0.18,
	drop: 1.5, // how far the wall's shadow reaches
	shadow: '#2f4a4c', // the water in it: one flat tone, no shallows
}
// Bridges: wherever a road or path is over water it's carried on a deck,
// pavement either side of a road, with a parapet along each edge.
const BRIDGE = { walk: 0.8, path: 0.25, deck: '#b3aa9b', rail: '#3d3f40', railWidth: 0.22 }
// Towards the sun on the ground, in the image's frame (y points south).
const TO_SUN = [-0.64, 0.77]
const PITCH_INSET = 1 // touchline distance from the pitch's edge, tiles
const PITCH_LINE = 0.25
const PITCH_CIRCLE = 3 // at most, and a quarter of the pitch's width
const PITCH_SMALL = 6 // narrower than this, no halfway line
export const FOOTPATH = 1.5 // pavement lines this narrow are footpaths, tiles
export const GRAVEL = '#d2c4a0'
export const GRAVEL_EDGE = '#8f8a68'
export const GRAVEL_EDGE_WIDTH = 0.3
const HATCH_INK = '#877e70'
const HATCH_WIDTH = 2
// Kerb paint (see kerbs.js): green bike lanes edged white, red cycle tracks on
// the pavement, and cobbles, a paler, warmer grey than tarmac. Chunk
// geometry carries the cobble flag; overview textures keep it in alpha.
export const BIKE_LANE = '#4f9d5d'
export const SETT = '#5d5b57'
export const SETT_ALPHA = 0.5

// Flat second tone for parks and water, one step lighter than the base.
export const TONES = {
	[T.GRASS]: '#679a3d',
	[T.PITCH]: '#5a8a48',
	[T.PLAYGROUND]: '#d3b171',
	[T.WATER]: '#4b6a69',
	[T.SIDEWALK]: '#bcb3a4',
}
export const OUTLINED = new Set([T.GRASS, T.WATER, T.PITCH, T.PLAYGROUND, T.PRIVATE, T.SIDEWALK])

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

// Pitch markings: a touchline just inside the edge, a halfway line across
// the long side, and a centre circle. Drawn on the pitch's own axis.
function pitchLines(g, ring, path) {
	let longest = 0
	let angle = 0
	let cx = 0
	let cy = 0
	const n = ring.length / 2
	for (let i = 0; i < ring.length; i += 2) {
		cx += ring[i] / n
		cy += ring[i + 1] / n
		if (i === 0) continue
		const len = Math.hypot(ring[i] - ring[i - 2], ring[i + 1] - ring[i - 1])
		if (len > longest) [longest, angle] = [len, Math.atan2(ring[i + 1] - ring[i - 1], ring[i] - ring[i - 2])]
	}
	g.save()
	g.clip(path, 'evenodd')
	g.strokeStyle = MARK
	g.lineWidth = (PITCH_INSET + PITCH_LINE) * 2
	g.stroke(path)
	g.strokeStyle = COLORS[T.PITCH]
	g.lineWidth = PITCH_INSET * 2
	g.stroke(path)
	g.strokeStyle = MARK
	g.lineWidth = PITCH_LINE
	// Width across the long side; small courts only get the touchline.
	let v0 = Infinity
	let v1 = -Infinity
	for (let i = 0; i < ring.length; i += 2) {
		const v = -(ring[i] - cx) * Math.sin(angle) + (ring[i + 1] - cy) * Math.cos(angle)
		v0 = Math.min(v0, v)
		v1 = Math.max(v1, v)
	}
	const circle = Math.min(PITCH_CIRCLE, (v1 - v0) * 0.25)
	if (v1 - v0 > PITCH_SMALL) {
		g.translate(cx, cy)
		g.rotate(angle)
		g.beginPath()
		g.moveTo(0, -longest)
		g.lineTo(0, longest)
		g.moveTo(circle, 0)
		g.arc(0, 0, circle, 0, Math.PI * 2)
		g.stroke()
	}
	g.restore()
}

// A canvas to paint on, in the page or in a worker. A worker paints on the
// CPU: on the GPU its drawing queues up with the game's own and holds back
// its frames.
function newCanvas(width, height) {
	if (typeof document === 'undefined') {
		const canvas = new OffscreenCanvas(width, height)
		canvas.getContext('2d', { willReadFrequently: true })
		return canvas
	}
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

// What to paint: a rectangle of the map in tiles, at `px` texture pixels per
// tile. By default the whole map, as fine as fits in one texture.
const wholeMap = ({ W, H }, px) => ({ x: 0, y: 0, w: W, h: H, px: Math.max(2, Math.min(px, Math.floor(8192 / Math.max(W, H)))) })

// Bounding boxes, worked out once per shape or building.
const boxes = new WeakMap()
function boxOf(rings, key = rings) {
	let box = boxes.get(key)
	if (box) return box
	box = [Infinity, Infinity, -Infinity, -Infinity]
	for (const r of rings) {
		for (let i = 0; i < r.length; i += 2) {
			box[0] = Math.min(box[0], r[i])
			box[1] = Math.min(box[1], r[i + 1])
			box[2] = Math.max(box[2], r[i])
			box[3] = Math.max(box[3], r[i + 1])
		}
	}
	boxes.set(key, box)
	return box
}
// Whether anything within `pad` tiles of these rings lands in the area.
const touches = (area, rings, pad, key) => {
	const [x0, y0, x1, y1] = boxOf(rings, key)
	return x1 + pad > area.x && y1 + pad > area.y && x0 - pad < area.x + area.w && y0 - pad < area.y + area.h
}

// Which footpaths run through a park, asked once per path. Only parks whose
// box holds the point can hold it, so they make up the path tested: the same
// answer as every park in one path, right down to points on an outline.
const parksOf = new WeakMap()
const inParks = new WeakMap()
export function inPark(shapes, s) {
	if (inParks.has(s)) return inParks.get(s)
	let parks = parksOf.get(shapes)
	if (!parks) {
		parks = shapes.filter((p) => p.rings && p.t === T.GRASS).map((p) => ({ path: ringPath(p.rings), box: boxOf(p.rings, p) }))
		parksOf.set(shapes, parks)
	}
	const i = Math.floor(s.line.length / 4) * 2
	const [x, y] = [s.line[i], s.line[i + 1]]
	const near = parks.filter(({ box }) => x >= box[0] && y >= box[1] && x <= box[2] && y <= box[3])
	let path = near[0]?.path
	if (near.length > 1) {
		path = new Path2D()
		for (const p of near) path.addPath(p.path)
	}
	const hit = !!path && contains(path, x, y, GROUND_PX)
	inParks.set(s, hit)
	return hit
}
// Point in path, tested at a fixed scale: edge cases come out the same as
// they did when it was tested on the painted image at full sharpness.
let scratch
function contains(path, x, y, px) {
	scratch ??= newCanvas(1, 1).getContext('2d')
	scratch.setTransform(px, 0, 0, px, 0, 0)
	return scratch.isPointInPath(path, x * px, y * px, 'evenodd')
}

// Roads are drawn from this layer up; water goes on just before them.
const ROADS_LAYER = 7
const DECKED = new Set([T.SIDEWALK, T.CYCLEWAY, T.PRIVATE])
// Which lines are carried over water on a deck, and how wide it is.
export const isDeck = (s) => !!s.line && (s.t === T.ROAD || (DECKED.has(s.t) && s.w <= FOOTPATH && s.layer > 3))
export const deckWidth = (s) => (s.t === T.ROAD ? s.w + BRIDGE.walk * 2 : s.w + BRIDGE.path * 2)

// All the area's water at once, so where shapes overlap they make one body
// of water with one bank: the coping and ink under everything, then the
// shallows, then the deep water shrunk away from every bank. Then the quay
// walls' and bridges' shadows, worked out on a mask of the water, and the
// bridge decks over it, cut to the water so they stop at the banks.
function paintWater(g, area, waters, decks) {
	const rings = waters.filter((s) => s.rings).map((s) => ringPath(s.rings))
	const lines = waters.filter((s) => s.line)
	const each = (ctx, ringStyle, ringWidth, lineStyle, lineWidth) => {
		for (const path of rings) {
			if (ringWidth) {
				ctx.strokeStyle = ringStyle
				ctx.lineWidth = ringWidth
				ctx.stroke(path)
			} else {
				ctx.fillStyle = ringStyle
				ctx.fill(path, 'evenodd')
			}
		}
		for (const s of lines) {
			ctx.beginPath()
			trace(ctx, s.line)
			ctx.strokeStyle = lineStyle
			ctx.lineWidth = lineWidth(s)
			ctx.stroke()
		}
	}
	const { coping, copingWidth, ink, inkWidth, shallows, shallowsWidth } = WATER
	const deep = COLORS[T.WATER]
	each(g, coping, (copingWidth + inkWidth) * 2, coping, (s) => s.w + (copingWidth + inkWidth) * 2)
	each(g, ink, inkWidth * 2, ink, (s) => s.w + inkWidth * 2)
	each(g, shallows, 0, shallows, (s) => s.w)
	for (const path of rings) {
		g.save()
		g.clip(path, 'evenodd')
		g.fillStyle = deep
		g.fill(path, 'evenodd')
		g.strokeStyle = shallows
		g.lineWidth = shallowsWidth * 2
		g.stroke(path)
		g.restore()
	}
	for (const s of lines) {
		g.beginPath()
		trace(g, s.line)
		g.strokeStyle = deep
		g.lineWidth = Math.max(0, s.w - shallowsWidth * 2)
		g.stroke()
	}

	// Masks at the texture's size and frame.
	const { width, height } = g.canvas
	const layer = () => {
		const ctx = newCanvas(width, height).getContext('2d')
		ctx.setTransform(g.getTransform())
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'
		return ctx
	}
	const stroked = (ctx, style, extra) => {
		ctx.strokeStyle = style
		for (const s of decks) {
			ctx.beginPath()
			trace(ctx, s.line)
			ctx.lineWidth = deckWidth(s) + extra
			ctx.stroke()
		}
	}
	const wet = layer()
	each(wet, '#000', 0, '#000', (s) => s.w)
	const deck = layer()
	stroked(deck, BRIDGE.rail, BRIDGE.railWidth * 2)
	stroked(deck, BRIDGE.deck, 0)
	// The open water, without the decks over it.
	const open = layer()
	open.save()
	open.setTransform(1, 0, 0, 1, 0, 0)
	open.drawImage(wet.canvas, 0, 0)
	open.restore()
	open.globalCompositeOperation = 'destination-out'
	stroked(open, '#000', BRIDGE.railWidth * 2)
	// Shadow wherever the way to the sun crosses a bank or a deck: the open
	// water, less itself moved away from the sun.
	const shade = layer()
	const px = area.px
	shade.setTransform(1, 0, 0, 1, 0, 0)
	shade.drawImage(open.canvas, 0, 0)
	shade.globalCompositeOperation = 'destination-out'
	shade.drawImage(open.canvas, -TO_SUN[0] * WATER.drop * px, -TO_SUN[1] * WATER.drop * px)
	shade.globalCompositeOperation = 'source-in'
	shade.fillStyle = WATER.shadow
	shade.fillRect(0, 0, width, height)
	// The decks only where there's water under them.
	deck.setTransform(1, 0, 0, 1, 0, 0)
	deck.globalCompositeOperation = 'destination-in'
	deck.drawImage(wet.canvas, 0, 0)

	g.save()
	g.setTransform(1, 0, 0, 1, 0, 0)
	g.drawImage(shade.canvas, 0, 0)
	g.drawImage(deck.canvas, 0, 0)
	g.restore()
}

export function renderMapImage(world, area = wholeMap(world, GROUND_PX)) {
	const { shapes, buildings } = world
	const GPX = area.px
	const canvas = newCanvas(Math.ceil(area.w * GPX), Math.ceil(area.h * GPX))
	const g = canvas.getContext('2d')
	g.fillStyle = COLORS[T.GROUND]
	g.fillRect(0, 0, canvas.width, canvas.height)
	g.scale(GPX, GPX)
	g.translate(-area.x, -area.y)
	g.lineCap = 'round'
	g.lineJoin = 'round'
	// Shapes that can't reach the area are skipped; strokes reach out by half
	// their width, the contact shade by a tile and a half.
	const near = (s) => touches(area, s.rings ?? [s.line], (s.w ?? 0) + 2, s)

	// Diagonal hatching on private ground, like a plan's no-go area. Its
	// stripes are fixed to the map, so they line up across textures.
	const hatchTile = newCanvas(8, 8)
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
	hatch.setTransform(new DOMMatrix().scale(1 / GROUND_PX))
	const paint = (t) => (t === T.PRIVATE ? hatch : COLORS[t])

	const stroke = (s, style, width) => {
		g.beginPath()
		trace(g, s.line)
		g.strokeStyle = style
		g.lineWidth = width
		g.stroke()
	}
	const cobble = (s) => {
		stroke(s, SETT, s.w)
		if (area.soft) return
		g.globalCompositeOperation = 'destination-out'
		stroke(s, `rgba(0, 0, 0, ${SETT_ALPHA})`, s.w)
		g.globalCompositeOperation = 'source-over'
	}

	// Water waits until everything under the roads is down, so pavements and
	// paths stop at the bank, and goes on top of them with its bridges.
	const waters = shapes.filter((s) => s.t === T.WATER && near(s))
	let watered = !waters.length
	const water = () => {
		watered = true
		const decks = shapes.filter((s) => isDeck(s) && near(s))
		paintWater(g, area, waters, decks)
	}

	for (let k = 0; k < shapes.length; k++) {
		const s = shapes[k]
		if (!watered && s.layer >= ROADS_LAYER) water()
		if (s.t === T.WATER) continue
		// Roads go in runs below, so a run's first road can't be skipped.
		if (!near(s) && (s.rings || s.t !== T.ROAD)) continue
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
			if (s.t === T.PITCH) pitchLines(g, s.rings[0], path)
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
			continue
		} else if (s.t === T.ROAD && shapes[k - 1]?.t !== T.ROAD) {
			// Road paint lives in road-paint.js; only the broad fills go here.
			let end = k
			while (shapes[end]?.t === T.ROAD) end++
			const run = shapes.slice(k, end).filter(near)
			for (const r of run) {
				if (r.sett) cobble(r)
				else stroke(r, COLORS[T.ROAD], r.w)
			}
			k = end - 1
		} else if (s.t === 'sett') {
			cobble(s)
		} else if (s.t === 'bike') {
			stroke(s, BIKE_LANE, s.w)
		} else if (s.t === 'track') {
			stroke(s, COLORS[T.CYCLEWAY], s.w)
		} else {
			if (s.t === T.SIDEWALK && s.w <= FOOTPATH && inPark(shapes, s)) {
				stroke(s, GRAVEL_EDGE, s.w + GRAVEL_EDGE_WIDTH)
				stroke(s, GRAVEL, s.w)
			} else stroke(s, paint(s.t), s.w)
		}
	}

	if (!watered) water()

	// Ground darkens towards every wall, then a dark contact line just outside
	// the plot, so the walls sit in the ground rather than float on it.
	// Buildings themselves are painted by their roofs in the 3D scene.
	const plots = new Path2D()
	for (const b of buildings) if (touches(area, b.rings, 2)) for (const r of b.rings) plots.addPath(ringPath([r]))
	// Geometry keeps its own colour; the alpha carries only wall contact shade.
	if (area.soft) g.globalCompositeOperation = 'destination-out'
	for (const [width, dark] of CONTACT_SHADE) {
		g.strokeStyle = `rgba(${CONTACT_COLOR}, ${dark})`
		g.lineWidth = width
		g.stroke(plots)
	}
	g.strokeStyle = INK
	g.lineWidth = PLOT_OUTLINE
	g.stroke(plots)
	return canvas
}

// Roofs, painted from the building outlines and laid over the tops of the
// 3D buildings. Each building picks a roof (tiles or slate) and gets flat
// two-tone shading split along its ridge, unless `pitched(n)` hands over the
// real roof the 3D scene builds, whose flat top is tar paper like every flat
// roof; plus the odd skylight. Returns the
// image and where the chimneys go: { x, y, n, angle, tone }, in tiles, the
// building's index, and radians.
const ROOFS = [
	{ base: '#a55f45', ridge: 1 },
	{ base: '#96553f', ridge: 1 },
	{ base: '#b06b4b', ridge: 1 },
	{ base: '#7f4f3f', ridge: 1 },
	{ base: '#858d92', ridge: 0 },
	{ base: '#6f787d', ridge: 0 },
]
const SHED_ROOF = { base: '#8a8b86', ridge: 0 }
// Flat roofs, and the flat tops of pitched ones, are tar paper: dark
// bitumen, a silver coat, or weathered grey. The roof shader adds the rest.
const TAR = ['#5b5f63', '#7b7f82', '#999d9f', '#66696c']

export const roofHash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007

// Mix towards white (t > 0) or black (t < 0), for the second roof tone.
function shade(hex, t) {
	const n = parseInt(hex.slice(1), 16)
	const to = t > 0 ? 255 : 0
	const k = Math.abs(t)
	const mix = (c) => Math.round(c + (to - c) * k)
	return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

// Which roof a building has: tiles or slate by a stable hash, sheds plain.
export function roofOf(b, n) {
	if (b.roof?.kind === 'measured') return ROOFS[Math.floor(roofHash(n) * 4)]
	return b.h <= 5 ? SHED_ROOF : ROOFS[Math.floor(roofHash(n) * ROOFS.length)]
}

// A building's outline as a path, its bounding box, and the direction of
// its longest wall.
const outlines = new WeakMap()
function outline(b) {
	let o = outlines.get(b)
	if (o) return o
	const path = new Path2D()
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
	}
	const [minX, minY, maxX, maxY] = boxOf(b.rings)
	o = { path, minX, minY, maxX, maxY, angle }
	outlines.set(b, o)
	return o
}

// Roof hatches stand on the tar, at spots fixed per building, clear of the
// roof's edge and its chimneys: { x, y, n, angle }. `pitch` is the pitched
// roof the 3D scene gives it, if any.
export function roofHatches(b, n, pitch) {
	if (!b.rings.length) return []
	// Where there's tar: all of a flat roof, or the flat top of a pitched one.
	let top = null
	if (pitch) {
		const tops = flatTops(pitch)
		if (!tops) return []
		// The 3D scene's y points north; outlines' point south.
		top = new Path2D()
		for (const r of tops) {
			r.forEach(([x, y], i) => (i ? top.lineTo(x, -y) : top.moveTo(x, -y)))
			top.closePath()
		}
	} else if (roofOf(b, n).ridge) return []
	const { path, minX, minY, maxX, maxY, angle } = outline(b)
	const onTar = (x, y) => contains(path, x, y, ROOF_PX) && (!top || contains(top, x, y, ROOF_PX))
	const stacks = roofSpots(b, n).filter((s) => s.chimney)
	const hatches = []
	let seed = n * 6151 + 17
	const rand = () => roofHash((seed += 104729))
	const tries = ((maxX - minX) * (maxY - minY)) / HATCH_AREA
	const m = HATCH_MARGIN
	for (let k = 0; k < tries; k++) {
		const x = minX + rand() * (maxX - minX)
		const y = minY + rand() * (maxY - minY)
		if (rand() > HATCH_SHARE) continue
		if (
			![
				[0, 0],
				[-m, -m],
				[m, -m],
				[-m, m],
				[m, m],
			].every(([dx, dy]) => onTar(x + dx, y + dy))
		)
			continue
		if (stacks.some((c) => Math.hypot(c.x - x, c.y - y) < 1.2)) continue
		hatches.push({ x, y, n, angle })
	}
	return hatches
}

// Chimneys and skylights, at spots fixed per building: { chimney, x, y, n,
// angle, tone } in tiles, the building's index, and radians, in the order
// they're tried. Chimneys stand up in the 3D scene; the roof image only
// gets their sooty footprint.
export function roofSpots(b, n) {
	if (!b.rings.length) return []
	const roof = roofOf(b, n)
	const { path, minX, minY, maxX, maxY, angle } = outline(b)
	const spots = []
	let seed = n * 7919
	const rand = () => roofHash((seed += 104729))
	const tries = ((maxX - minX) * (maxY - minY)) / ROOF_SPOT_AREA
	for (let k = 0; k < tries; k++) {
		const x = minX + rand() * (maxX - minX)
		const y = minY + rand() * (maxY - minY)
		if (!contains(path, x, y, ROOF_PX)) continue
		const inside = (dx, dy) => contains(path, x + dx, y + dy, ROOF_PX)
		if (b.h > 5 && rand() < CHIMNEY_SHARE && inside(-0.6, 0) && inside(0.6, 0) && inside(0, -0.6) && inside(0, 0.6)) {
			spots.push({ chimney: true, x, y, n, angle, tone: rand() })
		} else if (!roof.ridge && rand() < SKYLIGHT_SHARE) {
			spots.push({ chimney: false, x, y })
		}
	}
	return spots
}

// `area` as for the ground, plus `pick`, the buildings to paint, by index.
export function renderRoofImage(world, pitched = () => false, area = wholeMap(world, ROOF_PX)) {
	const { buildings } = world
	const RPX = area.px
	const canvas = newCanvas(Math.ceil(area.w * RPX), Math.ceil(area.h * RPX))
	const g = canvas.getContext('2d')
	g.scale(RPX, RPX)
	g.translate(-area.x, -area.y)
	g.lineJoin = 'round'
	const chimneys = []

	for (const n of area.pick ?? buildings.keys()) {
		const b = buildings[n]
		// No outline means an endless bounding box below, so skip it. Maps
		// built before build-map.js dropped these still have a few.
		if (!b.rings.length) continue
		const roof = roofOf(b, n)
		const { path, minX, minY, maxX, maxY, angle } = outline(b)

		const tar = TAR[Math.floor(roofHash(n + 77) * TAR.length)]
		const pitch = pitched(n)
		g.save()
		g.clip(path, 'evenodd')
		g.fillStyle = roof.ridge ? roof.base : tar
		g.fill(path, 'evenodd')
		const tops = pitch && flatTops(pitch)
		if (tops) {
			// The 3D scene's y points north; the image's points south.
			const top = new Path2D()
			for (const r of tops) {
				r.forEach(([x, y], i) => (i ? top.lineTo(x, -y) : top.moveTo(x, -y)))
				top.closePath()
			}
			g.fillStyle = tar
			g.fill(top, 'evenodd')
		}

		const cx = (minX + maxX) / 2
		const cy = (minY + maxY) / 2
		const reach = Math.hypot(maxX - minX, maxY - minY) / 2 + 1
		// A tiled roof left flat gets a painted ridge along the longest wall:
		// the half facing the south-west sun gets the lighter tone, the other
		// keeps the base. Pitched roofs in 3D take their light from the sun.
		const lit = 0.6 * Math.sin(angle) + 0.8 * Math.cos(angle)
		g.save()
		g.translate(cx, cy)
		g.rotate(angle)
		g.fillStyle = shade(roof.base, ROOF_TILE_TONE)
		if (roof.ridge && !pitch) {
			g.fillRect(-reach, lit > 0 ? 0 : -reach, reach * 2, reach)
			g.strokeStyle = RIDGE_INK
			g.lineWidth = RIDGE_WIDTH
			g.beginPath()
			g.moveTo(-reach, 0)
			g.lineTo(reach, 0)
			g.stroke()
		}
		g.restore()

		// Faint tile rows, running along the longest wall. Pitched roofs draw
		// their own, along each slope.
		if (roof.ridge && !pitch) {
			g.save()
			g.translate(cx, cy)
			g.rotate(angle)
			g.fillStyle = `rgba(0, 0, 0, ${ROOF_ROW_INK})`
			for (let y = -reach; y < reach; y += ROOF_ROW_STEP) g.fillRect(-reach, y, reach * 2, ROOF_ROW_WIDTH)
			g.restore()
		}

		for (const spot of roofSpots(b, n)) {
			const { x, y } = spot
			if (spot.chimney) {
				chimneys.push(spot)
				g.fillStyle = CHIMNEY_SOOT
				g.fillRect(x - 0.4, y - 0.4, 0.8, 0.8)
			} else {
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
	}
	return { canvas, chimneys }
}

// Painters need a roof's kind for its colour, never the city's survey mesh.
export const paintBuildings = (buildings) => buildings.map(({ rings, h, roof }) => ({ rings, h, roof: roof && { kind: roof.kind } }))
