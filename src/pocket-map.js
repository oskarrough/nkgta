import { mapImage } from './minimap.js'

const ACROSS = [1000, Infinity] // metres across the screen: the Kiez round you, or the whole map
const INK = '#1f2d1b'

// The map app on the pocket device: north up, you in the middle, the job and
// the next gate on it or pinned to its edge. Tap for the whole map and back.
export function createPocketMap({ world, player, pocket, targets }) {
	const page = document.createElement('div')
	page.className = 'app-map'
	page.innerHTML = '<canvas></canvas><small></small>'
	const canvas = page.querySelector('canvas')
	const label = page.querySelector('small')
	const ctx = canvas.getContext('2d')
	const painted = mapImage(world)
	const tileM = world.tileM ?? 3
	let zoom = 0
	let next = 0

	pocket.add({
		id: 'map',
		icon: 'menu-area',
		label: 'Karte',
		page,
		tap() {
			zoom = (zoom + 1) % ACROSS.length
			next = 0
		},
		update() {
			const now = performance.now()
			if (now < next) return
			next = now + 150
			draw()
		},
	})

	function draw() {
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		if (!w || !h) return
		const dpr = devicePixelRatio || 1
		if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
		if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr)
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.fillStyle = getComputedStyle(page).getPropertyValue('--lcd')
		ctx.fillRect(0, 0, w, h)
		const whole = ACROSS[zoom] === Infinity
		const scale = whole ? Math.min(w / world.W, h / world.H) : w / (ACROSS[zoom] / tileM)
		const cx = whole ? world.W / 2 : player.x
		const cy = whole ? world.H / 2 : player.y
		const at = (p) => ({ x: w / 2 + (p.x - cx) * scale, y: h / 2 + (p.y - cy) * scale })
		label.textContent = whole ? 'ganze Karte' : `${ACROSS[zoom] / 1000} km`

		const { image, px } = painted
		if (image) {
			ctx.save()
			ctx.filter = 'grayscale(1) brightness(1.4) contrast(0.8)'
			ctx.globalCompositeOperation = 'multiply'
			ctx.globalAlpha = 0.6
			ctx.imageSmoothingEnabled = true
			const o = at({ x: 0, y: 0 })
			ctx.drawImage(image, 0, 0, world.W * px, world.H * px, o.x, o.y, world.W * scale, world.H * scale)
			ctx.restore()
		}

		const { gate, job } = targets()
		ctx.strokeStyle = INK
		ctx.fillStyle = INK
		ctx.lineWidth = 1.5
		if (job) {
			const p = pin(at(job.hint && !whole ? job.hint : job), w, h)
			if (job.hint && !whole && !p.pinned) {
				ctx.setLineDash([2, 2])
				ctx.beginPath()
				ctx.arc(p.x, p.y, Math.max(4, job.hint.r * scale), 0, Math.PI * 2)
				ctx.stroke()
				ctx.setLineDash([])
			} else if (job.job === 'pickup') {
				ctx.fillRect(p.x - 4, p.y - 3, 8, 6)
				ctx.strokeRect(p.x - 2, p.y - 5.5, 4, 3)
			} else {
				ctx.beginPath()
				ctx.moveTo(p.x, p.y - 5)
				ctx.lineTo(p.x + 4.5, p.y - 1)
				ctx.lineTo(p.x + 4.5, p.y + 4)
				ctx.lineTo(p.x - 4.5, p.y + 4)
				ctx.lineTo(p.x - 4.5, p.y - 1)
				ctx.closePath()
				ctx.fill()
			}
		}
		if (gate) {
			const p = pin(at(gate), w, h)
			ctx.beginPath()
			ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
			ctx.stroke()
			ctx.font = 'bold 7px monospace'
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.fillText(gate.label, p.x, p.y + 0.5)
		}
		const me = at(player)
		ctx.save()
		ctx.translate(me.x, me.y)
		ctx.rotate(player.car?.angle ?? player.dir)
		ctx.beginPath()
		ctx.moveTo(6, 0)
		ctx.lineTo(-4, -4)
		ctx.lineTo(-2, 0)
		ctx.lineTo(-4, 4)
		ctx.closePath()
		ctx.fill()
		ctx.restore()
	}
}

// Off the screen, a mark sits on its edge, in the direction it lies.
function pin(p, w, h, inset = 6) {
	const dx = p.x - w / 2
	const dy = p.y - h / 2
	const k = Math.min(1, (w / 2 - inset) / (Math.abs(dx) || 1e-9), (h / 2 - inset) / (Math.abs(dy) || 1e-9))
	return { x: w / 2 + dx * k, y: h / 2 + dy * k, pinned: k < 1 }
}
