import * as THREE from 'three'
import polygonBoolean from 'polygon-clipping'
import { CHUNK } from './chunks.js'
import { GROUND_STEP } from './scene-ground.js'
import { T, COLORS, KERB, MARK } from './tiles.js'
import {
	BIKE_LANE,
	SETT,
	TONES,
	OUTLINED,
	TONE_SHIFT,
	SHAPE_OUTLINE,
	FOOTPATH,
	GRAVEL,
	GRAVEL_EDGE,
	GRAVEL_EDGE_WIDTH,
	inPark,
} from './map-image.js'

const DASH = 1.1
const GAP = 1.3
const MARK_WIDTH = 0.18
const BIKE_EDGE = 0.1
const KERB_EXTRA = 0.6
const INK_EXTRA = 0.34
// The old translucent ink was painted over the pale kerb in sRGB.
const KERB_INK = new THREE.Color().setRGB(
	(26 * 0.55 + 201 * 0.45) / 255,
	(30 * 0.55 + 193 * 0.45) / 255,
	(30 * 0.55 + 178 * 0.45) / 255,
	THREE.SRGBColorSpace,
)
// Cut edges meet repeatedly as layers are composed. A 0.3 mm lattice
// prevents nearly coincident float intersections from breaking the boolean.
const coordinates = (value, fn) => (typeof value === 'number' ? fn(value) : value.map((v) => coordinates(v, fn)))
const polygonClipping = Object.fromEntries(
	['union', 'difference', 'intersection', 'xor'].map((operation) => [
		operation,
		(...input) =>
			coordinates(
				polygonBoolean[operation](...input.map((p) => coordinates(p, (v) => Math.round(v * 10000)))),
				(v) => Math.round(v) / 10000,
			),
	]),
)
const snap = (ring) => ring.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])
const union = (polygons) => (polygons.length ? polygonClipping.union(...polygons) : [])
const rectangle = (x0, y0, x1, y1) => [
	[
		[x0, y0],
		[x1, y0],
		[x1, y1],
		[x0, y1],
		[x0, y0],
	],
]
const indexed = new WeakMap()

export function shapesIn(world, chunk) {
	let cells = indexed.get(world)
	if (!cells) {
		cells = new Map()
		let run = -1
		world.shapes.forEach((shape, order) => {
			if (shape.t === T.ROAD && world.shapes[order - 1]?.t !== T.ROAD) run++
			if (!shape.line && !shape.rings) return
			const points = shape.line ?? shape.rings.flat()
			let x0 = Infinity,
				y0 = Infinity,
				x1 = -Infinity,
				y1 = -Infinity
			for (let i = 0; i < points.length; i += 2) {
				x0 = Math.min(x0, points[i])
				x1 = Math.max(x1, points[i])
				y0 = Math.min(y0, points[i + 1])
				y1 = Math.max(y1, points[i + 1])
			}
			const pad = (shape.w ?? 0) / 2 + KERB_EXTRA
			const entry = { shape, order, run, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad] }
			for (
				let y = Math.max(0, Math.floor((y0 - pad) / CHUNK));
				y <= Math.min(Math.ceil(world.H / CHUNK) - 1, Math.floor((y1 + pad) / CHUNK));
				y++
			) {
				for (
					let x = Math.max(0, Math.floor((x0 - pad) / CHUNK));
					x <= Math.min(Math.ceil(world.W / CHUNK) - 1, Math.floor((x1 + pad) / CHUNK));
					x++
				) {
					const key = `${x},${y}`
					if (!cells.has(key)) cells.set(key, [])
					cells.get(key).push(entry)
				}
			}
		})
		indexed.set(world, cells)
	}
	return cells.get(`${Math.floor(chunk.x / CHUNK)},${Math.floor(chunk.y / CHUNK)}`) ?? []
}

