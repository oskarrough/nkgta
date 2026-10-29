// What's painted on the firewalls (see firewalls.js): murals where OSM maps
// one and on a few others, old painted ads, faded, and tags at the foot of
// walls you can reach. All painted here, procedurally, in a handful of bold
// toon colours, into one atlas; each chunk's paintings are one mesh, one draw.
// Mipmapped, so a painting far off is its average colour, not speckle.
import * as THREE from 'three'

// Shares of the firewalls with room for it that get a mural of their own, an
// old ad, and (those bare to the ground) tags.
const SHARE = { mural: 0.06, ad: 0.2, tags: 0.45 }
// Sizes in tiles: the margin left round a mural, the ads' widest, the tag
// band's height, and how far off the wall it all sits.
const SIZE = { margin: 0.25, plinth: 0.3, ad: 4.5, tags: 0.6, off: 0.015 }

// The firewall itself, in the wall shader: the plaster gone grey and rough,
// patched, streaked by rain, here and there down to the brick.
const FIRE = { grey: '#b3aca1', brick: '#9a5a46', mortar: '#c4baa9', patch: 0.16, bricks: 0.85 }

// The toon colours they're painted in, and skin tones for faces.
const INKS = [
	'#C8302A',
	'#E8C21A',
	'#3D5E82',
	'#3FA34D',
	'#61ADC5',
	'#B5603F',
	'#E0A070',
	'#2D333D',
	'#E7E7E5',
	'#689A3E',
	'#E58FB0',
	'#8D9CB1',
]
const SKINS = ['#E0A070', '#C97A52', '#B5603F', '#6E3A2A', '#E8C46A']
const HAIR = ['#2D333D', '#6E3A2A', '#E8C21A', '#C8302A', '#3D5E82']
const ADS = ['#6E3A2A', '#34502D', '#3D5E82', '#2D333D', '#8F4C35']
const AD_WORDS = [
	['KOHLEN', 'KOKS · BRIKETTS'],
	['MÖBEL', 'BETTEN · POLSTER'],
	['TABAK', 'ZIGARREN'],
	['KAFFEE', 'RÖSTEREI'],
	['BIER', 'AUSSCHANK'],
	['SEIFE', 'PARFÜMERIE'],
	['FAHRRÄDER', 'NÄHMASCHINEN'],
	['LEDER', 'KOFFER · TASCHEN'],
]
const KINDS = ['face', 'creature', 'garden', 'shapes']
const TAGS = ['44', 'NK', '12043', '12045', '12047', 'KIEZ', 'ROLLBERG', 'SONNE', 'KMS']

// Atlas layout in pixels: murals in square cells, then ads, then tag bands.
const ATLAS = { w: 2048, h: 1536 }
const MURAL = { size: 256, cols: 8, rows: 3, own: 6 } // the last `own` cells are generic murals
const AD = { w: 512, h: 256, y: 768, cols: 4, rows: 2 }
const TAG = { w: 1024, h: 128, y: 1280, cols: 2, rows: 2 }

