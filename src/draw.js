// The flat layer over the 3D city, once per frame: Pfand, places, stops,
// traffic lights and street names. People and the bike are in 3D, see
// actors.js.
import { SOLID } from './tiles.js'
import { badgeSprites, labelSprites, transitSprites, LABEL_PX } from './sprites.js'
import { DEPTH as AWNING_DEPTH } from './signs.js'
import { RADIUS } from './player.js'
import { drawMusicDebug } from './music-debug.js'

const LAMPS = { red: '#ff3b2a', amber: '#ffb020', green: '#3ce36a' }

// Badges, the classic map way: names when near, icons when far. A shop's
// awning carries its name, so its badge fades in only once you've zoomed out
// past where the awning reads (screen px per tile, before devicePixelRatio),
// and shrinks a little on the way. It stands on the pavement in front of the
// awning, never on it. Places without an awning always show theirs.
const BADGE = {
	fadeIn: 38, // awning names read well above this
	full: 25, // and the badge is all there below this
	size: [20, 26], // screen px, smallest and largest
	perTile: 0.9, // badge size per tile while between those
	shrink: 0.75, // size while it fades
	gap: 0.5, // tiles out past the awning's front edge
	apart: 0.9, // overlapping badges further than this many sizes apart are both drawn
	sparse: [12, 4], // below this many px per tile badges thin out, until at the second
	sparseApart: 3.5, // only one in this many sizes is left
}

