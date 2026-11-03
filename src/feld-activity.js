import { T } from './tiles.js'

export function dogAt(dog, time) {
	const a = time * (0.38 + dog.seed * 0.22) + dog.seed * Math.PI * 2
	return {
		x: dog.home.x + Math.cos(a) * dog.radius,
		y: dog.home.y + Math.sin(a) * dog.radius * 0.65,
		dir: Math.atan2(Math.cos(a) * 0.65, -Math.sin(a)),
		stride: time * 10,
	}
}

export function gameAt(group, time) {
	const cycle = time / (group.game === 'frisbee' ? 3.5 : 2.5) + group.seed
	const t = cycle % 1,
		back = Math.floor(cycle) % 2
	const a = group.people[back ? 1 : 0],
		b = group.people[back ? 0 : 1]
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		z: group.game === 'frisbee' ? 0.45 + Math.sin(t * Math.PI) * 1.1 : 0.13 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.12,
	}
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