export function createMurals(world, firewalls, gradient) {
	const mapped = world.murals ?? []
	let material = null
	// Painted on first use, so a map without firewalls never pays for it.
	function look() {
		if (material) return material
		const canvas = document.createElement('canvas')
		canvas.width = ATLAS.w
		canvas.height = ATLAS.h
		const g = canvas.getContext('2d')
		const cells = MURAL.cols * MURAL.rows
		for (let i = 0; i < cells; i++) {
			const own = i >= cells - MURAL.own
			const m = own ? { seed: i * 977, of: KINDS[i % 4] } : mapped[i]
			if (!m) continue
			const { x, y } = muralCell(i)
			// Untold, a mural shows whatever its seed says.
			paintMural(g, x, y, MURAL.size, m.of || KINDS[m.seed % KINDS.length], rng(m.seed))
		}
		for (let i = 0; i < AD.cols * AD.rows; i++) paintAd(g, adCell(i), i, rng(i * 31 + 5))
		for (let i = 0; i < TAG.cols * TAG.rows; i++) paintTags(g, tagCell(i), rng(i * 53 + 11))
		const tex = new THREE.CanvasTexture(canvas)
		tex.colorSpace = THREE.SRGBColorSpace
		tex.anisotropy = 4
		material = new THREE.MeshToonMaterial({
			map: tex,
			gradientMap: gradient,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2,
		})
		return material
	}

	// Which painting goes on firewall w of house h, if any: a list of
	// [atlas rect, along from, along to, z from, z to].
	function paintings(w, h) {
		const out = []
		const top = h.base + h.h - 0.3
		const from = Math.max(w.from, h.base) + (w.gap ? SIZE.plinth : 0.15)
		const tall = top - from
		const r = hash(w.n * 7 + Math.round(w.ax * 13 + w.ay * 7))
		const mi = w.mural ? mapped.indexOf(w.mural) : -1
		if (mi >= 0 || (r < SHARE.mural && tall > 3 && w.len > 3)) {
			const cells = MURAL.cols * MURAL.rows
			const cell = mi >= 0 ? mi % (cells - MURAL.own) : cells - MURAL.own + Math.floor(hash(w.n + 3) * MURAL.own)
			const wide = Math.min(w.len - SIZE.margin * 2, w.mural?.w > 2 ? w.mural.w : Infinity)
			const t0 = (w.len - wide) / 2
			const z1 = Math.max(top, from + 1.5)
			const { x, y } = muralCell(cell)
			out.push([{ x, y, w: MURAL.size, h: MURAL.size }, t0, t0 + wide, from, z1])
		} else if (r < SHARE.mural + SHARE.ad && tall > 2 && w.len > 2.5) {
			const wide = Math.min(SIZE.ad, w.len * 0.7)
			const high = Math.min(wide * 0.5, tall * 0.5)
			const t0 = (w.len - wide) * (0.2 + 0.6 * hash(w.n + 17))
			out.push([adCell(Math.floor(hash(w.n + 23) * AD.cols * AD.rows)), t0, t0 + wide, top - 0.3 - high, top - 0.3])
		}
		// Tags where a hand can reach: walls bare down to the ground.
		if (w.gap && hash(w.n * 3 + 1) < SHARE.tags && !out.length) {
			const wide = Math.min(w.len - 0.3, SIZE.tags * 8)
			const t0 = (w.len - wide) / 2
			out.push([tagCell(Math.floor(hash(w.n + 29) * TAG.cols * TAG.rows)), t0, t0 + wide, h.base + 0.05, h.base + 0.05 + SIZE.tags])
		}
		return out
	}

	return {
		// The paintings on these houses' firewalls as one mesh, or null.
		decals(houses) {
			const pos = []
			const nor = []
			const uv = []
			for (const h of houses) {
				for (const w of firewalls.of(h.n)) {
					for (const [rect, t0, t1, z0, z1] of paintings(w, h)) {
						const [u0, v0, u1, v1] = crop(rect, (t1 - t0) / (z1 - z0))
						// Scene coordinates: y points north.
						const at = (t) => [w.ax + w.ex * t + w.nx * SIZE.off, -(w.ay + w.ey * t + w.ny * SIZE.off)]
						const [ax, ay] = at(t0)
						const [bx, by] = at(t1)
						const quad = [
							[ax, ay, z0, u0, v0],
							[bx, by, z0, u1, v0],
							[bx, by, z1, u1, v1],
							[ax, ay, z0, u0, v0],
							[bx, by, z1, u1, v1],
							[ax, ay, z1, u0, v1],
						]
						for (const [x, y, z, u, v] of quad) {
							pos.push(x, y, z)
							nor.push(w.nx, -w.ny, 0)
							uv.push(u, v)
						}
					}
				}
			}
			if (!pos.length) return null
			const geo = new THREE.BufferGeometry()
			geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
			geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
			geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
			const mesh = new THREE.Mesh(geo, look())
			mesh.receiveShadow = true
			mesh.renderOrder = 1
			return mesh
		},
	}
}

