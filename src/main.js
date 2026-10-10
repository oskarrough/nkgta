import { T, COLORS, SOLID } from './tiles.js'

const PX = 4 // prerendered pixels per tile
const START = { lat: 52.4878, lon: 13.4318 } // Weserstraße

const ICONS = {
	spaeti: '🏪',
	doener: '🥙',
	imbiss: '🍟',
	cafe: '☕',
	bar: '🍺',
	restaurant: '🍽️',
	bikeshop: '🔧',
	supermarket: '🛒',
	bakery: '🥐',
	pharmacy: '💊',
	school: '🏫',
	kita: '🧸',
	playground: '🛝',
}
const LABELS = {
	spaeti: 'Späti',
	doener: 'Döner',
	imbiss: 'Imbiss',
	cafe: 'Café',
	bar: 'Bar',
	restaurant: 'Restaurant',
	bikeshop: 'Fahrradladen',
	supermarket: 'Supermarkt',
	bakery: 'Bäckerei',
	pharmacy: 'Apotheke',
	school: 'Schule',
	kita: 'Kita',
	playground: 'Spielplatz',
}

const map = await (await fetch('/map.json')).json()
const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const tiles = decode(map.tiles)
const streetOf = new Uint16Array(decode(map.streetOf).buffer)
const W = map.w
const H = map.h
const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.BUILDING : tiles[(y | 0) * W + (x | 0)])

// Prerender the whole neighbourhood once.
const world = document.createElement('canvas')
world.width = W * PX
world.height = H * PX
{
	const g = world.getContext('2d')
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const t = tiles[y * W + x]
			g.fillStyle = COLORS[t]
			g.fillRect(x * PX, y * PX, PX, PX)
			// Dark edge where a building meets anything else, so blocks read as blocks.
			if (t === T.BUILDING) {
				g.fillStyle = '#8f4a38'
				if (tileAt(x, y + 1) !== T.BUILDING) g.fillRect(x * PX, y * PX + PX - 1, PX, 1)
				if (tileAt(x + 1, y) !== T.BUILDING) g.fillRect(x * PX + PX - 1, y * PX, 1, PX)
			}
			if (t === T.SIDEWALK && tileAt(x, y + 1) === T.ROAD) {
				g.fillStyle = '#d8d2c6'
				g.fillRect(x * PX, y * PX + PX - 1, PX, 1)
			}
		}
	}
}

function nearestWalkable(x, y) {
	for (let r = 0; r < 50; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (tileAt(x + dx, y + dy) === T.SIDEWALK) return { x: (x | 0) + dx + 0.5, y: (y | 0) + dy + 0.5 }
			}
		}
	}
	return { x, y }
}

const latM = 111320
const lonM = 111320 * Math.cos((((map.bbox.north + map.bbox.south) / 2) * Math.PI) / 180)
const start = nearestWalkable(
	((START.lon - map.bbox.west) * lonM) / map.tileM,
	((map.bbox.north - START.lat) * latM) / map.tileM,
)

const player = { x: start.x, y: start.y, dir: 0, speed: 0, onBike: false }
const bike = { x: start.x + 1.2, y: start.y }
const bag = { bottles: 0, pending: 0, cents: 0 }
let lastStreet = ''
let toast = null

// Pfand bottles lying around on pavements and in parks.
const bottles = []
function spawnBottle() {
	for (let tries = 0; tries < 200; tries++) {
		const x = Math.random() * W
		const y = Math.random() * H
		const t = tileAt(x, y)
		if (t === T.SIDEWALK || t === T.GRASS || t === T.PLAYGROUND) {
			bottles.push({ x, y, can: Math.random() < 0.25 })
			return
		}
	}
}
for (let i = 0; i < 400; i++) spawnBottle()

const keys = new Set()
addEventListener('keydown', (e) => {
	if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
	keys.add(e.key)
	if (e.key === ' ' || e.key === 'Enter') toggleBike()
})
addEventListener('keyup', (e) => keys.delete(e.key))

function toggleBike() {
	if (player.onBike) {
		player.onBike = false
		bike.x = player.x
		bike.y = player.y
	} else if (Math.hypot(bike.x - player.x, bike.y - player.y) < 1.5) {
		player.onBike = true
	}
}

