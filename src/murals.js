// What's painted on the firewalls (see firewalls.js): murals where OSM maps
// one and on a few others, old painted ads, faded, and tags at the foot of
// walls you can reach. All painted here, procedurally, in a few strong
// colours inked in black, into one atlas; each chunk's paintings are one mesh, one draw.
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

// What they're painted in: a few strong colours a wall, inked in black, and
// chrome for throw-ups. Skin tones and hair for faces.
const BOLD = ['#E4312B', '#F5C518', '#1F6FB2', '#2FA34A', '#F27D2A', '#E85A9B', '#6CC5E0', '#7A3FA0']
const BLACK = '#161616'
const WHITE = '#F4F1E8'
const CHROME = '#C9CDD2'
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
// Throw-ups are short names in fat letters; tags are names in a quick hand.
const THROWS = ['NK', '44', 'KMS', 'ZEK', 'OKS', 'KAOS', 'DUX', 'REMS', 'BOMA']
const TAGS = ['nk44', '12043', '12047', 'kiez', 'rollberg', 'sonne', 'zek', 'oks!', 'dux', 'rems']
const PIECES = ['NK', '44', 'KIEZ', 'SONNE', 'KMS']

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
		paintAtlas(canvas.getContext('2d'), mapped)
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

// Everything painted into the atlas: the mapped murals, the generic ones,
// the ads and the tag bands.
export function paintAtlas(g, mapped) {
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

// A mural in a square of side s: big confident shapes in three strong
// colours, each inked round in black, on a sunburst, stripes or dots.
function paintMural(g, x, y, s, of, rand) {
	const pick = (list) => list[Math.floor(rand() * list.length)]
	const [bg, a, b, c] = [...BOLD].sort(() => rand() - 0.5)
	g.save()
	g.translate(x, y)
	g.scale(s, s)
	g.beginPath()
	g.rect(0, 0, 1, 1)
	g.clip()
	g.lineJoin = 'round'
	g.lineCap = 'round'
	// A path filled in colour f, then its outline inked; line 0 leaves it bare.
	const shape = (path, f, line = 0.022) => {
		g.beginPath()
		path()
		if (f) {
			g.fillStyle = f
			g.fill()
		}
		if (line) {
			g.lineWidth = line
			g.strokeStyle = BLACK
			g.stroke()
		}
	}
	const circle = (cx, cy, r, f, line) => shape(() => g.arc(cx, cy, r, 0, TAU), f, line)
	const ellipse = (cx, cy, rx, ry, rot, f, line) => shape(() => g.ellipse(cx, cy, rx, ry, rot, 0, TAU), f, line)
	const poly = (pts, f, line) =>
		shape(
			() => {
				pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)))
				g.closePath()
			},
			f,
			line,
		)
	const line = (pts, w = 0.022, col = BLACK) => {
		g.beginPath()
		pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)))
		g.lineWidth = w
		g.strokeStyle = col
		g.stroke()
	}
	// A four-pointed sparkle.
	const sparkle = (cx, cy, r) =>
		poly(
			[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
				const d = k % 2 ? r * 0.28 : r
				return [cx + Math.cos((k * TAU) / 8) * d, cy + Math.sin((k * TAU) / 8) * d]
			}),
			WHITE,
			0.014,
		)
	g.fillStyle = bg
	g.fillRect(0, 0, 1, 1)
	const back = rand()
	if (back < 0.5) {
		const n = 18
		const turn = rand()
		for (let k = 0; k < n; k += 2) {
			const t0 = ((k + turn) / n) * TAU
			const t1 = ((k + 1 + turn) / n) * TAU
			poly(
				[
					[0.5, 0.5],
					[0.5 + Math.cos(t0) * 1.2, 0.5 + Math.sin(t0) * 1.2],
					[0.5 + Math.cos(t1) * 1.2, 0.5 + Math.sin(t1) * 1.2],
				],
				c,
				0,
			)
		}
	} else if (back < 0.75) {
		for (let k = -1; k < 6; k += 2)
			poly(
				[
					[0, k / 5],
					[1, k / 5 - 0.3],
					[1, (k + 1) / 5 - 0.3],
					[0, (k + 1) / 5],
				],
				c,
				0,
			)
	} else for (let k = 0; k < 7; k++) circle(rand(), rand(), 0.07 + rand() * 0.07, c, 0)
	if (of === 'face') {
		const skin = pick(SKINS)
		const hair = pick(HAIR)
		ellipse(0.5, 1.05, 0.46, 0.3, 0, a)
		shape(() => g.rect(0.42, 0.62, 0.16, 0.2), skin)
		const long = rand() < 0.5
		if (long) ellipse(0.5, 0.56, 0.3, 0.3, 0, hair)
		ellipse(0.5, 0.36, 0.26, 0.22, 0, hair)
		ellipse(0.5, 0.47, 0.2, 0.25, 0, skin)
		// A cap on some, a fringe on the rest.
		if (rand() < 0.35) {
			shape(() => g.arc(0.5, 0.33, 0.21, Math.PI, TAU), b)
			ellipse(0.38, 0.33, 0.17, 0.035, -0.1, b)
		} else shape(() => g.ellipse(0.5, 0.29, 0.2, 0.1, 0, Math.PI * 0.95, TAU * 1.02), hair)
		if (rand() < 0.4) {
			// Shades, the sky in them.
			for (const ex of [0.42, 0.58]) ellipse(ex, 0.44, 0.07, 0.05, 0, BLACK)
			line([
				[0.49, 0.43],
				[0.51, 0.43],
			])
			for (const ex of [0.4, 0.56])
				line(
					[
						[ex, 0.425],
						[ex + 0.03, 0.415],
					],
					0.014,
					WHITE,
				)
		} else
			for (const ex of [0.42, 0.58]) {
				ellipse(ex, 0.44, 0.055, 0.045, 0, WHITE)
				circle(ex + 0.01, 0.445, 0.026, BLACK, 0)
				circle(ex + 0.02, 0.432, 0.009, WHITE, 0)
			}
		line([
			[0.5, 0.47],
			[0.48, 0.53],
			[0.51, 0.535],
		])
		shape(() => g.arc(0.5, 0.58, 0.07, 0.15, Math.PI - 0.15), '#B3262A')
		circle(0.37, 0.53, 0.03, '#E85A9B', 0)
		circle(0.63, 0.53, 0.03, '#E85A9B', 0)
	} else if (of === 'creature') {
		g.save()
		g.translate(0.5, 0.52)
		g.rotate((rand() - 0.5) * 0.5)
		if (rand() < 0.5) {
			poly(
				[
					[0.28, 0],
					[0.5, -0.24],
					[0.46, 0],
					[0.5, 0.24],
				],
				a,
			)
			poly(
				[
					[-0.05, -0.2],
					[0.12, -0.34],
					[0.15, -0.18],
				],
				a,
			)
			ellipse(0, 0, 0.36, 0.23, 0, b)
			for (let k = 0; k < 4; k++)
				line(
					[
						[-0.02 + k * 0.08, -0.12],
						[0.03 + k * 0.08, 0],
						[-0.02 + k * 0.08, 0.12],
					],
					0.016,
				)
			circle(-0.21, -0.05, 0.065, WHITE)
			circle(-0.22, -0.05, 0.032, BLACK, 0)
			circle(-0.23, -0.06, 0.01, WHITE, 0)
			shape(() => g.arc(-0.3, 0.06, 0.05, 0.2, Math.PI - 0.2), null, 0.016)
			for (let k = 0; k < 3; k++) circle(-0.42 + k * 0.04, -0.22 - k * 0.1, 0.025 + k * 0.012, WHITE, 0.012)
		} else {
			poly(
				[
					[0.12, 0.05],
					[0.46, 0.28],
					[0.36, 0.4],
					[0.06, 0.18],
				],
				a,
			)
			ellipse(0, 0.06, 0.3, 0.2, -0.3, b)
			circle(-0.22, -0.16, 0.15, b)
			poly(
				[
					[-0.35, -0.2],
					[-0.52, -0.12],
					[-0.34, -0.1],
				],
				'#F5C518',
			)
			ellipse(0.06, 0.03, 0.2, 0.09, -0.6, a)
			circle(-0.25, -0.2, 0.05, WHITE)
			circle(-0.26, -0.2, 0.025, BLACK, 0)
			circle(-0.27, -0.21, 0.008, WHITE, 0)
		}
		g.restore()
		sparkle(0.15, 0.15, 0.07)
		sparkle(0.85, 0.82, 0.05)
	} else if (of === 'garden') {
		// A jungle of big leaves round one giant flower.
		circle(0.78, 0.2, 0.12, '#F5C518')
		const greens = ['#2FA34A', '#1E6B35', '#7CC242']
		for (let k = 0; k < 7; k++) {
			const lx = (k / 6) * 1.1 - 0.05
			const ly = 0.75 + rand() * 0.2
			const rot = (lx - 0.5) * 1.6 + (rand() - 0.5) * 0.4 - Math.PI / 2
			ellipse(lx, ly, 0.24, 0.09, rot, greens[k % 3])
			line(
				[
					[lx, ly],
					[lx + Math.cos(rot) * 0.2, ly + Math.sin(rot) * 0.2],
				],
				0.012,
			)
		}
		const fx = 0.4 + rand() * 0.2
		const fy = 0.45
		line(
			[
				[fx, fy],
				[fx + 0.04, 1],
			],
			0.045,
			'#1E6B35',
		)
		for (let k = 0; k < 8; k++) {
			const t = (k / 8) * TAU
			ellipse(fx + Math.cos(t) * 0.13, fy + Math.sin(t) * 0.13, 0.12, 0.065, t, a)
		}
		circle(fx, fy, 0.09, b)
		for (let k = 0; k < 5; k++) circle(fx - 0.03 + rand() * 0.06, fy - 0.03 + rand() * 0.06, 0.01, BLACK, 0)
	} else {
		// A piece: a word in fat letters, a sparkle on it.
		g.save()
		g.scale(1 / s, 1 / s)
		throwUp(g, pick(PIECES), s * 0.5, s * 0.52, s * 0.46, a, b, rand, s * 0.9)
		g.restore()
		sparkle(0.2, 0.25, 0.08)
		sparkle(0.8, 0.75, 0.06)
	}
	g.restore()
}

