// Lanes run right of the centre line, or on it for one-way streets. Each
// lane knows its other half, for U-turns.
export function roadGraph(world) {
	const { roadNodes, roads = [], W, H } = world
	if (!roadNodes) return []
	const nodes = []
	const node = (i) =>
		(nodes[i] ??= {
			x: roadNodes[i * 2],
			y: roadNodes[i * 2 + 1],
			off: roadNodes[i * 2] < 1 || roadNodes[i * 2 + 1] < 1 || roadNodes[i * 2] > W - 1 || roadNodes[i * 2 + 1] > H - 1,
			out: [],
			in: [],
		})
	const uses = new Map()
	for (const r of roads) for (const n of r.nodes) uses.set(n, (uses.get(n) ?? 0) + 1)

	const edges = []
	for (const r of roads) {
		let start = 0
		for (let i = 1; i < r.nodes.length; i++) {
			if (i < r.nodes.length - 1 && uses.get(r.nodes[i]) < 2) continue
			const ids = r.nodes.slice(start, i + 1)
			start = i
			const pts = ids.map((n) => ({ x: node(n).x, y: node(n).y }))
			const lane = (points, from, to) => {
				const w = r.kw ?? r.w
				const edge = {
					from: node(from),
					to: node(to),
					w,
					rank: r.w, // the street's class by its usual width: who goes first, where buses go
					road: r,
					forward: points === pts,
					centre: points,
					lane: offsetLine(points, r.oneway ? 0 : w / 4),
					kerb: offsetLine(points, w / 2 + 0.1),
					// Tiles per second: 60 km/h on the big roads, 45 elsewhere.
					speed: r.w >= 5 ? 5.5 : 4,
				}
				edge.len = edge.lane.at(-1).s
				edge.mid = pointAt(edge.lane, edge.len / 2)
				edge.from.out.push(edge)
				edge.to.in.push(edge)
				edges.push(edge)
				return edge
			}
			const there = r.oneway >= 0 ? lane(pts, ids[0], ids.at(-1)) : null
			const back = r.oneway <= 0 ? lane([...pts].reverse(), ids.at(-1), ids[0]) : null
			if (there && back) [there.twin, back.twin] = [back, there]
		}
	}
	return edges.filter((e) => e.len > 0.1)
}

// A polyline shifted sideways (right of travel is positive), with the distance
// along it at every point.
export function offsetLine(pts, off) {
	const out = []
	let s = 0
	for (let i = 0; i < pts.length; i++) {
		const a = pts[Math.max(0, i - 1)]
		const b = pts[Math.min(pts.length - 1, i + 1)]
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
		const p = { x: pts[i].x - ((b.y - a.y) / len) * off, y: pts[i].y + ((b.x - a.x) / len) * off }
		if (out.length) s += Math.hypot(p.x - out.at(-1).x, p.y - out.at(-1).y)
		out.push({ ...p, s })
	}
	return out
}

export function pointAt(line, s) {
	for (let i = 1; i < line.length; i++) {
		const a = line[i - 1]
		const b = line[i]
		if (s > b.s && i < line.length - 1) continue
		const t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0
		return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dir: Math.atan2(b.y - a.y, b.x - a.x) }
	}
	return { x: line[0].x, y: line[0].y, dir: 0 }
}

export function project(line, x, y) {
	let best = Infinity
	let bestS = 0
	for (let i = 1; i < line.length; i++) {
		const a = line[i - 1]
		const b = line[i]
		const dx = b.x - a.x
		const dy = b.y - a.y
		const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
		const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y)
		if (d < best) [best, bestS] = [d, a.s + (b.s - a.s) * t]
	}
	return bestS
}
