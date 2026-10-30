import { paintBuildings } from './map-image.js'
import { note } from './perf.js'

const ACROSS = [450, 1500, Infinity] // metres across the screen: round you, the Kiez, the whole map
const EVERY = 160 // ms between redraws; the screen is an LCD, not a monitor
const INK = '#1f2d1b'
const BAR = 22 // px the goal bar takes off the map's bottom edge
const PAPER = [185, 207, 164] // the LCD, --lcd in pocket.css
const DARK = [31, 45, 27] // its ink

// The whole map, painted small once in a worker, then printed in the LCD's two
// colours, so each redraw is one cropped blit.
function lcdMap(world) {
	const painted = { image: null, px: 1 }
	const worker = new Worker(new URL('./minimap-worker.js', import.meta.url), { type: 'module' })
	worker.onmessage = ({ data }) => {
		worker.terminate()
		const { bitmap, px } = data
		const canvas = document.createElement('canvas')
		canvas.width = bitmap.width
		canvas.height = bitmap.height
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		ctx.drawImage(bitmap, 0, 0)
		bitmap.close()
		const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
		const d = image.data
		for (let i = 0; i < d.length; i += 4) {
			const lum = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255
			const t = Math.min(1, Math.max(0, (lum - 0.25) * 1.5)) * (d[i + 3] / 255)
			for (let c = 0; c < 3; c++) d[i + c] = DARK[c] + (PAPER[c] - DARK[c]) * (0.45 + 0.55 * t)
			d[i + 3] = 255
		}
		ctx.putImageData(image, 0, 0)
		painted.image = canvas
		painted.px = px
	}
	worker.onerror = (error) => {
		console.error('Could not paint the map', error.message)
		worker.terminate()
	}
	worker.postMessage({ W: world.W, H: world.H, shapes: world.shapes, buildings: paintBuildings(world.buildings) })
	return painted
}