// The firewall's own look, for the wall shader: `head` before main, `body`
// where the wall's colour is decided. A firewall has vWall.y < 0 and
// vWall.x in bays along it.
export function firewallShader(bayTiles, glsl) {
	const f = (n) => n.toFixed(3)
	return {
		head: `
			float fwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
			float fwNoise(vec2 p) {
				vec2 i = floor(p);
				vec2 u = fract(p);
				u = u * u * (3.0 - 2.0 * u);
				return mix(mix(fwHash(i), fwHash(i + vec2(1.0, 0.0)), u.x), mix(fwHash(i + vec2(0.0, 1.0)), fwHash(i + 1.0), u.x), u.y);
			}
		`,
		body: `
			if (vWall.y < -0.5) {
				vec2 fw = vec2(vWall.x * ${f(bayTiles)}, vZ);
				// Patches of render a couple of metres across, fading to their
				// average as they shrink under a few pixels.
				float big = 1.0 - smoothstep(0.15, 0.5, length(fwidth(fw / 0.7)));
				float fine = 1.0 - smoothstep(0.15, 0.5, length(fwidth(fw / 0.12)));
				diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(FIRE.grey)}, 0.6);
				float patch_ = fwNoise(fw / 0.7) - 0.5;
				diffuseColor.rgb *= 1.0 + ${f(FIRE.patch)} * 2.0 * floor(patch_ * 3.0 + 0.5) / 3.0 * big;
				// Rain streaks down from the top.
				diffuseColor.rgb *= 1.0 - 0.08 * smoothstep(0.55, 0.8, fwNoise(vec2(fw.x / 0.12, 0.5))) * fine;
				// Where the render has come off: bare brick, its courses fading
				// to the brick's average under a pixel.
				float bare = smoothstep(0.74, 0.76, fwNoise(fw / 1.1 + 17.0)) * big;
				float course = fw.y / 0.025;
				float mortar = mix(0.25, pulse(course, 0.0, 0.25, fwidth(course)), 1.0 - smoothstep(0.3, 0.7, fwidth(course)));
				diffuseColor.rgb = mix(diffuseColor.rgb, mix(${glsl(FIRE.brick)}, ${glsl(FIRE.mortar)}, mortar), bare * ${f(FIRE.bricks)});
			}
		`,
	}
}

// Atlas cells in pixels, and a rect cropped to an aspect (width over height)
// as UVs, centred, so a painting is never stretched.
function muralCell(i) {
	return { x: (i % MURAL.cols) * MURAL.size, y: Math.floor(i / MURAL.cols) * MURAL.size }
}
function adCell(i) {
	return { x: (i % AD.cols) * AD.w, y: AD.y + Math.floor(i / AD.cols) * AD.h, w: AD.w, h: AD.h }
}
function tagCell(i) {
	return { x: (i % TAG.cols) * TAG.w, y: TAG.y + Math.floor(i / TAG.cols) * TAG.h, w: TAG.w, h: TAG.h }
}
function crop({ x, y, w, h }, aspect) {
	// A pixel in from the edge, so the neighbours don't bleed in.
	let cw = w - 4
	let ch = h - 4
	if (cw / ch > aspect) cw = ch * aspect
	else ch = cw / aspect
	const cx = x + w / 2
	const cy = y + h / 2
	return [(cx - cw / 2) / ATLAS.w, 1 - (cy + ch / 2) / ATLAS.h, (cx + cw / 2) / ATLAS.w, 1 - (cy - ch / 2) / ATLAS.h]
}

