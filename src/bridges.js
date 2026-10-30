import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { T } from './tiles.js'
import { deckWidth, isDeck } from './map-image.js'

const STEP = 0.3 // tiles between the points tested along a line
const REACH = 0.4 // how far a parapet runs on past the water, tiles
const PARAPET = { width: 0.28, height: 0.36, color: '#b5b0a4' }

// A water area's edges sorted into bands of rows, so a point only checks
// the edges at its own height. Worked out once per shape.
const BAND = 4
const bands = new WeakMap()
function bandsOf(s) {
	let out = bands.get(s)
	if (out) return out
	out = new Map()
	for (const r of s.rings) {
		for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
			const edge = [r[i], r[i + 1], r[j], r[j + 1]]
			const top = Math.floor(Math.max(edge[1], edge[3]) / BAND)
			for (let b = Math.floor(Math.min(edge[1], edge[3]) / BAND); b <= top; b++) {
				if (!out.has(b)) out.set(b, [])
				out.get(b).push(edge)
			}
		}
	}
	bands.set(s, out)
	return out
}

function wetTest(waters) {
	const rings = waters.filter((s) => s.rings)
	const lines = waters.filter((s) => s.line)
	return (x, y) => {
		for (const s of rings) {
			let hit = false
			for (const [xi, yi, xj, yj] of bandsOf(s).get(Math.floor(y / BAND)) ?? []) {
				if (yi > y !== yj > y && x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) hit = !hit
			}
			if (hit) return true
		}
		for (const s of lines) {
			const l = s.line
			for (let i = 0; i + 3 < l.length; i += 2) {
				const dx = l[i + 2] - l[i]
				const dy = l[i + 3] - l[i + 1]
				const t = Math.max(0, Math.min(1, ((x - l[i]) * dx + (y - l[i + 1]) * dy) / (dx * dx + dy * dy || 1)))
				if (Math.hypot(x - l[i] - t * dx, y - l[i + 1] - t * dy) < s.w / 2) return true
			}
		}
		return false
	}
}

const boxes = new WeakMap()
function boxOf(s) {
	let box = boxes.get(s)
	if (box) return box
	box = [Infinity, Infinity, -Infinity, -Infinity]
	for (const pts of s.rings ?? [s.line]) {
		for (let i = 0; i < pts.length; i += 2) {
			box[0] = Math.min(box[0], pts[i])
			box[1] = Math.min(box[1], pts[i + 1])
			box[2] = Math.max(box[2], pts[i])
			box[3] = Math.max(box[3], pts[i + 1])
		}
	}
	const pad = (s.w ?? 0) / 2
	box = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]
	boxes.set(s, box)
	return box
}
const sorted = new WeakMap()
function sort(shapes) {
	let out = sorted.get(shapes)
	if (!out) {
		out = { waters: shapes.filter((s) => s.t === T.WATER), decks: shapes.filter(isDeck) }
		sorted.set(shapes, out)
	}
	return out
}
const overlaps = (a, b, pad = 0) => a[0] - pad < b[2] && a[2] + pad > b[0] && a[1] - pad < b[3] && a[3] + pad > b[1]

// The parapets of the decks whose middle lies in `area` ({ x, y, w, h } in
// tiles), as one mesh, or null if there are none.
function createBridges(world, area, gradient) {
	const box = [area.x, area.y, area.x + area.w, area.y + area.h]
	const all = sort(world.shapes)
	const waters = all.waters.filter((s) => overlaps(boxOf(s), box, 10))
	if (!waters.length) return null
	const wbox = waters.map(boxOf)
	const spans = []
	for (const s of all.decks) {
		if (!overlaps(boxOf(s), box, 8) || !wbox.some((w) => overlaps(w, boxOf(s)))) continue
		const half = deckWidth(s) / 2
		const l = s.line
		for (let i = 0; i + 3 < l.length; i += 2) {
			const [ax, ay, bx, by] = [l[i], l[i + 1], l[i + 2], l[i + 3]]
			const len = Math.hypot(bx - ax, by - ay)
			const seg = [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
			const near = waters.filter((_, k) => overlaps(wbox[k], seg))
			if (len < 1e-3 || !near.length) continue
			const wet = wetTest(near)
			const ex = (bx - ax) / len
			const ey = (by - ay) / len
			const steps = Math.max(1, Math.ceil(len / STEP))
			let start = null
			for (let k = 0; k <= steps; k++) {
				const t = (k / steps) * len
				const on = wet(ax + ex * t, ay + ey * t)
				if (on && start === null) start = t
				if ((!on || k === steps) && start !== null) {
					const t0 = Math.max(0, start - REACH)
					const t1 = Math.min(len, (on ? t : t - len / steps) + REACH)
					if (t1 - t0 > 0.5) spans.push({ ax: ax + ex * t0, ay: ay + ey * t0, bx: ax + ex * t1, by: ay + ey * t1, ex, ey, half })
					start = null
				}
			}
		}
	}
	// A parapet on each side of each span, unless it runs over another deck,
	// as between carriageways or where a footway runs along the bridge.
	const onDeck = (x, y, self) =>
		spans.some((o) => {
			if (o === self) return false
			const dx = o.bx - o.ax
			const dy = o.by - o.ay
			const t = Math.max(0, Math.min(1, ((x - o.ax) * dx + (y - o.ay) * dy) / (dx * dx + dy * dy)))
			return Math.hypot(x - o.ax - t * dx, y - o.ay - t * dy) < o.half
		})
	const parts = []
	for (const sp of spans) {
		const len = Math.hypot(sp.bx - sp.ax, sp.by - sp.ay)
		const mx = (sp.ax + sp.bx) / 2
		const my = (sp.ay + sp.by) / 2
		if (mx < box[0] || my < box[1] || mx >= box[2] || my >= box[3]) continue
		const off = sp.half + PARAPET.width / 2
		for (const side of [1, -1]) {
			const px = mx - sp.ey * off * side
			const py = my + sp.ex * off * side
			if (onDeck(px, py, sp)) continue
			const geo = new THREE.BoxGeometry(len, PARAPET.width, PARAPET.height)
			geo.rotateY(-Math.atan((world.heightAt(sp.bx, sp.by) - world.heightAt(sp.ax, sp.ay)) / len))
			geo.rotateZ(-Math.atan2(sp.ey, sp.ex))
			geo.translate(px, -py, PARAPET.height / 2 + world.heightAt(px, py))
			parts.push(geo)
		}
	}
	if (!parts.length) return null
	const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshToonMaterial({ color: PARAPET.color, gradientMap: gradient }))
	mesh.castShadow = true
	mesh.receiveShadow = true
	return mesh
}

// As a chunk feature: the parapets in the chunk.
export function build({ world, chunk, gradient }) {
	const group = createBridges(world, chunk, gradient)
	return group && { meshes: [group] }
}