// The pocket device's home screen: the map round you, turning with you in the
// chase camera, with the job and the next gate on it or pinned to its edge.
// Tap it to zoom out to the Kiez, the whole map, and back.
export function createPocketMap({ world, pocket }) {
	const page = document.createElement('div')
	page.className = 'app-map'
	page.innerHTML = '<canvas></canvas><p class="goal" hidden><b></b><em></em></p><small></small>'
	const canvas = page.querySelector('canvas')
	const label = page.querySelector('small')
	const goal = page.querySelector('.goal')
	const ctx = canvas.getContext('2d')
	const painted = lcdMap(world)
	const tileM = world.tileM ?? 3
	let zoom = 0
	let next = 0
	let state = null
	let goalKey = null

	pocket.add({
		id: 'map',
		page,
		tap() {
			zoom = (zoom + 1) % ACROSS.length
			next = 0
		},
		update() {
			const now = performance.now()
			if (now < next || !state) return
			next = now + EVERY
			draw()
			note('pocket map', performance.now() - now)
		},
	})

	function showGoal(job) {
		const key = job ? `${job.label}:${job.spilt}` : ''
		if (key === goalKey) return
		goalKey = key
		goal.hidden = !job
		if (!job) return
		goal.querySelector('b').textContent = job.label
		goal.querySelector('em').textContent = job.spilt ? `−${job.spilt} verschüttet` : ''
	}

	function draw() {
		const { at, heading, chase, gate, job } = state
		showGoal(job)
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		if (!w || !h) return
		const dpr = Math.min(2, devicePixelRatio || 1)
		if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
		if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr)
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.fillStyle = `rgb(${PAPER})`
		ctx.fillRect(0, 0, w, h)
		const whole = ACROSS[zoom] === Infinity
		const scale = whole ? Math.min(w / world.W, h / world.H) : w / (ACROSS[zoom] / tileM)
		const center = whole ? { x: world.W / 2, y: world.H / 2 } : at
		// Map y points south and a zero heading east; in the chase camera ahead is up.
		const turn = chase && !whole ? -heading - Math.PI / 2 : 0
		const cos = Math.cos(turn)
		const sin = Math.sin(turn)
		const toScreen = (p) => {
			const x = (p.x - center.x) * scale
			const y = (p.y - center.y) * scale
			return { x: w / 2 + x * cos - y * sin, y: h / 2 + x * sin + y * cos }
		}
		label.textContent = whole ? 'alles' : ACROSS[zoom] < 1000 ? `${ACROSS[zoom]} m` : `${ACROSS[zoom] / 1000} km`

		const { image, px } = painted
		if (image) {
			ctx.save()
			ctx.translate(w / 2, h / 2)
			ctx.rotate(turn)
			ctx.scale(scale, scale)
			ctx.translate(-center.x, -center.y)
			const reach = Math.hypot(w, h) / 2 / scale
			const x = Math.max(0, center.x - reach)
			const y = Math.max(0, center.y - reach)
			const cw = Math.min(world.W, center.x + reach) - x
			const ch = Math.min(world.H, center.y + reach) - y
			if (cw > 0 && ch > 0) ctx.drawImage(image, x * px, y * px, cw * px, ch * px, x, y, cw, ch)
			ctx.restore()
		}

		ctx.strokeStyle = INK
		ctx.fillStyle = INK
		ctx.lineWidth = 1.5
		if (job) {
			const near = job.hint && !whole && Math.hypot(job.hint.x - at.x, job.hint.y - at.y) * scale < Math.min(w, h) / 2
			if (near) {
				const p = toScreen(job.hint)
				ctx.setLineDash([2, 2])
				ctx.beginPath()
				ctx.arc(p.x, p.y, Math.max(5, job.hint.r * scale), 0, Math.PI * 2)
				ctx.stroke()
				ctx.setLineDash([])
			} else mark(job.job, pin(toScreen(job), w, h, BAR))
		}
		if (gate) {
			const p = pin(toScreen(gate), w, h, job ? BAR : 8)
			ctx.beginPath()
			ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = `rgb(${PAPER})`
			ctx.font = 'bold 8px monospace'
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.fillText(gate.label, p.x, p.y + 0.5)
			ctx.fillStyle = INK
		}
		if (turn) {
			const n = { x: w / 2 + Math.sin(turn) * (h / 2 - 7), y: h / 2 - Math.cos(turn) * (h / 2 - 7) }
			ctx.font = 'bold 8px monospace'
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.fillText('N', n.x, n.y)
		}
		const me = toScreen(at)
		ctx.save()
		ctx.translate(me.x, me.y)
		ctx.rotate(heading + turn)
		ctx.beginPath()
		ctx.moveTo(7, 0)
		ctx.lineTo(-4, -4.5)
		ctx.lineTo(-2, 0)
		ctx.lineTo(-4, 4.5)
		ctx.closePath()
		ctx.fillStyle = `rgb(${PAPER})`
		ctx.lineWidth = 3
		ctx.stroke()
		ctx.fillStyle = INK
		ctx.fill()
		ctx.restore()
	}

	// The kitchen as a bag, the door as a house, in a badge so they stand off the map.
	function mark(kind, p) {
		ctx.beginPath()
		ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
		ctx.fill()
		ctx.fillStyle = `rgb(${PAPER})`
		ctx.beginPath()
		if (kind === 'pickup') {
			ctx.fillRect(p.x - 3.5, p.y - 1, 7, 4.5)
			ctx.strokeStyle = `rgb(${PAPER})`
			ctx.lineWidth = 1.2
			ctx.arc(p.x, p.y - 1, 1.8, Math.PI, 0)
			ctx.stroke()
			ctx.strokeStyle = INK
		} else {
			ctx.moveTo(p.x, p.y - 4.5)
			ctx.lineTo(p.x + 4, p.y - 0.5)
			ctx.lineTo(p.x + 4, p.y + 3.5)
			ctx.lineTo(p.x - 4, p.y + 3.5)
			ctx.lineTo(p.x - 4, p.y - 0.5)
			ctx.closePath()
			ctx.fill()
		}
		ctx.fillStyle = INK
	}

	return {
		// Each frame: where you are (`at`, the street even from inside a shop),
		// which way you face, the camera, and what you're heading for.
		follow(now) {
			state = now
		},
	}
}

// Off the screen, a mark sits on its edge, in the direction it lies.
function pin(p, w, h, below = 8, inset = 8) {
	const dx = p.x - w / 2
	const dy = p.y - h / 2
	const k = Math.min(1, (w / 2 - inset) / (Math.abs(dx) || 1e-9), (h / 2 - (dy > 0 ? below : inset)) / (Math.abs(dy) || 1e-9))
	return { x: w / 2 + dx * k, y: h / 2 + dy * k }
}