export function createRenderer(canvas, world, shops = []) {
	const ctx = canvas.getContext('2d')
	const icons = badgeSprites()
	const signs = transitSprites()
	const labels = labelSprites(world.labels.map((l) => l.name))
	// Where each place's badge stands, and whether it hides behind an awning.
	const doors = new Map(shops.map((s) => [s.place, s]))
	const badges = world.pois.map((p) => {
		const s = doors.get(p)
		const out = AWNING_DEPTH + BADGE.gap
		return s ? { kind: p.kind, x: s.x + s.nx * out, y: s.y + s.ny * out, awning: true } : { kind: p.kind, x: p.x, y: p.y, awning: false }
	})

	function resize() {
		canvas.width = innerWidth * devicePixelRatio
		canvas.height = innerHeight * devicePixelRatio
	}
	addEventListener('resize', resize)
	resize()

	// `inside` a shop, only the player: the map's places, stops, names, walls
	// and the parked bike are all out on the street.
	return function draw({ cam, player, lights, bottles, showStreetNames, showTransit, showWalls, inside, music }) {
		const { scale } = cam
		const toScreen = (x, y) => [x * scale - cam.x, y * scale - cam.y]
		const onScreen = (sx, sy, pad) => sx > -pad && sy > -pad && sx < canvas.width + pad && sy < canvas.height + pad

		ctx.clearRect(0, 0, canvas.width, canvas.height)
		if (cam.third) return

		// K: the walk grid as the game sees it, every solid tile in red, and
		// (on top of everything, at the end) what the player hits walls with.
		// Drawn at the view centre's ground height, like everything here.
		if (showWalls) {
			ctx.fillStyle = 'rgba(255, 40, 40, 0.35)'
			const x0 = Math.max(0, Math.floor(cam.x / scale))
			const y0 = Math.max(0, Math.floor(cam.y / scale))
			const x1 = Math.min(world.W, Math.ceil((cam.x + canvas.width) / scale))
			const y1 = Math.min(world.H, Math.ceil((cam.y + canvas.height) / scale))
			for (let y = y0; y < y1; y++)
				for (let x = x0; x < x1; x++) if (SOLID.has(world.tileAt(x, y))) ctx.fillRect(...toScreen(x, y), scale, scale)
		}

		for (const b of bottles) {
			const [sx, sy] = toScreen(b.x, b.y)
			if (!onScreen(sx, sy, 20)) continue
			ctx.fillStyle = b.can ? '#c0c4c8' : '#3d7a3a'
			ctx.fillRect(sx - scale * 0.12, sy - scale * 0.3, scale * 0.24, scale * 0.6)
		}

		// Traffic lights: a dark box with the one lamp that's lit.
		const lamp = Math.max(4 * devicePixelRatio, scale * 0.3)
		for (const l of lights) {
			const [sx, sy] = toScreen(l.x, l.y)
			if (!onScreen(sx, sy, lamp * 2)) continue
			ctx.fillStyle = '#16181a'
			ctx.fillRect(sx - lamp, sy - lamp, lamp * 2, lamp * 2)
			ctx.fillStyle = LAMPS[l.state]
			ctx.beginPath()
			ctx.arc(sx, sy, lamp * 0.7, 0, Math.PI * 2)
			ctx.fill()
		}

		const perTile = scale / devicePixelRatio
		const size = Math.max(BADGE.size[0], Math.min(BADGE.size[1], perTile * BADGE.perTile)) * devicePixelRatio
		const t = Math.max(0, Math.min(1, (BADGE.fadeIn - perTile) / (BADGE.fadeIn - BADGE.full)))
		const fade = t * t * (3 - 2 * t)
		const placed = []
		// Zoomed far out, a badge on every shop would carpet the map.
		const thin = Math.max(0, Math.min(1, (BADGE.sparse[0] - perTile) / (BADGE.sparse[0] - BADGE.sparse[1])))
		const apart = BADGE.apart + (BADGE.sparseApart - BADGE.apart) * thin
		for (const b of inside ? [] : badges) {
			const alpha = b.awning ? fade : 1
			if (alpha <= 0) continue
			const [sx, sy] = toScreen(b.x, b.y)
			const s = b.awning ? size * (BADGE.shrink + (1 - BADGE.shrink) * fade) : size
			if (!onScreen(sx, sy, s)) continue
			// First come, first drawn: a badge on top of another is left out.
			if (placed.some(([px, py]) => Math.hypot(px - sx, py - sy) < s * apart)) continue
			placed.push([sx, sy])
			ctx.globalAlpha = alpha
			ctx.drawImage(icons[b.kind], sx - s / 2, sy - s / 2, s, s)
		}
		ctx.globalAlpha = 1

		if (showTransit && !inside) {
			const sign = Math.max(14 * devicePixelRatio, scale * 1.6)
			for (const t of world.transit ?? []) {
				const [sx, sy] = toScreen(t.x, t.y)
				if (onScreen(sx, sy, sign)) ctx.drawImage(signs[t.kind], sx - sign / 2, sy - sign / 2, sign, sign)
			}
		}

		if (showStreetNames && !inside) {
			const k = (13 / LABEL_PX) * devicePixelRatio
			for (const l of world.labels) {
				const [sx, sy] = toScreen(l.x, l.y)
				const c = labels[l.name]
				if (!onScreen(sx, sy, c.width * k)) continue
				const cos = Math.cos(l.angle) * k
				const sin = Math.sin(l.angle) * k
				ctx.setTransform(cos, sin, -sin, cos, sx, sy)
				ctx.drawImage(c, -c.width / 2, -c.height / 2)
			}
			ctx.setTransform(1, 0, 0, 1, 0, 0)
		}

		// K: a circle on foot, the car's box in one, over the player.
		if (showWalls) {
			ctx.strokeStyle = '#fff'
			ctx.lineWidth = 2
			const c = player.car
			ctx.save()
			ctx.translate(...toScreen(c?.x ?? player.x, c?.y ?? player.y))
			ctx.beginPath()
			if (c) {
				ctx.rotate(c.angle)
				ctx.rect((-c.model.length / 2) * scale, (-c.model.width / 2) * scale, c.model.length * scale, c.model.width * scale)
			} else ctx.arc(0, 0, RADIUS * scale, 0, Math.PI * 2)
			ctx.stroke()
			ctx.restore()
		}

		if (music && !inside) drawMusicDebug(ctx, music(), toScreen, scale)
	}
}
