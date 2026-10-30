import { SOLID, T } from './tiles.js'

// What a step over each kind of tile costs: streets and paths are the way,
// courtyards and private passages are for shortcuts only. Nothing is cheaper
// than 1, which keeps the straight-line distance a fair estimate.
const COST = { [T.GROUND]: 3, [T.GRASS]: 1.5, [T.PLAYGROUND]: 2, [T.PITCH]: 2, [T.PRIVATE]: 4 }
const REACH = 600 // tiles; further than this, a straight line will do
const MARGIN = 30 // tiles the search may wander off the straight line's box
const EXPANSIONS = 25000

// A route over the tile grid from one spot to another, as points about
// `step` tiles apart, or null when it's too far, walled in, or not worth the search.
export function findRoute(world, from, to, step = 3) {
	if (Math.hypot(to.x - from.x, to.y - from.y) > REACH) return null
	const inside = (p) => p.x >= 0 && p.y >= 0 && p.x < world.W && p.y < world.H
	if (!inside(from) || !inside(to)) return null
	const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x)) - MARGIN)
	const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y)) - MARGIN)
	const w = Math.min(world.W, Math.ceil(Math.max(from.x, to.x)) + MARGIN) - x0
	const h = Math.min(world.H, Math.ceil(Math.max(from.y, to.y)) + MARGIN) - y0
	const at = (x, y) => (Math.floor(y) - y0) * w + (Math.floor(x) - x0)
	const start = at(from.x, from.y)
	const goal = at(to.x, to.y)

	const cost = new Float32Array(w * h).fill(Infinity)
	const parent = new Int32Array(w * h).fill(-1)
	const open = createHeap()
	const gx = Math.floor(to.x) - x0
	const gy = Math.floor(to.y) - y0
	const estimate = (i) => {
		const dx = Math.abs((i % w) - gx)
		const dy = Math.abs(((i / w) | 0) - gy)
		return dx + dy - 0.586 * Math.min(dx, dy)
	}
	// The goal and the start may stand on a wall's edge (a door); everything between may not.
	const walkable = (i, x, y) => i === goal || (x >= 0 && y >= 0 && x < w && y < h && !SOLID.has(world.tileAt(x0 + x, y0 + y)))
	const price = (x, y) => COST[world.tileAt(x0 + x, y0 + y)] ?? 1

	cost[start] = 0
	open.push(estimate(start), start)
	for (let n = 0; open.size() && n < EXPANSIONS; n++) {
		const i = open.pop()
		if (i === goal) return thin(unwind(parent, i, w, x0, y0), step)
		const x = i % w
		const y = (i / w) | 0
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue
				const nx = x + dx
				const ny = y + dy
				const j = ny * w + nx
				if (nx < 0 || ny < 0 || nx >= w || ny >= h || !walkable(j, nx, ny)) continue
				if (dx && dy && (!walkable(y * w + nx, nx, y) || !walkable(ny * w + x, x, ny))) continue
				const c = cost[i] + (dx && dy ? 1.414 : 1) * price(nx, ny)
				if (c >= cost[j]) continue
				cost[j] = c
				parent[j] = i
				open.push(c + estimate(j), j)
			}
		}
	}
	return null
}

function unwind(parent, i, w, x0, y0) {
	const pts = []
	for (; i >= 0; i = parent[i]) pts.push({ x: x0 + (i % w) + 0.5, y: y0 + ((i / w) | 0) + 0.5 })
	return pts.reverse()
}

// Every `step`th point and the last, so the line isn't a staircase.
function thin(pts, step) {
	const out = pts.filter((_, i) => i % step === 0)
	if (out.at(-1) !== pts.at(-1)) out.push(pts.at(-1))
	return out
}

// Smallest-first by priority.
function createHeap() {
	const prio = []
	const item = []
	return {
		size: () => prio.length,
		push(p, v) {
			let i = prio.push(p) - 1
			item.push(v)
			while (i > 0) {
				const up = (i - 1) >> 1
				if (prio[up] <= p) break
				prio[i] = prio[up]
				item[i] = item[up]
				i = up
			}
			prio[i] = p
			item[i] = v
		},
		pop() {
			const top = item[0]
			const p = prio.pop()
			const v = item.pop()
			const n = prio.length
			if (n) {
				let i = 0
				for (;;) {
					let c = 2 * i + 1
					if (c >= n) break
					if (c + 1 < n && prio[c + 1] < prio[c]) c++
					if (prio[c] >= p) break
					prio[i] = prio[c]
					item[i] = item[c]
					i = c
				}
				prio[i] = p
				item[i] = v
			}
			return top
		},
	}
}
