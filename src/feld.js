import * as THREE from 'three'
import { lookOf } from './actors.js'
import { glance, dodgeStep, keepClear } from './pedestrians.js'
import { feldLayout, feldCrowd, rideAt } from './feld-layout.js'
import { T, SOLID } from './tiles.js'

const fields = new WeakMap()
const blankets = ['#dc665a', '#52a5ac', '#d7ae45', '#7970af', '#ded6b9', '#5975a9']
function fieldOf(world) {
	let field = fields.get(world)
	if (!field) {
		field = { ...feldLayout(world), chunks: new Set(), time: 0, density: 1, grow: 1.4, near: [] }
		for (const g of field.groups)
			for (const p of g.people) {
				p.home = { x: p.x, y: p.y, dir: p.dir }
				p.appearance = lookOf(p.seed)
			}
		for (const p of field.riders) {
			p.appearance = lookOf(p.seed)
			Object.assign(p, rideAt(p, 0))
		}
		fields.set(world, field)
	}
	return field
}

export function createFeld(world, pfand, shout) {
	const field = fieldOf(world)
	for (const g of field.groups) pfand.bottles.push({ x: g.x + 1.4, y: g.y, can: false })
	let tick = 0,
		cooldown = 0
	const scare = {
		threats: [],
		ok: (x, y) => field.contains(x, y) && !SOLID.has(world.tileAt(x, y)),
		shout: (p) => {
			if (cooldown <= 0) {
				shout(p)
				cooldown = 3
			}
		},
	}
	return {
		groups: field.groups,
		riders: field.riders,
		people: field.near,
		update(dt, player, view, hour, wetness, third, inside) {
			field.time += dt
			tick += dt
			cooldown -= dt
			field.grow = third ? 1 : 1.4
			field.detail = third || view.x1 - view.x0 < 180
			field.x = player.x
			field.y = player.y
			if (tick < 0.05) return
			const step = Math.min(tick, 0.15)
			tick = 0
			field.density = feldCrowd(hour, wetness)
			field.near.length = 0
			const b = field.bounds
			if (view.x1 < b.x0 || view.x0 > b.x1 || view.y1 < b.y0 || view.y0 > b.y1) return
			scare.threats.length = 0
			if (!inside && player.onBike && player.speed > 0.8)
				scare.threats.push({
					x: player.x,
					y: player.y,
					vx: Math.cos(player.dir) * player.speed,
					vy: Math.sin(player.dir) * player.speed,
					angle: player.dir,
					model: { length: 0.5, width: 0.25 },
				})
			if (!inside && player.car && Math.hypot(player.car.vx, player.car.vy) > 1.5) scare.threats.push(player.car)
			const visible = (p, pad = 5) => p.x >= view.x0 - pad && p.x <= view.x1 + pad && p.y >= view.y0 - pad && p.y <= view.y1 + pad
			for (const p of field.riders) {
				const at = rideAt(p, field.time)
				p.active =
					p.seed < field.density && field.contains(at.x, at.y) && [T.SIDEWALK, T.CYCLEWAY, T.GROUND].includes(world.tileAt(at.x, at.y))
				if (!p.active || !visible(at, 15)) {
					Object.assign(p, at)
					p.dodge = null
					p.lie = 0
					p.alert = 0
					continue
				}
				const next = rideAt(p, field.time + 0.1)
				p.dir = Math.atan2(next.y - at.y, next.x - at.x)
				p.v = p.speed
				p.home = { ...at, dir: p.dir }
				react(p, step, scare)
				p.stride = field.time * p.speed * 7
				if (p.active && visible(p)) field.near.push(p)
			}
			for (const chunk of field.chunks) {
				const c = chunk.chunk
				if (c.x > view.x1 + 10 || c.x + c.w < view.x0 - 10 || c.y > view.y1 + 10 || c.y + c.h < view.y0 - 10) continue
				for (const g of chunk.groups) {
					if (g.seed >= field.density || !visible(g, 10)) continue
					for (const p of g.people) {
						react(p, step, scare)
						field.near.push(p)
					}
				}
				chunk.draw(view)
			}
		},
	}
}

