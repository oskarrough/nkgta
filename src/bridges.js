// Parapets along the edges of every bridge deck, as real walls in the 3D
// scene, so bridges stand out from the water with an inked edge and a
// shadow. A deck is wherever a road or path crosses water; the painted
// deck under them comes from map-image.js.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { T } from './tiles.js'
import { deckWidth, isDeck } from './map-image.js'

const STEP = 0.3 // tiles between the points tested along a line
const REACH = 0.4 // how far a parapet runs on past the water, tiles
const PARAPET = { width: 0.28, height: 0.36, color: '#b5b0a4' }

// Is (x, y) on the water: inside a water area, or within a canal's stroke.
function wetTest(waters) {
	const rings = waters.filter((s) => s.rings)
	const lines = waters.filter((s) => s.line)
	return (x, y) => {
		for (const s of rings) {
			let hit = false
			for (const r of s.rings) {
				for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
					const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]]
					if (yi > y !== yj > y && x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) hit = !hit
				}
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

const boxOf = (pts) => {
	const box = [Infinity, Infinity, -Infinity, -Infinity]
	for (let i = 0; i < pts.length; i += 2) {
		box[0] = Math.min(box[0], pts[i])
		box[1] = Math.min(box[1], pts[i + 1])
		box[2] = Math.max(box[2], pts[i])
		box[3] = Math.max(box[3], pts[i + 1])
	}
	return box
}
const overlaps = (a, b, pad = 0) => a[0] - pad < b[2] && a[2] + pad > b[0] && a[1] - pad < b[3] && a[3] + pad > b[1]

// The parapets of the decks whose middle lies in `area` ({ x, y, w, h } in
// tiles), as one mesh, or null if there are none.
export function createBridges(world, area, gradient) {
	const box = [area.x, area.y, area.x + area.w, area.y + area.h]
	const waters = world.shapes.filter((s) => s.t === T.WATER && overlaps(boxOf(s.rings?.flat() ?? s.line), box, 10))
	if (!waters.length) return null
	const boxes = waters.map((s) => {
		const [x0, y0, x1, y1] = boxOf(s.rings?.flat() ?? s.line)
		const pad = (s.w ?? 0) / 2
		return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
	})
	// Every stretch of deck: a segment of a line over water, and its half width.
	const spans = []
	for (const s of world.shapes) {
		if (!isDeck(s) || !overlaps(boxOf(s.line), box, 8)) continue
		const half = deckWidth(s) / 2
		const l = s.line
		for (let i = 0; i + 3 < l.length; i += 2) {
			const [ax, ay, bx, by] = [l[i], l[i + 1], l[i + 2], l[i + 3]]
			const len = Math.hypot(bx - ax, by - ay)
			const seg = [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
			// Only the waters this segment could cross are tested.
			const near = waters.filter((_, k) => overlaps(boxes[k], seg))
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
			geo.rotateZ(-Math.atan2(sp.ey, sp.ex))
			geo.translate(px, -py, PARAPET.height / 2)
			parts.push(geo)
		}
	}
	if (!parts.length) return null
	const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshToonMaterial({ color: PARAPET.color, gradientMap: gradient }))
	mesh.castShadow = true
	mesh.receiveShadow = true
	return mesh
}
