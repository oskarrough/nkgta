// The lie of the land under the default area, from Berlin's elevation
// model (ATKIS DGM1: bare ground, no buildings or trees, one height a metre
// in 2 × 2 km tiles, DL-DE-Zero-2.0), into public/terrain.json. Tiles are
// downloaded once into data/dgm/. Canals, the Ringbahn cutting and other
// narrow dips are filled to their banks, since the game crosses them on
// bridges, and railway embankments shaved off, since the game's streets
// run under them; then the rest is smoothed into gentle rises.
// Usage: bun scripts/build-terrain.js [--debug]
import { BBOX, TILE_M } from '../src/default-area.js'
import { CELL } from '../src/terrain.js'
import { toBase64 } from '../src/map-codec.js'
import { toUtm33 } from '../src/utm.js'

const FEED = 'https://gdi.berlin.de/data/dgm1/atom/'
const FILL_M = 30 // dips and ridges narrower than about twice this go
const SMOOTH_M = 20 // then a blur this wide, a standard deviation
const DEBUG = process.argv.includes('--debug')

// The map's tile grid, as build-map.js and world.js lay it out.
const lonM = 111320 * Math.cos((((BBOX.north + BBOX.south) / 2) * Math.PI) / 180)
const W = Math.ceil(((BBOX.east - BBOX.west) * lonM) / TILE_M)
const H = Math.ceil(((BBOX.north - BBOX.south) * 111320) / TILE_M)
const latLonOf = (x, y) => ({ lat: BBOX.north - (y * TILE_M) / 111320, lon: BBOX.west + (x * TILE_M) / lonM })

// Every DGM tile the map touches, by the kilometre of its south-west corner.
const corners = [
	[BBOX.south, BBOX.west],
	[BBOX.south, BBOX.east],
	[BBOX.north, BBOX.west],
	[BBOX.north, BBOX.east],
].map(([lat, lon]) => toUtm33(lat, lon))
const e0 = Math.floor(Math.min(...corners.map((c) => c.e)) / 2000) * 2000
const e1 = Math.ceil(Math.max(...corners.map((c) => c.e)) / 2000) * 2000
const n0 = Math.floor(Math.min(...corners.map((c) => c.n)) / 2000) * 2000
const n1 = Math.ceil(Math.max(...corners.map((c) => c.n)) / 2000) * 2000

// One metre per cell, south-west corner at (e0, n0). NaN where there's no data.
const MW = e1 - e0
const MH = n1 - n0
const dgm = new Float32Array(MW * MH).fill(NaN)
for (let e = e0; e < e1; e += 2000) {
	for (let n = n0; n < n1; n += 2000) {
		const name = `DGM1_${e / 1000}_${n / 1000}.zip`
		const file = Bun.file(`data/dgm/${name}`)
		if (!(await file.exists())) {
			console.log(`Downloading ${name}`)
			const res = await fetch(FEED + name)
			if (!res.ok) throw new Error(`${name}: ${res.status}`)
			await Bun.write(file, res)
		}
		const unzip = Bun.spawn(['unzip', '-p', `data/dgm/${name}`])
		const text = await new Response(unzip.stdout).text()
		let count = 0
		for (let i = 0; i < text.length;) {
			const end = text.indexOf('\n', i)
			const line = text.slice(i, end < 0 ? text.length : end)
			i = end < 0 ? text.length : end + 1
			const [x, y, z] = line.trim().split(/\s+/).map(Number)
			if (!Number.isFinite(z)) continue
			const col = Math.floor(x - e0)
			const row = Math.floor(y - n0)
			if (col < 0 || row < 0 || col >= MW || row >= MH) continue
			dgm[row * MW + col] = z
			count++
		}
		console.log(`${name}: ${count} heights`)
	}
}

// The average of the metre cells under each map tile.
const half = TILE_M / 2
let grid = new Float32Array(W * H)
for (let y = 0; y < H; y++) {
	for (let x = 0; x < W; x++) {
		const { lat, lon } = latLonOf(x + 0.5, y + 0.5)
		const { e, n } = toUtm33(lat, lon)
		let sum = 0
		let k = 0
		for (let r = Math.floor(n - n0 - half); r < n - n0 + half; r++) {
			for (let c = Math.floor(e - e0 - half); c < e - e0 + half; c++) {
				const z = dgm[r * MW + c]
				if (Number.isFinite(z)) {
					sum += z
					k++
				}
			}
		}
		grid[y * W + x] = k ? sum / k : NaN
	}
}
// Gaps, if any, take the average of what's there.
let sum = 0
let k = 0
for (const z of grid) if (Number.isFinite(z)) ((sum += z), k++)
for (let i = 0; i < grid.length; i++) if (!Number.isFinite(grid[i])) grid[i] = sum / k
if (DEBUG) await image(grid, W, H, 'data/terrain-raw.png')

