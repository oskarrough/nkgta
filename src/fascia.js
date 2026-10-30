// The strip of shop signs along a Berlin street: every shopfront's name on a
// board on the wall above its windows, readable from the pavement, in its
// chain's colours or the Kiez's usual ones, lit at night while it's open.
// The overhead view sees walls edge on, so it reads the awnings (signs.js).
// One atlas and one draw for a chunk's boards, each board a thin box.
import * as THREE from 'three'
import { POSTER_FONT } from './poster.js'
import { frontsOf } from './fronts.js'
import { openAttribute } from './front-panels.js'

// Chains by brand or name: what the board says, its colour, the lettering,
// and a stripe along the bottom in a third colour.
const SANS = '"Helvetica Neue", Arial, system-ui, sans-serif'
const CHAINS = [
	[/^rossmann/i, 'ROSSMANN', '#d6001c', '#ffffff'],
	[/^dm(\b|-)/i, 'dm', '#ffffff', '#21418f', '#f5b800'],
	[/^bio company/i, 'BIO COMPANY', '#2e6b39', '#ffffff', '#c8d400'],
	[/^denn'?s/i, "denn's BioMarkt", '#5d9b35', '#ffffff'],
	[/^lidl/i, 'LIDL', '#0050aa', '#fff000', '#e60a14'],
	[/^netto/i, 'Netto', '#ffe500', '#e2001a'],
	[/^aldi( |$)/i, 'ALDI', '#00205b', '#ffffff', '#20a0e0'],
	[/^edeka/i, 'EDEKA', '#ffd400', '#1a4593'],
	[/^penny/i, 'PENNY', '#cd1414', '#ffffff', '#ffd600'],
	[/^rewe/i, 'REWE', '#cc071e', '#ffffff'],
	[/^kaufland/i, 'Kaufland', '#e10915', '#ffffff'],
	[/sparkasse/i, 'Sparkasse', '#ff0000', '#ffffff'],
	[/volksbank/i, 'Berliner Volksbank', '#ffffff', '#0066b3', '#ff6600'],
	[/^commerzbank/i, 'COMMERZBANK', '#ffffff', '#002e3c', '#ffcc00'],
	[/^(deutsche post|post( |$)|postfiliale)/i, 'Deutsche Post', '#ffcc00', '#1a1a1a'],
	[/^dhl/i, 'DHL', '#ffcc00', '#d40511'],
	[/^mcdonald/i, "McDonald's", '#da291c', '#ffc72c'],
	[/^domino/i, "Domino's", '#006491', '#ffffff', '#e31837'],
	[/^(o2|o₂)\b/i, 'o2', '#0019a5', '#ffffff'],
	[/telekom/i, 'Telekom', '#e20074', '#ffffff'],
	[/^vodafone/i, 'vodafone', '#e60000', '#ffffff'],
	[/^h&m/i, 'H&M', '#ffffff', '#e50010'],
	[/^tk maxx/i, 'TK Maxx', '#ffffff', '#c8102e'],
	[/^media ?markt/i, 'MediaMarkt', '#df0000', '#ffffff'],
	[/^tipico/i, 'tipico', '#c8102e', '#ffffff'],
]
// Everyone else in the Kiez's usual colours by what they sell, the board
// picked by a hash of the name: food red and yellow, cafés brown and cream,
// bars black and gold, Apotheke green, Spätis navy.
const KINDS = {
	fast_food: [
		['#c8102e', '#ffd200'],
		['#ffd200', '#c8102e'],
		['#1d1d1b', '#ffd200'],
		['#1f5d3a', '#ffffff'],
	],
	restaurant: [
		['#6b1d1d', '#f3e6cf'],
		['#1d1d1b', '#ffffff'],
		['#1f5d3a', '#ffffff'],
		['#ffffff', '#c8102e'],
	],
	cafe: [
		['#3b2a20', '#f3e6cf'],
		['#f3e6cf', '#3b2a20'],
		['#1d1d1b', '#ffffff'],
	],
	bar: [
		['#141414', '#e8b84a'],
		['#141414', '#e24b6a'],
		['#2b1d3a', '#f3e6cf'],
	],
	bakery: [
		['#f4ead2', '#7a3b1d'],
		['#7a3b1d', '#f4ead2'],
	],
	pharmacy: [['#0b7a3e', '#ffffff', '#e3000f']],
	bank: [['#14325c', '#ffffff']],
	kiosk: [
		['#14213d', '#ffd60a'],
		['#1d1d1b', '#ffffff'],
		['#c8102e', '#ffffff'],
	],
	hairdresser: [
		['#111111', '#d8c08a'],
		['#ffffff', '#111111'],
	],
	mobile_phone: [
		['#ffffff', '#0047ab'],
		['#0047ab', '#ffffff'],
		['#d21f1f', '#ffffff'],
	],
	jewelry: [['#111111', '#d4af37']],
	florist: [['#2f5d34', '#ffffff']],
}
const SAME = {
	pub: 'bar',
	nightclub: 'bar',
	ice_cream: 'cafe',
	pastry: 'bakery',
	confectionery: 'bakery',
	convenience: 'kiosk',
	beauty: 'hairdresser',
	barber: 'hairdresser',
	telecommunication: 'mobile_phone',
	mobile_phone_accessories: 'mobile_phone',
	butcher: 'restaurant',
	deli: 'restaurant',
	greengrocer: 'florist',
	bureau_de_change: 'bank',
	money_transfer: 'bank',
}
const KIEZ = [
	['#1f5d3a', '#ffffff'],
	['#ffffff', '#c8102e'],
	['#c8102e', '#ffffff'],
	['#1d1d1b', '#ffd200'],
	['#14325c', '#ffffff'],
	['#ffd200', '#1d1d1b'],
	['#ffffff', '#14325c'],
	['#6b1d1d', '#f3e6cf'],
]

// The board on the ground floor, between the shop windows' tops and the
// first-floor sills, above the awnings: heights in tiles over the house's
// foot, how far it stands out from the wall, and its atlas pixels.
const BOARD = [1.17, 1.4]
const OUT = [0.01, 0.06]
const CELL = 64 // atlas pixels across the board's height
const PX = CELL / (BOARD[1] - BOARD[0]) // atlas pixels a tile
const TYPE = CELL * 0.78
const ATLAS_W = 2048
const GLOW = 0.8 // how much of its colour a lit board shines at night
const unpacked = new WeakMap()

function createFascia(world, chunk, gradient, night, opening) {
	if (!unpacked.has(world)) unpacked.set(world, frontsOf(world))
	const mine = unpacked
		.get(world)
		.filter((f) => f.name && f.x >= chunk.x && f.y >= chunk.y && f.x < chunk.x + chunk.w && f.y < chunk.y + chunk.h)
	const group = new THREE.Group()
	const measure = document.createElement('canvas').getContext('2d')
	let batch = []
	let x = 0
	let y = 0
	for (const f of mine) {
		const look = lookOf(f)
		measure.font = look.font
		const textW = measure.measureText(look.text).width
		const w = Math.max(CELL, Math.min(ATLAS_W, Math.ceil(textW + CELL * 0.8), Math.round(f.half * 2 * PX)))
		if (x + w > ATLAS_W) [x, y] = [0, y + CELL]
		if (y + CELL > ATLAS_W) {
			group.add(boards(world, batch, gradient, night, opening))
			;[batch, x, y] = [[], 0, 0]
		}
		batch.push({ f, look, cell: { x, y, w } })
		x += w
	}
	if (batch.length) group.add(boards(world, batch, gradient, night, opening))
	return group
}

function boards(world, batch, gradient, night, opening) {
	const canvas = document.createElement('canvas')
	canvas.width = ATLAS_W
	canvas.height = Math.max(...batch.map((b) => b.cell.y)) + CELL
	const g = canvas.getContext('2d', { willReadFrequently: true })
	for (const { look, cell } of batch) paint(g, cell, look)

	const pos = []
	const uv = []
	const tone = []
	const ranges = []
	for (const { f, cell } of batch) {
		const b = world.buildings[f.n]
		const h = b.h / world.tileM
		const foot = base(world, f.n)
		const z0 = foot + Math.min(BOARD[0], h * 0.68)
		const z1 = foot + Math.min(BOARD[1], h * 0.9)
		// Scene coordinates, y north: out from the wall, and to the right as
		// you face it from the pavement.
		const n = [f.nx, -f.ny]
		const r = [f.ny, f.nx]
		const c = [f.x, -f.y]
		const at = (s, out, z) => [c[0] + r[0] * s + n[0] * out, c[1] + r[1] * s + n[1] * out, z]
		const u = (px) => (cell.x + px) / canvas.width
		const v = (py) => 1 - (cell.y + py) / canvas.height
		const plain = [u(2), v(CELL / 2)]
		const k = pos.length / 3
		const quad = (corners, uvs) => {
			for (const i of [0, 1, 2, 0, 2, 3]) {
				pos.push(...corners[i])
				uv.push(...(uvs?.[i] ?? plain))
			}
		}
		const half = f.half
		const text = Math.min(half, cell.w / PX / 2)
		const front = (s0, s1, u0, u1) =>
			quad(
				[at(s0, OUT[1], z0), at(s1, OUT[1], z0), at(s1, OUT[1], z1), at(s0, OUT[1], z1)],
				[
					[u0, v(CELL)],
					[u1, v(CELL)],
					[u1, v(0)],
					[u0, v(0)],
				],
			)
		front(-text, text, u(0), u(cell.w))
		if (text < half) {
			front(-half, -text, u(2), u(2))
			front(text, half, u(cell.w - 2), u(cell.w - 2))
		}
		quad([at(-half, OUT[0], z1), at(-half, OUT[1], z1), at(half, OUT[1], z1), at(half, OUT[0], z1)])
		quad([at(-half, OUT[0], z0), at(half, OUT[0], z0), at(half, OUT[1], z0), at(-half, OUT[1], z0)])
		quad([at(-half, OUT[0], z0), at(-half, OUT[1], z0), at(-half, OUT[1], z1), at(-half, OUT[0], z1)])
		quad([at(half, OUT[1], z0), at(half, OUT[0], z0), at(half, OUT[0], z1), at(half, OUT[1], z1)])
		ranges.push([f, k, pos.length / 3])
		const avg = average(g, cell)
		for (let i = k; i < pos.length / 3; i++) {
			tone.push(avg.r, avg.g, avg.b)
		}
	}

	const tex = new THREE.CanvasTexture(canvas)
	tex.colorSpace = THREE.SRGBColorSpace
	tex.anisotropy = 8
	const geo = new THREE.BufferGeometry()
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
	geo.setAttribute('tone', new THREE.Float32BufferAttribute(tone, 3))
	openAttribute(geo, ranges, opening)
	geo.computeVertexNormals()
	const material = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient })
	material.onBeforeCompile = (shader) => {
		shader.uniforms.night = night
		shader.vertexShader =
			'attribute float isOpen;\nattribute vec3 tone;\nvarying vec3 vTone;\nvarying float vOpen;\n' +
			shader.vertexShader.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
				vTone = tone;
				vOpen = isOpen;`,
			)
		shader.fragmentShader =
			`uniform float night;\nvarying vec3 vTone;\nvarying float vOpen;\n` +
			shader.fragmentShader
				.replace(
					'#include <map_fragment>',
					`#include <map_fragment>
				// Once the board is a pixel or two high, its average colour, so
				// neither the letters nor the atlas round them can sparkle.
				vec2 texels = fwidth(vMapUv) * vec2(${canvas.width.toFixed(1)}, ${canvas.height.toFixed(1)});
				float tall = ${CELL.toFixed(1)} / max(max(texels.x, texels.y), 0.0001);
				diffuseColor.rgb = mix(vTone, diffuseColor.rgb, smoothstep(1.5, 4.0, tall));`,
				)
				.replace(
					'#include <emissivemap_fragment>',
					`#include <emissivemap_fragment>
				totalEmissiveRadiance += diffuseColor.rgb * vOpen * step(0.05, night) * night * ${GLOW.toFixed(2)};`,
				)
	}
	const mesh = new THREE.Mesh(geo, material)
	mesh.receiveShadow = true
	return mesh
}

function paint(g, { x, y, w }, look) {
	g.save()
	g.translate(x, y)
	g.fillStyle = look.bg
	g.fillRect(0, 0, w, CELL)
	if (look.stripe) {
		g.fillStyle = look.stripe
		g.fillRect(0, CELL * 0.84, w, CELL * 0.16)
	}
	g.font = look.font
	g.textAlign = 'center'
	g.textBaseline = 'middle'
	g.fillStyle = look.fg
	const tw = g.measureText(look.text).width
	g.translate(w / 2, CELL * (look.stripe ? 0.44 : 0.52))
	g.scale(Math.min(1, (w - CELL * 0.5) / tw), 1)
	g.fillText(look.text, 0, 0)
	g.restore()
}

function lookOf(f) {
	for (const [match, text, bg, fg, stripe] of CHAINS) {
		if (match.test(f.brand) || match.test(f.name)) return { text, bg, fg, stripe, font: `700 ${TYPE}px ${SANS}` }
	}
	const h = hash(f.name)
	const kind = SAME[f.kind] ?? f.kind
	const palette = KINDS[kind] ?? KIEZ
	const [bg, fg, stripe] = palette[h % palette.length]
	// Most of the Kiez letters its boards in heavy narrow capitals, some in plain bold.
	const font = h % 3 ? `900 ${TYPE * 1.05}px ${POSTER_FONT}` : `700 ${TYPE * 0.9}px ${SANS}`
	return { text: f.name.toUpperCase(), bg, fg, stripe, font }
}

// What the board looks like from far off: its pixels averaged, in linear light.
function average(g, { x, y, w }) {
	const { data } = g.getImageData(x, y, w, CELL)
	const sum = [0, 0, 0]
	let count = 0
	for (let i = 0; i < data.length; i += 4 * 3) {
		for (let k = 0; k < 3; k++) sum[k] += LINEAR[data[i + k]]
		count++
	}
	return { r: sum[0] / count, g: sum[1] / count, b: sum[2] / count }
}

// Canvas channels are bytes: keep the exact conversion for each value,
// rather than raising every sampled channel of every board to a power.
const LINEAR = Float64Array.from({ length: 256 }, (_, byte) => {
	const c = byte / 255
	return c < 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

// The house stands on the lowest ground under its outline, like scene.js's.
const bases = new WeakMap()
function base(world, n) {
	const b = world.buildings[n]
	if (bases.has(b)) return bases.get(b)
	let low = Infinity
	for (const r of b.rings) for (let i = 0; i < r.length; i += 2) low = Math.min(low, world.heightAt(r[i], r[i + 1]))
	if (!Number.isFinite(low)) low = 0
	bases.set(b, low)
	return low
}

function hash(s) {
	let h = 7
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
	return h
}

export function build({ world, chunk, gradient, sky, opening }) {
	const group = createFascia(world, chunk, gradient, sky.night, opening)
	group.traverse((mesh) => mesh.layers.set(1))
	return { meshes: [group] }
}
