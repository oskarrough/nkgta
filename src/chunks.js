// The city in square chunks, so only what's near the view costs anything.
// Each chunk gets its own meshes, built once and soon after the map loads,
// so the camera skips whatever is off screen. Each also gets its own ground
// and roof textures, painted in workers as the chunk comes near the view,
// as sharp as the zoom needs, and let go again once it's far away. A coarse
// pair stays for every chunk, so there's always something to show.
import { PHONE } from './device.js'
import { paintBuildings } from './map-image.js'
import * as THREE from 'three'
import { COLORS, T } from './tiles.js'
import { note, PERF } from './perf.js'

export const CHUNK = 128 // tiles a side
// Below this many screen pixels a tile, small things go: trees turn to blobs, chimneys and hatches hide.
export const DETAIL_PX = 3
// Texture pixels per tile, finest first. Every chunk keeps the last one.
const LEVELS = [12, 6, 3, 1.5]
const GROUND_MAX = 3
const FAR = LEVELS.at(-1)
// A level will do while a screen pixel covers no more than this many of
// its texels, a little under one, so zooming out lets go of detail early.
const UNDERSAMPLE = 0.75
// Texels of the neighbouring ground painted round every chunk's own, so
// filtering never reaches past the edge of the texture and leaves a seam.
const GUTTER = 4
const MARGIN = 32 // tiles round the view that count as in view, so textures are ready before they show
const BUDGET = (PHONE ? 16 : 128) * 2 ** 20 // bytes of chunk textures beyond the coarse ones, mipmaps included
// Share of the time between frames spent building chunk meshes that
// aren't needed yet, and the most per frame, in ms.
const BUILD_SHARE = 0.25
const BUILD_MS = 12
const UPLOAD_BYTES = 8 * 2 ** 20 // texture bytes sent to the GPU per frame, at least one texture
const MAX_PX = 8192 // texture size every GPU takes
const KINDS = ['ground', 'roofs']

// The hex's own sRGB bytes: THREE.Color would hand back linear values, and
// stored in an sRGB texture those come out darker, a muddy brown.
const solid = (hex) => {
	const n = parseInt(hex.slice(1), 16)
	const tex = new THREE.DataTexture(new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]), 1, 1)
	tex.colorSpace = THREE.SRGBColorSpace
	tex.needsUpdate = true
	return tex
}
export const BLANK = { ground: solid(COLORS[T.GROUND]), roofs: solid('#858d92') }

const levelFor = (scale) => LEVELS.findLast((l) => l >= scale * UNDERSAMPLE) ?? LEVELS[0]
const bytesOf = (w, h) => (w * h * 4 * 4) / 3

const distance = (c, v) => Math.max(0, c.x - v.x1, v.x0 - c.x - c.w, c.y - v.y1, v.y0 - c.y - c.h)

