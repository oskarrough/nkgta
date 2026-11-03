import { T } from './tiles.js'

export function dogAt(dog, time, out = {}) {
	const a = time * (0.38 + dog.seed * 0.22) + dog.seed * Math.PI * 2
	out.x = dog.home.x + Math.cos(a) * dog.radius
	out.y = dog.home.y + Math.sin(a) * dog.radius * 0.65
	out.dir = Math.atan2(Math.cos(a) * 0.65, -Math.sin(a))
	out.stride = time * 10
	return out
}

export function gameAt(group, time, out = {}) {
	const cycle = time / (group.game === 'frisbee' ? 3.5 : 2.5) + group.seed
	const t = cycle % 1,
		back = Math.floor(cycle) % 2
	const first = group.people[back ? 1 : 0],
		second = group.people[back ? 0 : 1]
	const a = first.render ?? first,
		b = second.render ?? second
	out.x = a.x + (b.x - a.x) * t
	out.y = a.y + (b.y - a.y) * t
	out.z = group.game === 'frisbee' ? 0.45 + Math.sin(t * Math.PI) * 1.1 : 0.13 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.12
	return out
}

export function collectPfand(p, bottles, dt, world) {
	p.bend = Math.max(0, (p.bend ?? 0) - dt)
	if (p.dodge) return
	p.seek = (p.seek ?? 0) - dt
	if (p.target && !bottles.includes(p.target)) p.target = null
	if (!p.target && p.seek <= 0) {
		p.seek = 2
		let distance = 18
		for (const b of bottles) {
			const d = Math.hypot(b.x - p.x, b.y - p.y)
			if (d >= distance || world.tileAt(b.x, b.y) !== T.GRASS) continue
			let clear = true
			for (let t = 0; t <= 1; t += 0.1)
				if (world.tileAt(p.x + (b.x - p.x) * t, p.y + (b.y - p.y) * t) !== T.GRASS) {
					clear = false
					break
				}
			if (clear) {
				p.target = b
				distance = d
			}
		}
	}
	if (!p.target) return
	const dx = p.target.x - p.x,
		dy = p.target.y - p.y,
		d = Math.hypot(dx, dy)
	if (d < 0.35) {
		bottles.splice(bottles.indexOf(p.target), 1)
		p.collected = Math.min(12, (p.collected ?? 0) + 1)
		p.bend = 0.7
		p.target = null
		return
	}
	const step = Math.min(d, 0.38 * dt)
	p.dir = Math.atan2(dy, dx)
	p.v = 0.38
	p.stride += step * 11
	p.x += (dx / d) * step
	p.y += (dy / d) * step
}

export function interpolatePose(p, alpha) {
	const from = p.previous,
		out = p.render
	out.x = from.x + (p.x - from.x) * alpha
	out.y = from.y + (p.y - from.y) * alpha
	out.dir = from.dir + Math.atan2(Math.sin(p.dir - from.dir), Math.cos(p.dir - from.dir)) * alpha
	out.stride = from.stride + (p.stride - from.stride) * alpha
	out.lie = from.lie + ((p.lie ?? 0) - from.lie) * alpha
	out.bend = from.bend + ((p.bend ?? 0) - from.bend) * alpha
	return out
}

export function walkAt(p, time, out) {
	const r = p.route,
		period = r.travel + r.pause
	const t = (time + p.seed * period * 2) % (period * 2),
		back = t >= period
	const f = Math.min(1, (t % period) / r.travel),
		u = back ? 1 - f : f
	out.moving = t % period < r.travel
	out.x = r.ax + (r.bx - r.ax) * u
	out.y = r.ay + (r.by - r.ay) * u
	out.dir = Math.atan2(r.by - r.ay, r.bx - r.ax) + (back ? Math.PI : 0)
	return out
}
