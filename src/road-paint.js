import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import { CHUNK } from './chunks.js'
import { GROUND_STEP } from './scene-ground.js'
import { T, KERB, MARK } from './tiles.js'

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

function shapesIn(world, chunk) {
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

export function* build({ world, chunk, ground }) {
	const all = shapesIn(world, chunk)
	if (!all.some(({ shape: s }) => s.line && (s.t === T.ROAD || s.t === 'mark' || s.t === 'bike'))) return
	let patch
	const positions = [],
		normals = [],
		colors = [],
		indices = []
	const dx = chunk.w / (world.flat ? 1 : Math.ceil(chunk.w / GROUND_STEP))
	const dy = chunk.h / (world.flat ? 1 : Math.ceil(chunk.h / GROUND_STEP))
	const vertices = new Map()
	const add = (points, color, height) => {
		if (points.length < 3) return
		const face = []
		for (const [x, y] of points) {
			const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${color.getHex()}`
			if (vertices.has(key)) {
				face.push(vertices.get(key))
				continue
			}
			const index = positions.length / 3
			vertices.set(key, index)
			face.push(index)
			positions.push(x, -y, height(x, y) + 0.005)
			const [sx, sy] = world.slopeAt(x, y)
			const length = Math.hypot(sx, sy, 1)
			normals.push(-sx / length, sy / length, 1 / length)
			colors.push(color.r, color.g, color.b)
		}
		for (let i = 1; i + 1 < face.length; i++) {
			if (face[0] !== face[i] && face[0] !== face[i + 1] && face[i] !== face[i + 1]) indices.push(face[0], face[i + 1], face[i])
		}
	}
	function* emit(polygons, color) {
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
						add(clip(cell, diagonal), color, (x, y) => z00 + ((z10 - z00) * (x - x0)) / dx + ((z01 - z00) * (y - y0)) / dy)
						add(
							clip(cell, (p) => -diagonal(p)),
							color,
							(x, y) => z11 + (z01 - z11) * (1 - (x - x0) / dx) + (z10 - z11) * (1 - (y - y0) / dy),
						)
					}
				}
			}
			yield
		}
	}
	const footprint = ({ shape: s }, extra = 0) =>
		s.line
			? stroke(s.line, s.w + extra, patch)
			: [s.rings.map((r) => Array.from({ length: r.length / 2 }, (_, i) => [r[i * 2], r[i * 2 + 1]]))]
	// Bound each boolean operation so background builds cannot monopolise a frame.
	for (let y = chunk.y; y < chunk.y + chunk.h; y += 16) {
		for (let x = chunk.x; x < chunk.x + chunk.w; x += 16) {
			patch = { x, y, w: Math.min(16, chunk.x + chunk.w - x), h: Math.min(16, chunk.y + chunk.h - y) }
			const entries = all.filter(({ box: b }) => b[0] <= x + patch.w && b[2] >= x && b[1] <= y + patch.h && b[3] >= y)
			const runs = new Map()
			for (const entry of entries) {
				if (entry.shape.t !== T.ROAD || !entry.shape.line) continue
				if (!runs.has(entry.run)) runs.set(entry.run, [])
				runs.get(entry.run).push(entry)
			}
			for (const roads of runs.values()) {
				const edges = [[], [], []]
				for (const r of roads) {
					for (const [i, extra] of [KERB_EXTRA, INK_EXTRA, 0].entries()) edges[i].push(footprint(r, extra))
					yield
				}
				const outer = union(edges[0])
				yield
				const inner = union(edges[1])
				yield
				const asphalt = union(edges[2])
				const last = roads.at(-1).order
				const covers = union(entries.filter((e) => e.order > last && e.shape.t !== 'mark').map((e) => footprint(e)))
				yield* emit(polygonClipping.difference(outer, inner, covers), new THREE.Color(KERB))
				yield* emit(polygonClipping.difference(inner, asphalt, covers), KERB_INK)
				yield
			}
			for (const entry of entries) {
				const s = entry.shape
				if (s.t === 'mark') yield* emit(stroke(s.line, Math.max(MARK_WIDTH, s.w), patch, true), new THREE.Color(MARK))
				if (s.t === 'bike')
					yield* emit(polygonClipping.difference(stroke(s.line, s.w + BIKE_EDGE * 2, patch), footprint(entry)), new THREE.Color(MARK))
				if (s.t === 'mark' || s.t === 'bike') yield
			}
		}
	}
	if (!positions.length) return
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
	geometry.setIndex(indices)
	geometry.computeBoundingSphere()
	// Furniture has already added rain to the ground. Share its uniforms,
	// including the wet mask, without owning or allocating another texture.
	const material = new THREE.ShaderMaterial({
		uniforms: { ...ground.uniforms },
		vertexShader: ground.vertexShader,
		fragmentShader: ground.fragmentShader,
		defines: { ROAD_PAINT: '' },
		vertexColors: true,
		lights: true,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.receiveShadow = true
	return { meshes: [mesh] }
}
