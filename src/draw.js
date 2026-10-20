// The flat layer over the 3D city, once per frame: Pfand, places, stops,
// traffic lights, street names, the player and anyone fleeing their car.
import { SOLID } from './tiles.js'
import { iconSprites, labelSprites, transitSprites, LABEL_PX } from './sprites.js'

const LAMPS = { red: '#ff3b2a', amber: '#ffb020', green: '#3ce36a' }

export function createRenderer(canvas, world) {
	const ctx = canvas.getContext('2d')
	const icons = iconSprites()
	const signs = transitSprites()
	const labels = labelSprites(world.labels.map((l) => l.name))

	function resize() {
		canvas.width = innerWidth * devicePixelRatio
		canvas.height = innerHeight * devicePixelRatio
	}
	addEventListener('resize', resize)
	resize()

	// `inside` a shop, only the player: the map's places, stops, names, walls
	// and the parked bike are all out on the street.
	return function draw({ cam, player, peds, lights, bottles, showStreetNames, showTransit, showWalls, inside }) {
		const { scale } = cam
		const toScreen = (x, y) => [x * scale - cam.x, y * scale - cam.y]
		const onScreen = (sx, sy, pad) => sx > -pad && sy > -pad && sx < canvas.width + pad && sy < canvas.height + pad

		ctx.clearRect(0, 0, canvas.width, canvas.height)

		// K: the walk grid as the game sees it, every solid tile in red, and
		// the player's footprint.
		if (showWalls) {
			ctx.fillStyle = 'rgba(255, 40, 40, 0.35)'
			const x0 = Math.max(0, Math.floor(cam.x / scale))
			const y0 = Math.max(0, Math.floor(cam.y / scale))
			const x1 = Math.min(world.W, Math.ceil((cam.x + canvas.width) / scale))
			const y1 = Math.min(world.H, Math.ceil((cam.y + canvas.height) / scale))
			for (let y = y0; y < y1; y++)
				for (let x = x0; x < x1; x++) if (SOLID.has(world.tileAt(x, y))) ctx.fillRect(...toScreen(x, y), scale, scale)
			ctx.strokeStyle = '#fff'
			ctx.lineWidth = 2
			const [px, py] = toScreen(player.x - 0.3, player.y - 0.3)
			ctx.strokeRect(px, py, scale * 0.6, scale * 0.6)
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

		const icon = Math.max(10 * devicePixelRatio, scale * 1.4)
		for (const p of inside ? [] : world.pois) {
			const [sx, sy] = toScreen(p.x, p.y)
			if (onScreen(sx, sy, icon)) ctx.drawImage(icons[p.kind], sx - icon / 2, sy - icon / 2, icon, icon)
		}

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

		if (player.onBike) drawBike(...toScreen(player.x, player.y), player.dir)
		else if (!inside) drawBike(...toScreen(player.bike.x, player.bike.y), 0)
		for (const p of peds) drawPerson(...toScreen(p.x, p.y), p.dir, '#5b8fd6')
		if (player.down) drawDown(...toScreen(player.x, player.y), player.dir)
		else if (!player.car) drawPerson(...toScreen(player.x, player.y), player.dir, '#f2d24b')

		function drawBike(sx, sy, dir) {
			ctx.save()
			ctx.translate(sx, sy)
			ctx.rotate(dir)
			ctx.fillStyle = '#d23c3c'
			ctx.fillRect(-scale * 0.6, -scale * 0.12, scale * 1.2, scale * 0.24)
			ctx.fillStyle = '#111'
			ctx.fillRect(-scale * 0.7, -scale * 0.08, scale * 0.25, scale * 0.16)
			ctx.fillRect(scale * 0.45, -scale * 0.08, scale * 0.25, scale * 0.16)
			ctx.restore()
		}

		// Flat on the tarmac, arms out.
		function drawDown(sx, sy, dir) {
			ctx.save()
			ctx.translate(sx, sy)
			ctx.rotate(dir)
			ctx.fillStyle = '#7a1414'
			ctx.beginPath()
			ctx.ellipse(0, 0, scale * 0.75, scale * 0.6, 0, 0, Math.PI * 2)
			ctx.globalAlpha = 0.5
			ctx.fill()
			ctx.globalAlpha = 1
			ctx.fillStyle = '#f2d24b'
			ctx.strokeStyle = '#222'
			ctx.lineWidth = scale * 0.08
			ctx.fillRect(-scale * 0.45, -scale * 0.1, scale * 0.9, scale * 0.2)
			ctx.fillRect(-scale * 0.1, -scale * 0.45, scale * 0.2, scale * 0.9)
			ctx.beginPath()
			ctx.arc(scale * 0.5, 0, scale * 0.16, 0, Math.PI * 2)
			ctx.fill()
			ctx.stroke()
			ctx.restore()
		}

		function drawPerson(sx, sy, dir, shirt) {
			ctx.fillStyle = shirt
			ctx.strokeStyle = '#222'
			ctx.lineWidth = scale * 0.08
			ctx.beginPath()
			ctx.arc(sx, sy, scale * 0.38, 0, Math.PI * 2)
			ctx.fill()
			ctx.stroke()
			ctx.fillStyle = '#222'
			ctx.beginPath()
			ctx.arc(sx + Math.cos(dir) * scale * 0.2, sy + Math.sin(dir) * scale * 0.2, scale * 0.08, 0, Math.PI * 2)
			ctx.fill()
		}
	}
}