// A mural, bold flat shapes in a few colours, in a square of side s.
function paintMural(g, x, y, s, of, rand) {
	const pick = (list) => list[Math.floor(rand() * list.length)]
	const inks = [...INKS].sort(() => rand() - 0.5)
	g.save()
	g.translate(x, y)
	g.scale(s, s)
	g.beginPath()
	g.rect(0, 0, 1, 1)
	g.clip()
	g.fillStyle = inks[0]
	g.fillRect(0, 0, 1, 1)
	const circle = (cx, cy, r, c) => {
		g.fillStyle = c
		g.beginPath()
		g.arc(cx, cy, r, 0, Math.PI * 2)
		g.fill()
	}
	const ellipse = (cx, cy, rx, ry, rot, c) => {
		g.fillStyle = c
		g.beginPath()
		g.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2)
		g.fill()
	}
	const poly = (pts, c) => {
		g.fillStyle = c
		g.beginPath()
		pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)))
		g.fill()
	}
	// Big stripes or dots behind, for every kind.
	if (rand() < 0.5)
		for (let k = 0; k < 6; k += 2)
			poly(
				[
					[0, k / 6],
					[1, k / 6 - 0.15],
					[1, (k + 1) / 6 - 0.15],
					[0, (k + 1) / 6],
				],
				inks[1],
			)
	else for (let k = 0; k < 9; k++) circle(rand(), rand(), 0.03 + rand() * 0.05, inks[1])
	if (of === 'face') {
		const skin = pick(SKINS)
		circle(0.5, 0.44, 0.4, inks[2])
		ellipse(0.5, 1.02, 0.42, 0.24, 0, inks[3])
		g.fillStyle = skin
		g.fillRect(0.43, 0.6, 0.14, 0.2)
		const hair = pick(HAIR)
		ellipse(0.5, 0.36, 0.25, 0.24, 0, hair)
		if (rand() < 0.5) ellipse(0.5, 0.62, 0.26, 0.2, 0, hair)
		ellipse(0.5, 0.46, 0.19, 0.25, 0, skin)
		const closed = rand() < 0.4
		for (const ex of [0.42, 0.58]) {
			if (closed) {
				g.strokeStyle = '#2D333D'
				g.lineWidth = 0.018
				g.beginPath()
				g.arc(ex, 0.43, 0.04, 0.2, Math.PI - 0.2)
				g.stroke()
			} else {
				ellipse(ex, 0.43, 0.045, 0.03, 0, '#E7E7E5')
				circle(ex, 0.43, 0.02, '#2D333D')
			}
		}
		g.strokeStyle = '#6E3A2A'
		g.lineWidth = 0.014
		g.beginPath()
		g.moveTo(0.5, 0.45)
		g.lineTo(0.48, 0.53)
		g.lineTo(0.51, 0.53)
		g.stroke()
		ellipse(0.5, 0.6, 0.06, 0.022, 0, '#C8302A')
	} else if (of === 'creature') {
		const body = inks[2]
		const fish = rand() < 0.5
		const tilt = (rand() - 0.5) * 0.6
		g.save()
		g.translate(0.5, 0.5)
		g.rotate(tilt)
		if (fish) {
			poly(
				[
					[0.25, 0],
					[0.48, -0.2],
					[0.48, 0.2],
				],
				inks[3],
			)
			ellipse(0, 0, 0.32, 0.2, 0, body)
			for (let k = 0; k < 4; k++) ellipse(-0.05 + k * 0.08, 0, 0.03, 0.14, 0, inks[3])
			circle(-0.2, -0.04, 0.045, '#E7E7E5')
			circle(-0.21, -0.04, 0.022, '#2D333D')
			for (let k = 0; k < 3; k++) circle(-0.4 + k * 0.03, -0.2 - k * 0.1, 0.02 + k * 0.01, '#E7E7E5')
		} else {
			poly(
				[
					[0.15, 0.05],
					[0.45, 0.3],
					[0.38, 0.38],
					[0.1, 0.15],
				],
				inks[3],
			)
			ellipse(0, 0.05, 0.28, 0.18, -0.3, body)
			circle(-0.22, -0.16, 0.13, body)
			poly(
				[
					[-0.33, -0.18],
					[-0.46, -0.12],
					[-0.33, -0.12],
				],
				'#E8C21A',
			)
			ellipse(0.04, 0.02, 0.18, 0.08, -0.6, inks[4])
			circle(-0.25, -0.19, 0.03, '#E7E7E5')
			circle(-0.26, -0.19, 0.015, '#2D333D')
		}
		g.restore()
		for (let k = 0; k < 5; k++) ellipse(rand(), rand() < 0.5 ? 0.9 : 0.1, 0.12, 0.04, rand() * 3, '#3FA34D')
	} else if (of === 'garden') {
		g.fillStyle = pick(['#61ADC5', '#8D9CB1', '#E8C46A'])
		g.fillRect(0, 0, 1, 0.6)
		circle(0.3 + rand() * 0.4, 0.25, 0.12, '#E8C21A')
		for (const [k, c] of [
			[0.55, '#689A3E'],
			[0.68, '#3FA34D'],
			[0.82, '#34502D'],
		]) {
			g.fillStyle = c
			g.beginPath()
			g.moveTo(0, 1)
			for (let px = 0; px <= 1.001; px += 0.05) g.lineTo(px, k + Math.sin(px * 6 + rand() * 0.2 + k * 9) * 0.04)
			g.lineTo(1, 1)
			g.fill()
		}
		for (let k = 0; k < 3; k++) {
			const fx = 0.2 + k * 0.3 + (rand() - 0.5) * 0.1
			const fy = 0.62 + rand() * 0.12
			g.strokeStyle = '#34502D'
			g.lineWidth = 0.02
			g.beginPath()
			g.moveTo(fx, fy)
			g.lineTo(fx, 1)
			g.stroke()
			const petal = pick(['#C8302A', '#E58FB0', '#E7E7E5', '#E8C21A'])
			for (let a = 0; a < 6; a++) circle(fx + Math.cos(a) * 0.06, fy + Math.sin(a) * 0.06, 0.045, petal)
			circle(fx, fy, 0.04, '#E8C21A')
		}
	} else {
		for (let k = 0; k < 6; k++) {
			const c = inks[2 + (k % (inks.length - 2))]
			const cx = rand()
			const cy = rand()
			const r = 0.12 + rand() * 0.22
			const kind = Math.floor(rand() * 3)
			if (kind === 0) circle(cx, cy, r, c)
			else if (kind === 1)
				poly(
					[
						[cx, cy - r],
						[cx + r, cy + r],
						[cx - r, cy + r],
					],
					c,
				)
			else {
				g.strokeStyle = c
				g.lineWidth = 0.05
				g.beginPath()
				for (let z = 0; z < 6; z++) g.lineTo(cx - r + z * r * 0.4, cy + (z % 2 ? r * 0.3 : -r * 0.3))
				g.stroke()
			}
		}
	}
	g.restore()
}