function react(p, dt, scare) {
	if (p.dodge) dodgeStep(p, dt, scare)
	else {
		glance(p, dt, scare, { ahead: 0, back: 0 })
		if (p.dodge) {
			scare.shout(p)
			p.alert = 2.5
		} else {
			p.alert = Math.max(0, (p.alert ?? 0) - dt)
			const k = Math.min(1, dt * (p.kind === 'bike' || p.kind === 'skate' || p.kind === 'roller' || p.kind === 'child' ? 12 : 1.4))
			p.x += (p.home.x - p.x) * k
			p.y += (p.home.y - p.y) * k
			p.dir = p.home.dir
		}
	}
	if (scare.threats.length) keepClear(p, scare.threats, scare.ok)
}

export function build({ world, chunk, gradient }) {
	if (!world.bbox) return
	const field = fieldOf(world)
	const owns = (p) => p.x >= chunk.x && p.x < chunk.x + chunk.w && p.y >= chunk.y && p.y < chunk.y + chunk.h
	const groups = field.groups.filter(owns)
	const possible = field.riders.some((p) => {
		const points = p.path.points
		return (
			Math.min(...points.map((q) => q.x)) < chunk.x + chunk.w + 10 &&
			Math.max(...points.map((q) => q.x)) > chunk.x - 10 &&
			Math.min(...points.map((q) => q.y)) < chunk.y + chunk.h + 10 &&
			Math.max(...points.map((q) => q.y)) > chunk.y - 10
		)
	})
	if (!groups.length && !possible) return
	const material = new THREE.MeshToonMaterial({ gradientMap: gradient })
	const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, groups.length * 140 + field.riders.length * 24)
	mesh.count = 0
	mesh.castShadow = true
	mesh.frustumCulled = false
	const wheels = new THREE.InstancedMesh(
		new THREE.TorusGeometry(0.16, 0.026, 4, 10).rotateX(Math.PI / 2),
		new THREE.MeshToonMaterial({ color: '#24272b', gradientMap: gradient }),
		field.riders.length * 2,
	)
	wheels.count = 0
	wheels.frustumCulled = false
	const matrix = new THREE.Matrix4(),
		body = new THREE.Matrix4(),
		local = new THREE.Matrix4(),
		turn = new THREE.Quaternion(),
		euler = new THREE.Euler(0, 0, 0, 'ZYX'),
		pos = new THREE.Vector3(),
		scale = new THREE.Vector3(),
		color = new THREE.Color()
	let n = 0,
		wn = 0
	function box(x, y, z, l, w, h, paint, tilt = 0) {
		local.compose(pos.set(x, y, z), turn.setFromEuler(euler.set(0, tilt, 0)), scale.set(l, w, h))
		mesh.setMatrixAt(n, matrix.multiplyMatrices(body, local))
		mesh.setColorAt(n++, color.set(paint))
	}
	function base(x, y, z, dir, grow = 1, down = 0) {
		body.compose(pos.set(x, -y, z), turn.setFromEuler(euler.set(0, down, -dir)), scale.setScalar(grow))
	}
	function person(p) {
		const k = p.appearance,
			small = p.kind === 'child' ? 0.65 : 1,
			grow = field.grow * small
		const riding = ['bike', 'child'].includes(p.kind),
			skating = ['skate', 'roller'].includes(p.kind)
		const sitting = p.kind === 'sit' && !p.alert && !p.dodge,
			lying = p.kind === 'lie' && !p.alert && !p.dodge
		const down = lying ? Math.PI / 2 : ((p.lie ?? 0) * Math.PI) / 2
		const ground = world.heightAt(p.x, p.y)
		base(p.x, p.y, ground + (lying ? 0.09 : 0) + (riding ? 0.16 : skating ? 0.055 : 0), p.dir, grow, down)
		const hip = sitting ? 0.1 : 0.24,
			chest = sitting ? 0.23 : 0.35,
			head = sitting ? 0.43 : 0.55
		box(0, 0, chest, 0.17, 0.26 * k.build, 0.25, k.top)
		box(0.02, 0, head, 0.13, 0.135, 0.14, k.skin)
		box(-0.01, 0, head + 0.075, 0.14, 0.15, 0.045, k.hat ?? k.hair)
		if (!field.detail || Math.hypot(p.x - field.x, p.y - field.y) > 90) return
		const moving = riding || skating,
			swing = moving ? Math.sin(p.stride) * 0.35 : 0
		for (const side of [-1, 1]) {
			box(
				sitting ? 0.12 : 0,
				side * 0.065,
				sitting ? 0.065 : hip - 0.12,
				sitting ? 0.34 : 0.1,
				0.09,
				sitting ? 0.09 : 0.24,
				k.trousers,
				sitting ? 0 : swing * side,
			)
			box(sitting ? 0.3 : 0.03, side * 0.065, sitting ? 0.065 : 0.035, 0.14, 0.1, 0.055, k.shoes)
			box(
				riding ? 0.09 : 0,
				side * 0.17,
				chest - 0.04,
				0.075,
				0.075,
				0.24,
				k.sleeves,
				riding ? -0.8 : skating ? side * 0.35 : Math.sin(field.time * 0.7 + p.seed * 30) * 0.12,
			)
			box(riding ? 0.17 : 0.015, side * 0.17, chest - 0.17, 0.065, 0.065, 0.06, k.skin)
		}
		if (p.alert) box(0.02, 0.22, head + 0.08, 0.07, 0.07, 0.18, k.skin, -0.3)
		if (p.dodge) return
		if (riding) {
			base(p.x, p.y, ground, p.dir, grow)
			box(0, 0, 0.24, 0.56, 0.06, 0.06, k.top, -0.35)
			box(0.22, 0, 0.32, 0.05, 0.055, 0.28, '#c7c4b8', -0.2)
			box(0.24, 0, 0.46, 0.055, 0.32, 0.04, '#33363a')
			box(-0.12, 0, 0.38, 0.18, 0.12, 0.045, '#33363a')
			for (const x of [-0.28, 0.28]) {
				local.makeTranslation(x, 0, 0.18)
				wheels.setMatrixAt(wn++, matrix.multiplyMatrices(body, local))
			}
		} else if (skating) {
			base(p.x, p.y, ground, p.dir, grow)
			if (p.kind === 'skate') box(0, 0, 0.045, 0.55, 0.17, 0.035, k.top)
			for (const x of [-0.18, 0.18]) for (const side of [-1, 1]) box(x, side * 0.09, 0.035, 0.065, 0.045, 0.065, '#e1d4ac')
		}
	}
	const part = {
		chunk,
		groups,
		meshes: [mesh, wheels],
		draw(view) {
			n = 0
			wn = 0
			for (const g of groups) {
				if (g.seed >= field.density || (view && (g.x < view.x0 - 5 || g.x > view.x1 + 5 || g.y < view.y0 - 5 || g.y > view.y1 + 5)))
					continue
				base(g.x, g.y, world.heightAt(g.x, g.y) + 0.025, g.angle)
				const paint = blankets[Math.floor(g.seed * blankets.length)]
				box(0, 0, 0, 2.1, 1.5, 0.035, paint)
				for (const side of [-1, 1]) box(side * 0.8, 0, 0.022, 0.1, 1.5, 0.015, '#eadbb5')
				box(0.5, 0.35, 0.12, 0.32, 0.25, 0.24, g.seed < 0.5 ? '#ad423a' : '#377584')
				box(0.5, 0.35, 0.255, 0.34, 0.27, 0.04, '#eee3c6')
				box(-0.4, 0.4, 0.085, 0.28, 0.2, 0.17, '#bf964f')
				for (const p of g.people) person(p)
			}
			for (const p of field.riders)
				if (p.active && owns(p) && (!view || (p.x > view.x0 - 8 && p.x < view.x1 + 8 && p.y > view.y0 - 8 && p.y < view.y1 + 8))) person(p)
			mesh.count = n
			wheels.count = wn
			mesh.instanceMatrix.needsUpdate = true
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
			wheels.instanceMatrix.needsUpdate = true
		},
		dispose() {
			field.chunks.delete(part)
		},
	}
	field.chunks.add(part)
	part.draw()
	return part
}