// A name in fat bubbly letters that run into each other: a drop shadow in
// shade, a black outline and the fill, with a shine. Centred on cx, cy, at
// most max wide. Returns how wide it came out.
function throwUp(g, word, cx, cy, size, fill, shade, rand, max = Infinity) {
	g.save()
	g.font = `900 ${size}px sans-serif`
	g.textBaseline = 'middle'
	g.lineJoin = 'round'
	g.lineCap = 'round'
	const letters = [...word]
	const steps = letters.map((ch) => g.measureText(ch).width * 0.8)
	const wide = steps.reduce((sum, w) => sum + w, 0) + size * 0.4
	const k = Math.min(1, max / wide)
	g.translate(cx, cy)
	g.scale(k, k)
	let px = -(wide - size * 0.4) / 2
	const at = letters.map((ch, i) => {
		const spot = [px, (rand() - 0.5) * size * 0.2, (rand() - 0.5) * 0.3]
		px += steps[i]
		return spot
	})
	const each = (fn) =>
		letters.forEach((ch, i) => {
			g.save()
			g.translate(at[i][0], at[i][1])
			g.rotate(at[i][2])
			fn(ch)
			g.restore()
		})
	g.save()
	g.translate(size * 0.1, size * 0.12)
	g.strokeStyle = BLACK
	each((ch) => {
		g.lineWidth = size * 0.34
		g.strokeText(ch, 0, 0)
	})
	g.strokeStyle = shade
	each((ch) => {
		g.lineWidth = size * 0.24
		g.strokeText(ch, 0, 0)
	})
	g.restore()
	g.strokeStyle = BLACK
	each((ch) => {
		g.lineWidth = size * 0.26
		g.strokeText(ch, 0, 0)
	})
	g.strokeStyle = fill
	g.fillStyle = fill
	each((ch) => {
		g.lineWidth = size * 0.12
		g.strokeText(ch, 0, 0)
		g.fillText(ch, 0, 0)
	})
	g.strokeStyle = WHITE
	g.lineWidth = size * 0.05
	each((ch) => {
		const w = g.measureText(ch).width
		g.beginPath()
		g.moveTo(w * 0.15, -size * 0.27)
		g.lineTo(w * 0.4, -size * 0.3)
		g.stroke()
	})
	g.restore()
	return wide * k
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

// A band of what's sprayed where a hand can reach: chrome or coloured
// throw-ups and names in a quick slanted hand, dripping, crowding each other.
function paintTags(g, { x, y, w, h }, rand) {
	g.save()
	g.translate(x, y)
	g.beginPath()
	g.rect(0, 0, w, h)
	g.clip()
	let at = 10
	while (at < w - 80) {
		if (rand() < 0.5) {
			const word = THROWS[Math.floor(rand() * THROWS.length)]
			const fill = rand() < 0.5 ? CHROME : rand() < 0.5 ? WHITE : BOLD[Math.floor(rand() * BOLD.length)]
			const shade = BOLD[Math.floor(rand() * BOLD.length)]
			const size = h * (0.5 + rand() * 0.12)
			g.save()
			g.font = `900 ${size}px sans-serif`
			const guess = [...word].reduce((sum, ch) => sum + g.measureText(ch).width * 0.8, size * 0.4)
			g.restore()
			at += throwUp(g, word, at + guess / 2, h * 0.5, size, fill, shade, rand) - size * 0.1
		} else at += handTag(g, TAGS[Math.floor(rand() * TAGS.length)], at, h * (0.62 + rand() * 0.15), h * (0.4 + rand() * 0.2), rand) + 10
		at += rand() * 40
	}
	g.restore()
}

// A name in a quick hand: tall narrow letters leaning forward, a swoosh
// under them and the paint running. Returns how wide it came out.
function handTag(g, word, x, y, size, rand) {
	const col = rand() < 0.7 ? BLACK : rand() < 0.5 ? '#3A57C4' : '#C8302A'
	g.save()
	g.translate(x, y)
	g.font = `500 ${size}px sans-serif`
	g.textBaseline = 'alphabetic'
	const wide = g.measureText(word).width * 0.6
	g.save()
	g.transform(0.6, 0, -0.3, 1, 0, 0)
	g.fillStyle = col
	g.fillText(word, 0, 0)
	g.restore()
	g.strokeStyle = col
	g.fillStyle = col
	g.lineCap = 'round'
	g.lineWidth = size * 0.05
	g.beginPath()
	g.moveTo(-size * 0.1, size * 0.12)
	g.quadraticCurveTo(wide * 0.5, size * 0.28, wide + size * 0.2, size * 0.02)
	g.lineTo(wide + size * 0.05, size * 0.1)
	g.stroke()
	for (let k = 0; k < 3; k++) {
		const dx = rand() * wide
		const long = size * (0.1 + rand() * 0.4)
		g.lineWidth = size * 0.025
		g.beginPath()
		g.moveTo(dx, -size * 0.05)
		g.lineTo(dx, long)
		g.stroke()
		g.beginPath()
		g.arc(dx, long, size * 0.025, 0, TAU)
		g.fill()
	}
	g.restore()
	return wide + size * 0.2
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

const TAU = Math.PI * 2
const hash = (n) => ((Math.imul(Math.round(n) + 1, 2654435761) >>> 0) % 10007) / 10007