// Fill: the highest within FILL_M, then the lowest of that, so dips
// narrower than the window go. Then shave: the same the other way round,
// for ridges. Hills and hollows wider than that stay.
const r = Math.round(FILL_M / TILE_M)
grid = slide(slide(grid, W, H, r, Math.max), W, H, r, Math.min)
grid = slide(slide(grid, W, H, r, Math.min), W, H, r, Math.max)
if (DEBUG) await image(grid, W, H, 'data/terrain-filled.png')
grid = blur(grid, W, H, SMOOTH_M / TILE_M)
if (DEBUG) await image(grid, W, H, 'data/terrain.png')

// Down to one height every CELL tiles, corners included, in centimetres
// over the lowest.
const cw = Math.ceil(W / CELL) + 1
const ch = Math.ceil(H / CELL) + 1
let low = Infinity
let high = -Infinity
for (const z of grid) ((low = Math.min(low, z)), (high = Math.max(high, z)))
const cm = new Uint16Array(cw * ch)
for (let y = 0; y < ch; y++) {
	for (let x = 0; x < cw; x++) {
		const z = grid[Math.min(H - 1, y * CELL) * W + Math.min(W - 1, x * CELL)]
		cm[y * cw + x] = Math.round((z - low) * 100)
	}
}
await Bun.write(
	'public/terrain.json',
	JSON.stringify({
		source: 'ATKIS DGM1 Berlin, Geoportal Berlin, dl-de/zero-2-0',
		bbox: BBOX,
		tileM: TILE_M,
		cell: CELL,
		w: cw,
		h: ch,
		base: Math.round(low * 100) / 100,
		cm: toBase64(new Uint8Array(cm.buffer)),
	}),
)
console.log(`${cw}×${ch} heights, ${low.toFixed(1)}–${high.toFixed(1)} m`)

// The max or min over a square 2r+1 a side, a row then a column at a time.
function slide(src, w, h, r, pick) {
	const pass = (from, n, len, at) => {
		const out = new Float32Array(from.length)
		const line = new Float32Array(len)
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < len; j++) line[j] = from[at(i, j)]
			for (let j = 0; j < len; j++) {
				let v = line[j]
				for (let d = Math.max(0, j - r); d <= Math.min(len - 1, j + r); d++) v = pick(v, line[d])
				out[at(i, j)] = v
			}
		}
		return out
	}
	const rows = pass(src, h, w, (y, x) => y * w + x)
	return pass(rows, w, h, (x, y) => y * w + x)
}

// A gaussian blur, a row then a column at a time, the edges held.
function blur(src, w, h, sigma) {
	const r = Math.ceil(sigma * 3)
	const kernel = Array.from({ length: r * 2 + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)))
	const total = kernel.reduce((a, b) => a + b)
	const pass = (from, n, len, at) => {
		const out = new Float32Array(from.length)
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < len; j++) {
				let v = 0
				for (let d = -r; d <= r; d++) v += kernel[d + r] * from[at(i, Math.max(0, Math.min(len - 1, j + d)))]
				out[at(i, j)] = v / total
			}
		}
		return out
	}
	const rows = pass(src, h, w, (y, x) => y * w + x)
	return pass(rows, w, h, (x, y) => y * w + x)
}

// A shaded relief to look at, through ImageMagick.
async function image(src, w, h, path) {
	await Bun.write(path.replace('.png', '.f32'), src)
	let lo = Infinity
	let hi = -Infinity
	for (const z of src) ((lo = Math.min(lo, z)), (hi = Math.max(hi, z)))
	const px = new Uint8Array(w * h * 3)
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x
			const shade = Math.max(0, Math.min(1, 0.5 + (src[i - 1] - src[i + 1] + (src[i - w] - src[i + w])) * 0.5))
			const t = (src[i] - lo) / (hi - lo)
			px[i * 3] = 255 * (0.25 + 0.5 * t) * (0.4 + shade * 0.6)
			px[i * 3 + 1] = 255 * (0.3 + 0.4 * (1 - t)) * (0.4 + shade * 0.6)
			px[i * 3 + 2] = 255 * (0.2 + 0.2 * t) * (0.4 + shade * 0.6)
		}
	}
	await Bun.write(`${path}.rgb`, px)
	Bun.spawnSync(['magick', '-size', `${w}x${h}`, '-depth', '8', `rgb:${path}.rgb`, path])
	Bun.spawnSync(['rm', `${path}.rgb`])
}