// An old painted ad, faded into the wall: a dark field, a pale border and
// the trade in big letters.
function paintAd(g, { x, y, w, h }, i, rand) {
	const [big, small] = AD_WORDS[i % AD_WORDS.length]
	g.save()
	g.translate(x, y)
	g.globalAlpha = 0.5
	g.fillStyle = ADS[i % ADS.length]
	g.fillRect(8, 8, w - 16, h - 16)
	g.strokeStyle = '#e8dcc0'
	g.lineWidth = 6
	g.strokeRect(20, 20, w - 40, h - 40)
	g.fillStyle = '#e8dcc0'
	g.textAlign = 'center'
	g.textBaseline = 'middle'
	g.font = `bold ${Math.round(h * 0.36)}px serif`
	g.fillText(big, w / 2, h * 0.42, w - 60)
	g.font = `bold ${Math.round(h * 0.13)}px sans-serif`
	g.fillText(small, w / 2, h * 0.74, w - 80)
	// Weathered: the paint's gone in patches.
	g.globalCompositeOperation = 'destination-out'
	g.globalAlpha = 0.35
	for (let k = 0; k < 14; k++) {
		g.beginPath()
		g.ellipse(rand() * w, rand() * h, 10 + rand() * 40, 6 + rand() * 20, rand() * 3, 0, Math.PI * 2)
		g.fill()
	}
	g.restore()
}

// A band of tags: names in fat letters, outlined, and a scribble or two.
function paintTags(g, { x, y, w, h }, rand) {
	g.save()
	g.translate(x, y)
	g.beginPath()
	g.rect(0, 0, w, h)
	g.clip()
	g.textBaseline = 'middle'
	g.lineJoin = 'round'
	let at = 20
	while (at < w - 120) {
		const word = TAGS[Math.floor(rand() * TAGS.length)]
		const size = Math.round(h * (0.45 + rand() * 0.35))
		g.save()
		g.translate(at, h * (0.45 + (rand() - 0.5) * 0.2))
		g.rotate((rand() - 0.5) * 0.3)
		g.font = `italic 900 ${size}px sans-serif`
		g.lineWidth = size * 0.12
		g.strokeStyle = rand() < 0.5 ? '#1A1E1B' : '#E7E7E5'
		g.fillStyle = INKS[Math.floor(rand() * INKS.length)]
		g.strokeText(word, 0, 0)
		g.fillText(word, 0, 0)
		const wide = g.measureText(word).width
		g.restore()
		at += wide + 30 + rand() * 120
	}
	g.strokeStyle = '#1A1E1B'
	g.lineWidth = 4
	for (let k = 0; k < 2; k++) {
		g.beginPath()
		let px = rand() * w
		g.moveTo(px, h * (0.2 + rand() * 0.6))
		for (let s = 0; s < 5; s++) g.lineTo((px += 15 + rand() * 25), h * (0.2 + rand() * 0.6))
		g.stroke()
	}
	g.restore()
}

// Seeded randomness, so every wall paints the same each time.
function rng(seed) {
	let a = seed >>> 0 || 1
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const hash = (n) => ((Math.imul(Math.round(n) + 1, 2654435761) >>> 0) % 10007) / 10007
