import { nearestPlace } from './places.js'
import { note } from './perf.js'

const SIZE = 96
const CENTER = SIZE / 2
const RADIUS = 42
const RANGE = 45 // tiles, about 135 m from the player
const SCALE = RADIUS / RANGE
const INK = '#1a1e1b'

// Map y points south; an actor's zero heading points east.
export const radarRotation = (heading, chase) => (chase ? -heading - Math.PI / 2 : 0)

export function radarPoint(point, player, rotation) {
	const x = (point.x - player.x) * SCALE
	const y = (point.y - player.y) * SCALE
	const k = Math.min(1, (RADIUS - 5) / (Math.hypot(x, y) || 1))
	return { x: (x * Math.cos(rotation) - y * Math.sin(rotation)) * k, y: (x * Math.sin(rotation) + y * Math.cos(rotation)) * k }
}

export function createMinimap(world) {
	const canvas = document.createElement('canvas')
	canvas.id = 'minimap'
	canvas.width = canvas.height = SIZE
	canvas.hidden = true
	canvas.setAttribute('role', 'img')
	canvas.setAttribute('aria-label', 'Radar: gelber Pfeil = du, türkiser Punkt = nächster Ort')
	document.body.append(canvas)
	const ctx = canvas.getContext('2d')
	ctx.imageSmoothingEnabled = false
	const worker = new Worker(new URL('./minimap-worker.js', import.meta.url), { type: 'module' })
	let image = null
	let px = 1
	worker.onmessage = ({ data }) => {
		image = data.bitmap
		px = data.px
		worker.terminate()
	}
	worker.onerror = (error) => {
		console.error('Could not paint radar', error.message)
		worker.terminate()
	}
	worker.postMessage({ W: world.W, H: world.H, shapes: world.shapes, buildings: world.buildings })
	let next = 0
	// `gate` is the race's next gate, { x, y, label }, or null.
	return function update(player, chase, inside, gate) {
		const hidden = !!inside || !image
		if (canvas.hidden !== hidden) canvas.hidden = hidden
		const now = performance.now()
		if (hidden || now < next) return
		next = now + 100
		const heading = player.car?.angle ?? player.dir
		const rotation = radarRotation(heading, chase)
		ctx.clearRect(0, 0, SIZE, SIZE)
		ctx.save()
		ctx.translate(CENTER, CENTER)
		ctx.beginPath()
		ctx.arc(0, 0, RADIUS + 2, 0, Math.PI * 2)
		ctx.fillStyle = '#e7dfbd'
		ctx.fill()
		ctx.strokeStyle = INK
		ctx.lineWidth = 4
		ctx.stroke()
		ctx.save()
		ctx.beginPath()
		ctx.arc(0, 0, RADIUS, 0, Math.PI * 2)
		ctx.clip()
		ctx.rotate(rotation)
		ctx.scale(SCALE, SCALE)
		ctx.translate(-player.x, -player.y)
		// Cropping the cached image bounds the blit even for large picked areas.
		const reach = RANGE * Math.SQRT2
		const x = Math.max(0, player.x - reach)
		const y = Math.max(0, player.y - reach)
		const w = Math.min(world.W, player.x + reach) - x
		const h = Math.min(world.H, player.y + reach) - y
		if (w > 0 && h > 0) ctx.drawImage(image, x * px, y * px, w * px, h * px, x, y, w, h)
		// A future job route belongs here, in map coordinates below the markers.
		ctx.restore()

		const place = nearestPlace(world.pois, player.x, player.y, Infinity)
		if (place) {
			const point = radarPoint(place, player, rotation)
			ctx.beginPath()
			ctx.arc(point.x, point.y, 3, 0, Math.PI * 2)
			ctx.fillStyle = '#55e0cd'
			ctx.lineWidth = 2
			ctx.stroke()
			ctx.fill()
		}
		// The next race gate: its letter on a yellow badge, pinned to the rim
		// when it's out of range.
		if (gate) {
			const point = radarPoint(gate, player, rotation)
			ctx.beginPath()
			ctx.arc(point.x, point.y, 6, 0, Math.PI * 2)
			ctx.fillStyle = '#e8c21a'
			ctx.lineWidth = 2
			ctx.strokeStyle = INK
			ctx.fill()
			ctx.stroke()
			ctx.font = 'bold 8px monospace'
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.fillStyle = INK
			ctx.fillText(gate.label, point.x, point.y + 0.5)
		}
		// North moves round the rim when the map turns.
		ctx.font = 'bold 8px monospace'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.lineWidth = 3
		ctx.fillStyle = '#fff5d7'
		const nx = Math.sin(rotation) * (RADIUS - 5)
		const ny = -Math.cos(rotation) * (RADIUS - 5)
		ctx.strokeText('N', nx, ny)
		ctx.fillText('N', nx, ny)
		ctx.rotate(heading + rotation)
		ctx.beginPath()
		ctx.moveTo(6, 0)
		ctx.lineTo(-4, -4)
		ctx.lineTo(-2, 0)
		ctx.lineTo(-4, 4)
		ctx.closePath()
		ctx.fillStyle = '#ffe04b'
		ctx.lineWidth = 2
		ctx.stroke()
		ctx.fill()
		ctx.restore()
		note('minimap', performance.now() - now)
	}
}