// Only segments touching this patch take part; the dash phase still starts
// at the original way's first point. Snap tangent edges to keep polygon
// booleans from inventing slivers at floating-point intersections.
function stroke(line, width, chunk, dashed = false) {
	const radius = width / 2
	const polygons = []
	const near = (ax, ay, bx, by) =>
		Math.max(ax, bx) + radius >= chunk.x &&
		Math.min(ax, bx) - radius <= chunk.x + chunk.w &&
		Math.max(ay, by) + radius >= chunk.y &&
		Math.min(ay, by) - radius <= chunk.y + chunk.h
	const disc = (x, y) => {
		const steps = Math.max(12, Math.ceil(Math.PI / Math.acos(1 - Math.min(0.01 / radius, 1))))
		const ring = Array.from({ length: steps }, (_, i) => [
			x + radius * Math.cos((i * Math.PI * 2) / steps),
			y + radius * Math.sin((i * Math.PI * 2) / steps),
		])
		ring.push(ring[0])
		polygons.push([snap(ring)])
	}
	let distance = 0
	for (let i = 0; i + 3 < line.length; i += 2) {
		const [ax, ay, bx, by] = line.slice(i, i + 4)
		const len = Math.hypot(bx - ax, by - ay)
		if (len < 1e-8) continue
		if (near(ax, ay, bx, by)) {
			const dx = (bx - ax) / len,
				dy = (by - ay) / len
			const quad = (from, to) => {
				const x0 = ax + dx * from,
					y0 = ay + dy * from
				const x1 = ax + dx * to,
					y1 = ay + dy * to
				polygons.push([
					[
						[x0 - dy * radius, y0 + dx * radius],
						[x1 - dy * radius, y1 + dx * radius],
						[x1 + dy * radius, y1 - dx * radius],
						[x0 + dy * radius, y0 - dx * radius],
						[x0 - dy * radius, y0 + dx * radius],
					],
				])
			}
			if (dashed) {
				for (let start = Math.floor(distance / (DASH + GAP)) * (DASH + GAP); start < distance + len; start += DASH + GAP) {
					const from = Math.max(0, start - distance),
						to = Math.min(len, start + DASH - distance)
					if (to > from) quad(from, to)
				}
				if (i > 0 && distance % (DASH + GAP) < DASH) disc(ax, ay)
			} else {
				const angle = Math.atan2(dy, dx)
				const steps = Math.max(6, Math.ceil(Math.PI / (2 * Math.acos(1 - Math.min(0.01 / radius, 1)))))
				const ring = []
				for (const [x, y, turn] of [
					[bx, by, -Math.PI / 2],
					[ax, ay, Math.PI / 2],
				]) {
					for (let k = 0; k <= steps; k++) {
						const a = angle + turn + (k * Math.PI) / steps
						ring.push([x + radius * Math.cos(a), y + radius * Math.sin(a)])
					}
				}
				ring.push(ring[0])
				polygons.push([snap(ring)])
			}
		}
		distance += len
	}
	const clipped = polygons.flatMap(([ring]) => {
		let points = ring.slice(0, -1)
		points = clip(points, (p) => p[0] - chunk.x)
		points = clip(points, (p) => chunk.x + chunk.w - p[0])
		points = clip(points, (p) => p[1] - chunk.y)
		points = clip(points, (p) => chunk.y + chunk.h - p[1])
		if (points.length < 3) return []
		points.push(points[0])
		return [[snap(points)]]
	})
	return union(clipped)
}

function clip(points, side) {
	const out = []
	for (let i = 0; i < points.length; i++) {
		const a = points[i],
			b = points[(i + 1) % points.length]
		const da = side(a),
			db = side(b)
		if (da >= 0) out.push(a)
		if (da < 0 !== db < 0) {
			const t = da / (da - db)
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
		}
	}
	return out
}

// Fixed pages avoid growing boxed JS arrays while a chunk is suspended.
function buffer(Type, size, normalized = false) {
	const pages = []
	let length = 0
	return {
		get length() {
			return length
		},
		push(...values) {
			for (const value of values) {
				const page = Math.floor(length / 16384)
				pages[page] ??= new Type(16384)
				pages[page][length++ % 16384] = value
			}
		},
		attribute(Output = Type) {
			const array = new Output(length)
			for (let i = 0; i < pages.length; i++) array.set(pages[i].subarray(0, Math.min(16384, length - i * 16384)), i * 16384)
			pages.length = 0
			return new THREE.BufferAttribute(array, size, normalized)
		},
	}
}