function grid(world) {
	const cols = Math.ceil(world.W / CHUNK)
	const rows = Math.ceil(world.H / CHUNK)
	const chunks = []
	for (let cy = 0; cy < rows; cy++) {
		for (let cx = 0; cx < cols; cx++) {
			const x = cx * CHUNK
			const y = cy * CHUNK
			const box = [Infinity, Infinity, -Infinity, -Infinity]
			chunks.push({
				i: chunks.length,
				x,
				y,
				w: Math.min(CHUNK, world.W - x),
				h: Math.min(CHUNK, world.H - y),
				buildings: [],
				trees: [],
				box,
			})
		}
	}
	const at = (x, y) => {
		const cx = Math.max(0, Math.min(cols - 1, Math.floor(x / CHUNK)))
		const cy = Math.max(0, Math.min(rows - 1, Math.floor(y / CHUNK)))
		return chunks[cy * cols + cx]
	}
	// A building belongs to the chunk its middle is in, roof texture and
	// all, so its roof texture has to reach as far as the building does.
	world.buildings.forEach((b, n) => {
		if (!b.rings.length) return
		const box = [Infinity, Infinity, -Infinity, -Infinity]
		for (const r of b.rings) {
			for (let i = 0; i < r.length; i += 2) {
				box[0] = Math.min(box[0], r[i])
				box[1] = Math.min(box[1], r[i + 1])
				box[2] = Math.max(box[2], r[i])
				box[3] = Math.max(box[3], r[i + 1])
			}
		}
		const c = at((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
		c.buildings.push(n)
		c.box = [Math.min(c.box[0], box[0]), Math.min(c.box[1], box[1]), Math.max(c.box[2], box[2]), Math.max(c.box[3], box[3])]
	})
	;(world.trees ?? []).forEach((t, i) => at(t.x, t.y).trees.push(i))
	return chunks
}

// What a chunk's texture of `kind` covers at `px`, in tiles: the chunk and
// its gutter for the ground, its buildings for the roofs. Whole texels, so
// the rectangle is exactly what the texture holds.
function areaOf(c, kind, px) {
	const [x0, y0, x1, y1] = kind === 'ground' ? [c.x, c.y, c.x + c.w, c.y + c.h] : c.box
	px = Math.min(px, (MAX_PX - GUTTER * 2) / Math.max(x1 - x0, y1 - y0))
	const g = GUTTER / px
	const width = Math.ceil((x1 - x0) * px) + GUTTER * 2
	const height = Math.ceil((y1 - y0) * px) + GUTTER * 2
	return { x: x0 - g, y: y0 - g, w: width / px, h: height / px, px, width, height, soft: kind === 'ground' }
}

// `build(chunk)` makes a chunk's meshes: { group, roofs, show(kind, texture,
// area), zoom(scale) }, with `roofs` the pitched roof of each of its
// buildings as [index, roof] pairs, for the painter, and `zoom` told the
// screen pixels per tile when they change.
export function createChunks(world, renderer, build) {
	const chunks = grid(world)
	const group = new THREE.Group()
	const entries = new Map() // `${chunk}:${kind}:${px}` → texture, painted or on its way
	const queue = [] // entries waiting for a worker
	const arrived = []
	let frame = 0
	let lastUpdate
	let crisp = false
	let bytes = 0
	const probe = new THREE.PerspectiveCamera() // shaders don't depend on the camera
	const frustum = new THREE.Frustum()
	const projection = new THREE.Matrix4()

	// As one string: cloning the shapes object by object costs far more.
	const shared = JSON.stringify({ shapes: world.shapes, buildings: paintBuildings(world.buildings) })
	const workers = Array.from({ length: PHONE ? 1 : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) }, () => {
		const worker = new Worker(new URL('./paint-worker.js', import.meta.url), { type: 'module' })
		worker.postMessage({ world: shared })
		worker.onmessage = ({ data }) => {
			const entry = worker.job
			worker.job = null
			entry.ms = data.ms
			entry.state = 'arrived'
			arrived.push([entry, data.bitmap])
			dispatch()
		}
		// A texture that won't paint stays unpainted, and the worker moves on.
		worker.onerror = (err) => {
			console.error('Could not paint', worker.job?.key, err.message)
			if (worker.job) worker.job.state = 'failed'
			worker.job = null
			dispatch()
		}
		return worker
	})

	function dispatch() {
		for (const worker of workers) {
			if (worker.job || !queue.length) continue
			const entry = queue.shift()
			const c = entry.chunk
			entry.state = 'painting'
			worker.job = entry
			worker.postMessage({
				id: entry.key,
				kind: entry.kind,
				area: { ...entry.area, pick: entry.kind === 'roofs' ? c.buildings : undefined },
				roofs: entry.kind === 'roofs' ? c.parts.roofs : undefined,
			})
		}
	}

	function setFilter(texture) {
		texture.magFilter = crisp ? THREE.NearestFilter : THREE.LinearFilter
		texture.anisotropy = crisp ? 1 : renderer.capabilities.getMaxAnisotropy()
	}

	function upload() {
		let sent = 0
		while (arrived.length && (sent === 0 || sent < UPLOAD_BYTES)) {
			const [entry, bitmap] = arrived.shift()
			if (entries.get(entry.key) !== entry) {
				bitmap.close()
				continue
			}
			const texture = new THREE.Texture(bitmap)
			texture.colorSpace = THREE.SRGBColorSpace
			texture.flipY = false // the worker already did
			setFilter(texture)
			texture.needsUpdate = true
			renderer.initTexture(texture)
			// Once it's on the GPU the bitmap is only needed to upload it
			// again, which only the coarse ones ever are (see setCrisp).
			if (!entry.pinned) bitmap.close()
			entry.texture = texture
			entry.state = 'ready'
			if (!entry.pinned) bytes += entry.bytes
			sent += entry.bytes
		}
	}

	function want(c, kind, px, pinned, rank) {
		const key = `${c.i}:${kind}:${px}`
		let entry = entries.get(key)
		if (!entry) {
			const area = areaOf(c, kind, px)
			entry = { key, chunk: c, kind, px, area, pinned, state: 'new', texture: null, bytes: bytesOf(area.width, area.height), used: frame }
			entries.set(key, entry)
		}
		entry.rank = rank
		if (entry.state === 'new' || entry.state === 'queued') {
			entry.state = 'queued'
			queue.push(entry)
		}
		return entry
	}

	function drop(entry) {
		entries.delete(entry.key)
		if (!entry.texture) return
		entry.texture.image.close()
		entry.texture.dispose()
		if (!entry.pinned) bytes -= entry.bytes
	}

	// The texture a chunk shows: the level it wants if it's there, else the
	// nearest one painted, finer before coarser, else the blank.
	function pick(c, kind, px) {
		let best = null
		for (const l of LEVELS) {
			const entry = entries.get(`${c.i}:${kind}:${l}`)
			if (!entry?.texture) continue
			if (l === px) return entry
			if (!best || Math.abs(Math.log(l / px)) < Math.abs(Math.log(best.px / px)) - 1e-6) best = entry
		}
		return best
	}

	function show(c) {
		for (const kind of KINDS) {
			const entry = pick(c, kind, c.target[kind])
			if (entry) entry.used = frame
			if (c.shown[kind] === entry) continue
			c.shown[kind] = entry
			c.parts.show(kind, entry?.texture ?? BLANK[kind], entry?.area ?? areaOf(c, kind, FAR))
		}
	}

	function buildChunk(c, until = Infinity) {
		if (c.waiting) return
		const t = performance.now()
		c.building ??= build(c)
		c.buildMs ??= 0
		let step
		do {
			step = c.building.next()
			if (step.value instanceof Promise) {
				c.waiting = true
				step.value.then(() => {
					c.waiting = false
				})
				break
			}
		} while (!step.done && performance.now() < until)
		c.buildMs += performance.now() - t
		if (!step.done) return
		c.parts = step.value
		c.building = null
		c.shown = { ground: undefined, roofs: undefined }
		group.add(c.parts.group)
		// Chunk geometry never moves; only textures and visibility change.
		// Bake world transforms once, then skip the whole static subtree on
		// each render (matrixAutoUpdate alone still walks every descendant).
		c.parts.group.updateWorldMatrix(true, true)
		c.bounds = new THREE.Box3().setFromObject(c.parts.group)
		c.parts.group.updateMatrixWorld = () => {}
		// Its shaders compile now, alongside the game, rather than stalling
		// the frame it first shows up in.
		if (group.parent) renderer.compileAsync(c.parts.group, probe, group.parent)
	}

	function update(view, scale) {
		frame++
		const t = performance.now()
		const spare = Math.min(BUILD_MS, (t - (lastUpdate ?? t)) * BUILD_SHARE)
		lastUpdate = t
		const level = levelFor(scale)
		const order = chunks.map((c) => [distance(c, view), c]).sort((a, b) => a[0] - b[0])

		if (PHONE) {
			for (const [d, c] of order) {
				// Finish a suspended build before releasing its resources.
				if (d > CHUNK && c.building) buildChunk(c)
				if (d <= CHUNK || !c.parts) continue
				for (const entry of entries.values()) if (entry.chunk === c) drop(entry)
				group.remove(c.parts.group)
				c.parts.dispose()
				c.parts = c.shown = c.bounds = null
				c.scale = undefined
			}
		}
		for (const [d, c] of order) {
			if (c.parts) continue
			if (PHONE && d > MARGIN) break
			if (d === 0) buildChunk(c)
			else if (performance.now() - t < spare) buildChunk(c, t + spare)
			else break
		}
		note('build', performance.now() - t)

		for (const entry of queue) entry.state = 'new'
		queue.length = 0
		let room = BUDGET
		const phoneTextures = []
		for (const [d, c] of order) {
			if (!c.parts) continue
			const kinds = c.buildings.length ? KINDS : ['ground']
			// A chunk's coarse texture before its finer ones, so the first
			// view shows soon and sharpens after.
			for (const kind of kinds) want(c, kind, FAR, true, d - 0.5)
			c.target = { ground: FAR, roofs: FAR }
			if (d > MARGIN) continue
			if (PHONE) {
				for (const kind of kinds) phoneTextures.push({ c, kind, d })
				continue
			}
			for (const l of LEVELS.slice(LEVELS.indexOf(level), -1)) {
				const target = { ground: Math.min(l, GROUND_MAX), roofs: l }
				const cost = kinds.reduce((sum, kind) => {
					const area = areaOf(c, kind, target[kind])
					return sum + bytesOf(area.width, area.height)
				}, 0)
				if (cost > room) continue
				room -= cost
				c.target = target
				for (const kind of kinds) want(c, kind, c.target[kind], false, d)
				break
			}
		}
		// Roads get first claim on the phone cache; roofs can stay softer.
		phoneTextures.sort((a, b) => Number(a.kind === 'roofs') - Number(b.kind === 'roofs') || a.d - b.d)
		for (const { c, kind, d } of phoneTextures) {
			for (const l of LEVELS.slice(LEVELS.indexOf(level), -1)) {
				if (l > (kind === 'ground' ? GROUND_MAX : 6)) continue
				const area = areaOf(c, kind, l)
				const cost = bytesOf(area.width, area.height)
				if (cost > room) continue
				room -= cost
				c.target[kind] = l
				want(c, kind, l, false, d + (kind === 'roofs' ? 0.1 : 0))
				break
			}
		}
		queue.sort((a, b) => a.rank - b.rank)
		dispatch()

		const u = performance.now()
		upload()
		note('upload', performance.now() - u)
		for (const c of chunks) {
			if (!c.parts) continue
			show(c)
			if (c.scale !== scale) c.parts.zoom?.(scale)
			c.scale = scale
		}

		if (bytes > BUDGET) {
			const old = [...entries.values()].filter((e) => e.texture && !e.pinned && e.used < frame).sort((a, b) => a.used - b.used)
			for (const entry of old) {
				if (bytes <= BUDGET) break
				drop(entry)
			}
		}
		// Waiting entries nobody wants any more go too, so they don't hog a worker.
		for (const entry of entries.values()) if (entry.state === 'new') entries.delete(entry.key)
		note('chunks', performance.now() - t)
	}

	return {
		group,
		update,
		// Reject whole static subtrees before three walks their meshes. A
		// chunk outside the view can still cast a shadow into it.
		cull(camera, shadow) {
			camera.updateMatrixWorld()
			frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
			for (const c of chunks) {
				if (c.parts) c.parts.group.visible = frustum.intersectsBox(c.bounds) || !!shadow?.intersectsBox(c.bounds)
			}
		},
		ready(view, scale) {
			return new Promise((resolve) => {
				const start = performance.now()
				const check = () => {
					update(view, scale)
					const done = chunks.every(
						(c) => distance(c, view) > 0 || KINDS.every((k) => (k === 'roofs' && !c.buildings.length) || c.shown?.[k]),
					)
					if (done || performance.now() - start > 15000) resolve()
					else setTimeout(check, 30)
				}
				check()
			})
		},
		// Filtering only changes on upload: the coarse textures go up again,
		// the rest are painted again as they're wanted.
		setCrisp(on) {
			crisp = on
			for (const entry of entries.values()) {
				if (!entry.texture) continue
				if (!entry.pinned) drop(entry)
				else {
					setFilter(entry.texture)
					entry.texture.needsUpdate = true
				}
			}
		},
		stats: () => ({
			built: chunks.filter((c) => c.parts).length,
			chunks: chunks.length,
			textures: [...entries.values()].filter((e) => e.texture).length,
			painting: workers.filter((w) => w.job).length + queue.length,
			// Megabytes of textures on the GPU, mipmaps included: the coarse
			// ones every chunk keeps, and the finer ones round the view.
			coarseMb: Math.round(([...entries.values()].reduce((s, e) => s + (e.texture && e.pinned ? e.bytes : 0), 0) / 2 ** 20) * 10) / 10,
			fineMb: Math.round((bytes / 2 ** 20) * 10) / 10,
			paintMs: PERF ? [...entries.values()].filter((e) => e.ms).map((e) => [e.key, Math.round(e.ms)]) : undefined,
			buildMs: PERF ? chunks.filter((c) => c.parts).map((c) => [c.i, Math.round(c.buildMs)]) : undefined,
		}),
	}
}