function update(dt) {
	let ix = 0
	let iy = 0
	if (keys.has('ArrowLeft')) ix--
	if (keys.has('ArrowRight')) ix++
	if (keys.has('ArrowUp')) iy--
	if (keys.has('ArrowDown')) iy++

	const here = tileAt(player.x, player.y)
	// Tiles per second. One tile is 3 m.
	let max = player.onBike ? 3.6 : 1.6
	if (player.onBike && (here === T.GRASS || here === T.GROUND)) max *= 0.55
	if (player.onBike && here === T.CYCLEWAY) max *= 1.2

	if (ix || iy) {
		const target = Math.atan2(iy, ix)
		let diff = target - player.dir
		diff = Math.atan2(Math.sin(diff), Math.cos(diff))
		player.dir += diff * Math.min(1, dt * (player.onBike ? 6 : 14))
		player.speed = Math.min(max, player.speed + dt * (player.onBike ? 4 : 12))
	} else {
		player.speed = Math.max(0, player.speed - dt * (player.onBike ? 3 : 14))
	}
	player.speed = Math.min(player.speed, max)

	const nx = player.x + Math.cos(player.dir) * player.speed * dt
	const ny = player.y + Math.sin(player.dir) * player.speed * dt
	const r = 0.3
	const free = (x, y) => !SOLID.has(tileAt(x - r, y - r)) && !SOLID.has(tileAt(x + r, y - r)) && !SOLID.has(tileAt(x - r, y + r)) && !SOLID.has(tileAt(x + r, y + r))
	if (free(nx, player.y)) player.x = nx
	else player.speed *= 0.5
	if (free(player.x, ny)) player.y = ny
	else player.speed *= 0.5

	const s = streetOf[(player.y | 0) * W + (player.x | 0)]
	if (s) lastStreet = map.streets[s]

	for (let i = bottles.length - 1; i >= 0; i--) {
		const b = bottles[i]
		if (Math.hypot(b.x - player.x, b.y - player.y) < 0.8 && bag.bottles < 30) {
			// Paid out at the Späti: 8 cents a bottle, 25 a can.
			bag.bottles++
			bag.pending += b.can ? 25 : 8
			bottles.splice(i, 1)
			setTimeout(spawnBottle, 20000)
		}
	}

	const spaeti = nearest('spaeti', 2)
	if (spaeti && bag.bottles) {
		bag.cents += bag.pending
		say(`${spaeti.name || 'Späti'}: ${bag.bottles} Flaschen, +${euro(bag.pending)}`)
		bag.bottles = 0
		bag.pending = 0
	}
	if (toast && (toast.t -= dt) < 0) toast = null
}

function nearest(kind, within) {
	let best = null
	let bestD = within
	for (const p of map.pois) {
		if (kind && p.kind !== kind) continue
		const d = Math.hypot(p.x - player.x, p.y - player.y)
		if (d < bestD) {
			best = p
			bestD = d
		}
	}
	return best
}

const euro = (c) => `€${(c / 100).toFixed(2).replace('.', ',')}`
const say = (text) => (toast = { text, t: 3 })

const canvas = document.querySelector('canvas')
const ctx = canvas.getContext('2d')
let zoom = 6
function resize() {
	canvas.width = innerWidth * devicePixelRatio
	canvas.height = innerHeight * devicePixelRatio
}
addEventListener('resize', resize)
resize()

function draw() {
	// GTA 1 zooms out as you speed up.
	const targetZoom = 6.5 - player.speed * 0.6
	zoom += (targetZoom - zoom) * 0.05
	const scale = PX * zoom * devicePixelRatio // screen pixels per tile
	const camX = player.x * scale - canvas.width / 2
	const camY = player.y * scale - canvas.height / 2
	const toScreen = (x, y) => [x * scale - camX, y * scale - camY]

	ctx.fillStyle = '#222'
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	ctx.imageSmoothingEnabled = false
	ctx.drawImage(world, -camX, -camY, world.width * zoom * devicePixelRatio, world.height * zoom * devicePixelRatio)

	for (const b of bottles) {
		const [sx, sy] = toScreen(b.x, b.y)
		if (sx < -20 || sy < -20 || sx > canvas.width + 20 || sy > canvas.height + 20) continue
		ctx.fillStyle = b.can ? '#c0c4c8' : '#3d7a3a'
		ctx.fillRect(sx - scale * 0.12, sy - scale * 0.3, scale * 0.24, scale * 0.6)
	}

	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.font = `${Math.round(scale * 1.2)}px system-ui`
	for (const p of map.pois) {
		const [sx, sy] = toScreen(p.x, p.y)
		if (sx < -40 || sy < -40 || sx > canvas.width + 40 || sy > canvas.height + 40) continue
		ctx.fillText(ICONS[p.kind], sx, sy)
	}

	if (!player.onBike) drawBike(bike.x, bike.y, 0)
	const [px, py] = toScreen(player.x, player.y)
	if (player.onBike) drawBike(player.x, player.y, player.dir)
	ctx.fillStyle = '#f2d24b'
	ctx.strokeStyle = '#222'
	ctx.lineWidth = scale * 0.08
	ctx.beginPath()
	ctx.arc(px, py, scale * 0.38, 0, Math.PI * 2)
	ctx.fill()
	ctx.stroke()
	ctx.fillStyle = '#222'
	ctx.beginPath()
	ctx.arc(px + Math.cos(player.dir) * scale * 0.2, py + Math.sin(player.dir) * scale * 0.2, scale * 0.08, 0, Math.PI * 2)
	ctx.fill()

	function drawBike(x, y, dir) {
		const [sx, sy] = toScreen(x, y)
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

	hud()
}

const $ = (id) => document.getElementById(id)
function hud() {
	$('street').textContent = lastStreet
	$('money').textContent = euro(bag.cents)
	$('bag').textContent = bag.bottles ? `🍾 ${bag.bottles}` : ''
	const p = nearest(null, 2.5)
	const nearBike = !player.onBike && Math.hypot(bike.x - player.x, bike.y - player.y) < 1.5
	$('place').textContent = toast?.text ?? (nearBike ? 'Space: aufs Fahrrad' : p ? `${ICONS[p.kind]} ${p.name || LABELS[p.kind]}` : '')
}

let last = performance.now()
function frame(now) {
	const dt = Math.min(0.05, (now - last) / 1000)
	last = now
	update(dt)
	draw()
	requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