export function* buildGeometry({ world, chunk, entries }) {
	const all = (entries ?? shapesIn(world, chunk)).map((entry) => ({
		...entry,
		rings: entry.shape.rings?.map((r) => Array.from({ length: r.length / 2 }, (_, i) => [r[i * 2], r[i * 2 + 1]])),
	}))
	if (!all.length) return
	let patch
	const positions = buffer(Float32Array, 3),
		normals = buffer(Int16Array, 3, true),
		colors = buffer(Uint8Array, 3, true),
		surfaces = buffer(Uint8Array, 1),
		indices = buffer(Uint32Array, 1)
	const dx = chunk.w / (world.flat ? 1 : Math.ceil(chunk.w / GROUND_STEP))
	const dy = chunk.h / (world.flat ? 1 : Math.ceil(chunk.h / GROUND_STEP))
	const vertices = new Map()
	const add = (points, color, height, surface) => {
		if (points.length < 3) return
		const face = []
		for (const [x, y] of points) {
			const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${color.getHex()},${surface}`
			if (vertices.has(key)) {
				face.push(vertices.get(key))
				continue
			}
			const index = positions.length / 3
			vertices.set(key, index)
			face.push(index)
			positions.push(x, -y, height(x, y) + (surface ? 0.002 : 0.015))
			const [sx, sy] = world.slopeAt(x, y)
			const length = Math.hypot(sx, sy, 1)
			normals.push(Math.round((-sx / length) * 32767), Math.round((sy / length) * 32767), Math.round(32767 / length))
			colors.push(Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255))
			surfaces.push(surface)
		}
		for (let i = 1; i + 1 < face.length; i++) {
			if (face[0] !== face[i] && face[0] !== face[i + 1] && face[i] !== face[i + 1]) indices.push(face[0], face[i + 1], face[i])
		}
	}
	function* emit(polygons, color, surface = 0) {
		if (!polygons.length) return
		const area = polygonClipping.intersection(polygons, rectangle(patch.x, patch.y, patch.x + patch.w, patch.y + patch.h))
		for (let row = Math.floor((patch.y - chunk.y) / dy); row < Math.ceil((patch.y + patch.h - chunk.y) / dy); row++) {
			const y0 = chunk.y + row * dy
			const strip = polygonClipping.intersection(area, rectangle(chunk.x, y0, chunk.x + chunk.w, y0 + dy))
			for (const polygon of strip) {
				const rings = polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)))
				const points = rings.flat()
				for (const face of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
					const triangle = face.map((i) => [points[i].x, points[i].y])
					const col0 = Math.max(0, Math.floor((Math.min(...triangle.map((p) => p[0])) - chunk.x) / dx))
					const col1 = Math.min(Math.ceil(chunk.w / dx) - 1, Math.floor((Math.max(...triangle.map((p) => p[0])) - chunk.x) / dx))
					for (let col = col0; col <= col1; col++) {
						const x0 = chunk.x + col * dx
						const cell = clip(
							clip(triangle, (p) => p[0] - x0),
							(p) => x0 + dx - p[0],
						)
						// Match the ground's triangles, not its bilinear heightAt.
						const z00 = world.heightAt(x0, y0),
							z10 = world.heightAt(x0 + dx, y0),
							z01 = world.heightAt(x0, y0 + dy),
							z11 = world.heightAt(x0 + dx, y0 + dy)
						const diagonal = ([x, y]) => 1 - (x - x0) / dx - (y - y0) / dy
						add(clip(cell, diagonal), color, (x, y) => z00 + ((z10 - z00) * (x - x0)) / dx + ((z01 - z00) * (y - y0)) / dy, surface)
						add(
							clip(cell, (p) => -diagonal(p)),
							color,
							(x, y) => z11 + (z01 - z11) * (1 - (x - x0) / dx) + (z10 - z11) * (1 - (y - y0) / dy),
							surface,
						)
					}
				}
			}
			yield
		}
	}
	const ringArea = (rings) => {
		const bounds = rectangle(patch.x, patch.y, patch.x + patch.w, patch.y + patch.h)
		const clipped = rings.map((ring) => polygonClipping.intersection([ring], bounds))
		return clipped.length === 1 ? clipped[0] : polygonClipping.xor(...clipped)
	}
	const footprint = ({ shape: s, rings }, extra = 0) => (s.line ? stroke(s.line, s.w + extra, patch) : ringArea(rings))
	// Bound each boolean operation so background builds cannot monopolise a frame.
	for (let y = chunk.y; y < chunk.y + chunk.h; y += 16) {
		for (let x = chunk.x; x < chunk.x + chunk.w; x += 16) {
			vertices.clear()
			patch = { x, y, w: Math.min(16, chunk.x + chunk.w - x), h: Math.min(16, chunk.y + chunk.h - y) }
			const entries = all.filter(({ box: b }) => b[0] <= x + patch.w && b[2] >= x && b[1] <= y + patch.h && b[3] >= y)
			const bounds = rectangle(x, y, x + patch.w, y + patch.h)
			const footprints = new Map()
			const fills = entries
				.filter(({ shape: s }) => s.t !== 'mark')
				.toSorted(
					(a, b) => (a.shape.t === T.WATER ? 6.9 : a.shape.layer) - (b.shape.t === T.WATER ? 6.9 : b.shape.layer) || a.order - b.order,
				)
			const batches = new Map()
			const paint = (polygons, color, surface) => {
				if (!polygons.length) return
				const key = `${color.getHex()},${surface}`
				if (!batches.has(key)) batches.set(key, { polygons: [], color, surface })
				batches.get(key).polygons.push(polygons)
			}
			let covered = []
			for (const entry of fills.toReversed()) {
				const s = entry.shape
				let polygon = footprint(entry)
				if (s.t === T.WATER) {
					const rim = s.line ? footprint(entry, 1.06) : union(s.rings.map((r) => stroke([...r, r[0], r[1]], 1.06, patch)))
					polygon = union([polygon, rim])
				}
				footprints.set(entry, polygon)
				let visible = polygonClipping.difference(polygon, covered)
				covered = union([covered, polygon])
				// Water keeps its quay shadows and bridge decks; pitches and
				// private paths keep their markings in the coarse texture.
				if ([T.WATER, T.PITCH, T.PRIVATE].includes(s.t) || !visible.length) {
					yield
					continue
				}
				const sett = s.sett || s.t === 'sett'
				const gravel = entry.gravel ?? (s.line && s.t === T.SIDEWALK && s.w <= FOOTPATH && inPark(world.shapes, s))
				const base = sett ? SETT : s.t === 'bike' ? BIKE_LANE : s.t === 'track' ? COLORS[T.CYCLEWAY] : gravel ? GRAVEL : COLORS[s.t]
				if (!base) {
					yield
					continue
				}
				const surface = sett ? 2 : 1
				if (s.rings && OUTLINED.has(s.t)) {
					const border = union(s.rings.map((r) => stroke([...r, r[0], r[1]], SHAPE_OUTLINE, patch)))
					const edge = polygonClipping.intersection(visible, border)
					const ink = new THREE.Color(TONES[s.t] ?? base)
						.convertLinearToSRGB()
						.multiplyScalar(0.45)
						.add(new THREE.Color().setRGB(26 / 255, 30 / 255, 30 / 255).multiplyScalar(0.55))
						.convertSRGBToLinear()
					paint(edge, ink, surface)
					visible = polygonClipping.difference(visible, border)
				}
				if (s.rings && TONES[s.t]) {
					const shifted = ringArea(entry.rings.map((r) => r.map(([px, py]) => [px - TONE_SHIFT, py + TONE_SHIFT])))
					const tone = polygonClipping.intersection(visible, shifted, bounds)
					paint(tone, new THREE.Color(TONES[s.t]), surface)
					visible = polygonClipping.difference(visible, tone)
				}
				paint(visible, new THREE.Color(base), surface)
				if (gravel) {
					const border = polygonClipping.difference(footprint(entry, GRAVEL_EDGE_WIDTH), polygon, covered)
					paint(border, new THREE.Color(GRAVEL_EDGE), surface)
					covered = union([covered, border])
				}
				yield
			}
			for (const { polygons, color, surface } of batches.values()) {
				yield* emit(union(polygons), color, surface)
			}
			const runs = new Map()
			for (const entry of entries) {
				if (entry.shape.t !== T.ROAD || !entry.shape.line) continue
				if (!runs.has(entry.run)) runs.set(entry.run, [])
				runs.get(entry.run).push(entry)
			}
			for (const roads of runs.values()) {
				const edges = [[], [], []]
				for (const r of roads) {
					for (const [i, extra] of [KERB_EXTRA, INK_EXTRA, 0].entries()) edges[i].push(extra ? footprint(r, extra) : footprints.get(r))
					yield
				}
				const outer = union(edges[0])
				yield
				const inner = union(edges[1])
				yield
				const asphalt = union(edges[2])
				const last = roads.at(-1).order
				const covers = union(entries.filter((e) => e.order > last && e.shape.t !== 'mark').map((e) => footprints.get(e)))
				yield* emit(polygonClipping.difference(outer, inner, covers), new THREE.Color(KERB))
				yield* emit(polygonClipping.difference(inner, asphalt, covers), KERB_INK)
				yield
			}
			for (const entry of entries) {
				const s = entry.shape
				if (s.t === 'mark') yield* emit(stroke(s.line, Math.max(MARK_WIDTH, s.w), patch, true), new THREE.Color(MARK))
				if (s.t === 'bike')
					yield* emit(polygonClipping.difference(stroke(s.line, s.w + BIKE_EDGE * 2, patch), footprints.get(entry)), new THREE.Color(MARK))
				if (s.t === 'mark' || s.t === 'bike') yield
			}
		}
	}
	if (!positions.length) return
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', positions.attribute())
	geometry.setAttribute('normal', normals.attribute())
	geometry.setAttribute('color', colors.attribute())
	geometry.setAttribute('surface', surfaces.attribute())
	geometry.setIndex(indices.attribute(positions.length / 3 < 65535 ? Uint16Array : Uint32Array))
	geometry.computeBoundingSphere()
	geometry.computeBoundingBox()
	return geometry
}
