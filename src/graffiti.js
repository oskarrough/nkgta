// Graffiti the player sprays, on the wall in front of them or else on the
// ground. It belongs to the player, not the map: kept on this device under
// its own key per area, never mixed into map.json, the races or anything
// built from OSM, so it could travel elsewhere later without untangling.

export const PAINTS = ['#161616', '#F4F1E8', '#E4312B', '#F5C518', '#1F6FB2', '#2FA34A', '#E85A9B', '#6CC5E0']

// Tiles (3 m). `top` and `low` bound the nozzle above the ground on a wall;
// `arm` is how far it travels sideways from where the can went up.
export const SPRAY = { reach: 0.6, ground: 0.35, arm: 0.6, start: 0.5, low: 0.03, top: 0.8, speed: 0.5, gap: 0.012, off: 0.006 }
export const MAX_DOTS = 20000

const VERSION = 1
const keyOf = (area) => `nk-graffiti:${area ?? 'default'}`
const round = (v) => Math.round(v * 1000) / 1000

export function loadGraffiti(storage, area) {
	try {
		const saved = JSON.parse(storage.getItem(keyOf(area)) ?? 'null')
		if (saved?.v !== VERSION || !Array.isArray(saved.strokes)) return []
		return saved.strokes.filter(
			(s) => typeof s?.color === 'string' && s.n?.length === 3 && Array.isArray(s.dots) && s.dots.length >= 3 && s.dots.length % 3 === 0,
		)
	} catch {
		return []
	}
}

export function saveGraffiti(storage, area, strokes) {
	try {
		storage.setItem(keyOf(area), JSON.stringify({ v: VERSION, strokes }))
	} catch {
		// Full or blocked storage: the paint lasts until the tab closes.
	}
}

export const dotCount = (strokes) => strokes.reduce((n, s) => n + s.dots.length / 3, 0)

// The oldest paint goes first once the city is full of it.
export function trim(strokes, max = MAX_DOTS) {
	let n = dotCount(strokes)
	let drop = 0
	while (n > max && drop < strokes.length - 1) n -= strokes[drop++].dots.length / 3
	return drop ? strokes.slice(drop) : strokes
}

// Nearest building wall along a ray, from the outlines the 3D walls are raised from.
export function createWallFinder(buildings, cell = 8) {
	const grid = new Map()
	buildings.forEach((b) => {
		for (const r of b.rings)
			for (let i = 0; i + 3 < r.length; i += 2) {
				const edge = [r[i], r[i + 1], r[i + 2], r[i + 3]]
				const x0 = Math.floor(Math.min(edge[0], edge[2]) / cell)
				const x1 = Math.floor(Math.max(edge[0], edge[2]) / cell)
				const y0 = Math.floor(Math.min(edge[1], edge[3]) / cell)
				const y1 = Math.floor(Math.max(edge[1], edge[3]) / cell)
				for (let gx = x0; gx <= x1; gx++)
					for (let gy = y0; gy <= y1; gy++) {
						const k = `${gx},${gy}`
						if (!grid.has(k)) grid.set(k, [])
						grid.get(k).push(edge)
					}
			}
	})
	return function hit(x, y, dx, dy, reach) {
		let best = null
		const seen = new Set()
		for (let gx = Math.floor((x - reach) / cell); gx <= Math.floor((x + reach) / cell); gx++)
			for (let gy = Math.floor((y - reach) / cell); gy <= Math.floor((y + reach) / cell); gy++)
				for (const e of grid.get(`${gx},${gy}`) ?? []) {
					if (seen.has(e)) continue
					seen.add(e)
					const [ax, ay, bx, by] = e
					const ex = bx - ax
					const ey = by - ay
					const den = dx * ey - dy * ex
					if (Math.abs(den) < 1e-9) continue
					const t = ((ax - x) * ey - (ay - y) * ex) / den
					const s = ((ax - x) * dy - (ay - y) * dx) / den
					if (t < 0 || t > reach || s < 0 || s > 1 || (best && t >= best.t)) continue
					const len = Math.hypot(ex, ey)
					let nx = -ey / len
					let ny = ex / len
					if (nx * dx + ny * dy > 0) [nx, ny] = [-nx, -ny] // facing the sprayer
					best = { t, x: x + dx * t, y: y + dy * t, nx, ny }
				}
		return best
	}
}

// Raising the can: a wall within reach in front, or the ground before your feet.
export function raiseCan(player, hitWall, heightAt) {
	const dx = Math.cos(player.dir)
	const dy = Math.sin(player.dir)
	const wall = hitWall(player.x, player.y, dx, dy, SPRAY.reach)
	if (wall)
		return {
			wall: true,
			ox: wall.x,
			oy: wall.y,
			oz: heightAt(wall.x, wall.y),
			nx: wall.nx,
			ny: wall.ny,
			u: 0,
			v: SPRAY.start,
			heightAt,
		}
	return { wall: false, ox: player.x + dx * SPRAY.ground, oy: player.y + dy * SPRAY.ground, u: 0, v: 0, heightAt }
}

// The movement keys steer the nozzle: on a wall right is right as you face
// it and up is up; on the ground they follow the map, north up.
export function moveNozzle(can, axis, dt) {
	const step = SPRAY.speed * dt
	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
	can.u = clamp(can.u + axis.x * step, -SPRAY.arm, SPRAY.arm)
	if (can.wall) can.v = clamp(can.v - axis.y * step, SPRAY.low, SPRAY.top)
	else can.v = clamp(can.v + axis.y * step, -SPRAY.arm, SPRAY.arm)
}

// Where the nozzle points, a hair off the surface so the paint sits on it.
export function nozzleAt(can) {
	if (can.wall) {
		const x = can.ox + can.ny * can.u + can.nx * SPRAY.off
		const y = can.oy - can.nx * can.u + can.ny * SPRAY.off
		return [x, y, can.oz + can.v]
	}
	const x = can.ox + can.u
	const y = can.oy + can.v
	return [x, y, can.heightAt(x, y) + SPRAY.off]
}

export const normalOf = (can) => (can.wall ? [round(can.nx), round(can.ny), 0] : [0, 0, 1])

// Paint along the way the nozzle moved, a dot every `gap`, so a fast sweep
// is a line and not a dotted one.
export function spray(stroke, at) {
	const d = stroke.dots
	if (!d.length) {
		d.push(round(at[0]), round(at[1]), round(at[2]))
		return 1
	}
	const [lx, ly, lz] = d.slice(-3)
	const dist = Math.hypot(at[0] - lx, at[1] - ly, at[2] - lz)
	const n = Math.floor(dist / SPRAY.gap)
	for (let i = 1; i <= n; i++) {
		const t = (i * SPRAY.gap) / dist
		d.push(round(lx + (at[0] - lx) * t), round(ly + (at[1] - ly) * t), round(lz + (at[2] - lz) * t))
	}
	return n
}
