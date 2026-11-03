import * as THREE from 'three'
import { lookOf } from './actors.js'
import { inkOutside } from './ink.js'
import { glance, dodgeStep, keepClear } from './pedestrians.js'
import { rideAt } from './feld-layout.js'
import { feld } from './feld.js'
import { market, canal } from './maybach.js'
import { weser } from './weser.js'
import { dogAt, collectPfand, interpolatePose, walkAt } from './feld-activity.js'
import { T, SOLID } from './tiles.js'
import { drawSkater } from './ride-models.js'

const fields = new WeakMap()
const PAVED = new Set([T.SIDEWALK, T.CYCLEWAY, T.GROUND])
const GLANCE = { ahead: 0, back: 0 }
const SIDES = [-1, 1]
const WHEELS = [-0.28, 0.28]
const STEP = 0.05
const visible = (p, view, pad = 5) => p.x >= view.x0 - pad && p.x <= view.x1 + pad && p.y >= view.y0 - pad && p.y <= view.y1 + pad

function remember(p) {
	const prev = p.previous
	prev.x = p.x
	prev.y = p.y
	prev.dir = p.dir
	prev.stride = p.stride
	prev.lie = p.lie ?? 0
	prev.bend = p.bend ?? 0
}
function placesOf(world) {
	let places = fields.get(world)
	if (!places) {
		places = [feld, market, canal, weser].map((definition) => {
			const field = {
				riders: [],
				dogs: [],
				collectors: [],
				...definition.layout(world),
				definition,
				chunks: new Set(),
				time: 0,
				density: 0,
				grow: 1.4,
				near: [],
				animate: [],
			}
			for (const g of field.groups)
				for (const p of g.people) {
					p.home = { x: p.x, y: p.y, dir: p.dir }
					p.appearance = lookOf(p.seed)
				}
			for (const p of [...field.riders, ...field.collectors, ...field.dogs]) {
				p.appearance = lookOf(p.seed)
				if (p.path) Object.assign(p, rideAt(p, 0))
				else p.home ??= { x: p.x, y: p.y, dir: p.dir }
			}
			for (const g of field.groups) g.kiteHolder = g.people.find((p) => p.kind === 'stand') ?? g.people[0]
			for (const p of [...field.groups.flatMap((g) => g.people), ...field.riders, ...field.collectors]) {
				p.home ??= { x: p.x, y: p.y, dir: p.dir }
				p.previous = {}
				p.render = {}
				remember(p)
				interpolatePose(p, 1)
			}
			return field
		})
		fields.set(world, places)
	}
	return places
}

export function createBusyPlaces(world, pfand, shout) {
	const fields = placesOf(world),
		people = []
	const places = fields.map((field) => createPlace(world, field, pfand, shout))
	world.closureVersion = 0
	world.carClosed = (x, y) => fields.some((field) => field.closed && field.closure.cells.has((y | 0) * world.W + (x | 0)))
	return {
		places,
		people,
		prepare(hour, day) {
			for (const field of fields)
				if (field.closure) {
					const closed = field.definition.open(hour, day)
					if (closed !== field.closed) {
						field.closed = closed
						world.closureVersion++
					}
				}
		},
		update(dt, player, view, hour, wetness, third, inside, day, temperature) {
			people.length = 0
			for (const place of places) {
				place.update(dt, player, view, hour, wetness, third, inside, day, temperature)
				for (const p of place.people) people.push(p)
			}
		},
	}
}

function createPlace(world, field, pfand, shout) {
	for (const g of field.groups) if (g.pfand) pfand.bottles.push({ ...g.pfand, can: false })
	let tick = 0,
		cooldown = 0
	const at = {},
		next = {}
	const bicycle = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, model: { length: 0.5, width: 0.25 } }
	const scare = {
		room: field.definition.room ?? GLANCE,
		threats: [],
		ok: (x, y) => field.contains(x, y) && !SOLID.has(world.tileAt(x, y)),
		shout: (p) => {
			if (p.bottle && !p.dropped) {
				pfand.drop(p.x, p.y)
				p.dropped = true
			}
			if (cooldown <= 0) {
				shout(p)
				cooldown = 3
			}
		},
	}
	return {
		id: field.definition.id,
		groups: field.groups,
		riders: field.riders,
		dogs: field.dogs,
		collectors: field.collectors,
		people: field.near,
		update(dt, player, view, hour, wetness, third, inside, day = 0, temperature = 22) {
			field.time += dt
			tick += dt
			cooldown -= dt
			field.grow = third ? 1 : 1.4
			field.detail = third || view.x1 - view.x0 < 180
			field.wetness = wetness
			field.x = player.x
			field.y = player.y
			field.hour = hour
			field.active = field.definition.open?.(hour, day) ?? true
			const b = field.bounds
			if (view.x1 < b.x0 || view.x0 > b.x1 || view.y1 < b.y0 || view.y0 > b.y1) {
				field.near.length = field.animate.length = 0
				tick = 0
				return
			}
			if (tick + 1e-9 >= STEP) {
				const elapsed = Math.floor((tick + 1e-9) / STEP) * STEP
				tick = Math.max(0, tick - elapsed)
				const step = Math.min(elapsed, 0.15),
					time = field.time - tick
				field.density = field.definition.crowd(hour, wetness, day, temperature)
				field.near.length = field.animate.length = 0
				scare.threats.length = 0
				if (!inside && player.onBike && player.speed > 0.8) {
					bicycle.x = player.x
					bicycle.y = player.y
					bicycle.vx = Math.cos(player.dir) * player.speed
					bicycle.vy = Math.sin(player.dir) * player.speed
					bicycle.angle = player.dir
					scare.threats.push(bicycle)
				}
				if (!inside && player.car && Math.hypot(player.car.vx, player.car.vy) > 1.5) scare.threats.push(player.car)
				for (const p of field.riders) {
					rideAt(p, time, at)
					p.active = p.seed < field.density && field.contains(at.x, at.y) && PAVED.has(world.tileAt(at.x, at.y))
					if (!p.active || !visible(at, view, 25)) {
						p.x = at.x
						p.y = at.y
						p.dodge = null
						p.lie = p.alert = 0
						remember(p)
						interpolatePose(p, 1)
						continue
					}
					remember(p)
					rideAt(p, time + 0.1, next)
					p.dir = Math.atan2(next.y - at.y, next.x - at.x)
					p.v = p.speed
					p.home.x = at.x
					p.home.y = at.y
					p.home.dir = p.dir
					react(p, step, scare)
					p.stride = time * p.speed * 7
					field.animate.push(p)
					if (visible(p, view)) field.near.push(p)
				}
				for (const p of field.collectors) {
					if (p.seed >= field.density || !visible(p, view, 25)) continue
					remember(p)
					collectPfand(p, pfand.bottles, step, world)
					p.home.x = p.x
					p.home.y = p.y
					p.home.dir = p.dir
					react(p, step, scare)
					field.animate.push(p)
					field.near.push(p)
				}
				for (const chunk of field.chunks) {
					const c = chunk.chunk
					if (c.x > view.x1 + 25 || c.x + c.w < view.x0 - 25 || c.y > view.y1 + 25 || c.y + c.h < view.y0 - 25) continue
					for (const g of chunk.groups) {
						if (g.open === false || g.seed >= field.density || !visible(g, view, 10)) continue
						for (const p of g.people) {
							remember(p)
							if (p.route) {
								walkAt(p, time, p.home)
								p.stride = time * 5
							}
							if (p.call && time >= (p.nextCall ?? 0) && Math.hypot(p.x - player.x, p.y - player.y) < 12) {
								scare.shout(p)
								p.nextCall = time + p.call
							}
							react(p, step, scare)
							field.animate.push(p)
							field.near.push(p)
						}
					}
				}
			}
			// Blend only the drawing pose; reactions and bottle collection keep their 20 Hz state.
			for (const p of field.animate) interpolatePose(p, tick / STEP)
			for (const d of field.dogs) {
				if (d.seed >= field.density || !visible(d.home, view, 20)) continue
				dogAt(d, field.time, d.pet)
				d.pet.bark = Math.hypot(d.pet.x - player.x, d.pet.y - player.y) < 2.5 && scare.threats.length ? 0.5 : 0
			}
			for (const chunk of field.chunks) {
				const c = chunk.chunk
				if (c.x > view.x1 + 25 || c.x + c.w < view.x0 - 25 || c.y > view.y1 + 25 || c.y + c.h < view.y0 - 25) continue
				chunk.draw(view)
			}
		},
	}
}

function react(p, dt, scare) {
	if (p.dodge) dodgeStep(p, dt, scare)
	else {
		glance(p, dt, scare, scare.room)
		if (p.dodge) {
			scare.shout(p)
			p.alert = 2.5
		} else {
			p.alert = Math.max(0, (p.alert ?? 0) - dt)
			const k = Math.min(
				1,
				dt * (p.kind === 'bike' || p.kind === 'skate' || p.kind === 'roller' || p.kind === 'child' || p.kind === 'kite' ? 12 : 1.4),
			)
			p.x += (p.home.x - p.x) * k
			p.y += (p.home.y - p.y) * k
			p.dir = p.home.dir
		}
	}
	if (scare.threats.length) keepClear(p, scare.threats, scare.ok)
}

export function build(ctx) {
	if (!ctx.world.bbox) return
	const parts = placesOf(ctx.world)
		.map((field) => buildPlace(ctx, field))
		.filter(Boolean)
	if (!parts.length) return
	return {
		meshes: parts.flatMap((p) => p.meshes),
		dispose() {
			for (const part of parts) part.dispose()
		},
	}
}

function buildPlace({ world, chunk, gradient, opening }, field) {
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
	const hasDogs = field.dogs.some((d) => owns(d.home))
	if (!groups.length && !possible && !hasDogs) return
	for (const g of groups)
		if (g.place)
			opening.watch(g.place, (open) => {
				g.open = open
			})
	const material = inkOutside(new THREE.MeshToonMaterial({ gradientMap: gradient, emissive: field.definition.glow ?? '#000000' }))
	const mesh = new THREE.InstancedMesh(
		new THREE.BoxGeometry(1, 1, 1),
		material,
		groups.length * (field.definition.parts ?? 220) + field.riders.length * 24 + field.collectors.length * 24,
	)
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
		const pose = p.render,
			k = p.appearance,
			small = p.kind === 'child' ? 0.65 : 1,
			grow = field.grow * small * (p.path && field.grow > 1 ? 1.3 : 1)
		const riding = p.kind === 'bike' || p.kind === 'child',
			skating = p.kind === 'skate' || p.kind === 'roller' || p.kind === 'kite'
		const quay = p.kind === 'quay' && !p.alert && !p.dodge
		const sitting = (p.kind === 'sit' || quay) && !p.alert && !p.dodge,
			lying = p.kind === 'lie' && !p.alert && !p.dodge
		const down = lying ? Math.PI / 2 : ((pose.lie ?? 0) * Math.PI) / 2 + (pose.bend ?? 0) * 0.4
		const ground = world.heightAt(pose.x, pose.y) + (quay ? 0.38 : sitting ? (p.seat ?? 0) : 0)
		base(pose.x, pose.y, ground + (lying ? 0.09 : 0) + (riding ? 0.16 : skating ? 0.055 : 0), pose.dir, grow, down)
		if (skating && !p.dodge && !pose.lie) {
			base(pose.x, pose.y, ground, pose.dir, grow)
			drawSkater(box, p.kind, k, pose.stride)
			return
		}
		const hip = sitting ? 0.1 : 0.24,
			chest = sitting ? 0.23 : 0.35,
			head = sitting ? 0.43 : 0.55
		box(0, 0, chest, 0.17, 0.26 * k.build, 0.25, k.top)
		box(0.02, 0, head, 0.13, 0.135, 0.14, k.skin)
		box(-0.01, 0, head + 0.075, 0.14, 0.15, 0.045, k.hat ?? k.hair)
		const detailed = field.detail && Math.hypot(pose.x - field.x, pose.y - field.y) < 90
		if (!detailed && !p.path && p.kind !== 'collector') return
		const moving = riding || skating || p.kind === 'collector' || (p.kind === 'walk' && p.home.moving),
			swing =
				p.game === 'football'
					? Math.max(0, Math.sin((field.time / 2.5 + p.playSeed + p.volley) * Math.PI)) * 0.8
					: moving
						? Math.sin(pose.stride) * 0.35
						: 0
		p.smoking = p.smoker && !p.alert && !p.dodge && Math.sin(field.time * 0.7 + p.seed * 30) > 0.2
		if (detailed || quay)
			for (const side of SIDES) {
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
				if (quay) box(0.25, side * 0.065, -0.1, 0.09, 0.09, 0.28, k.trousers)
				box(sitting ? 0.3 : 0.03, side * 0.065, quay ? -0.24 : sitting ? 0.065 : 0.035, 0.14, 0.1, 0.055, k.shoes)
				box(
					riding ? 0.09 : 0,
					side * 0.17,
					chest - 0.04,
					0.075,
					0.075,
					0.24,
					k.sleeves,
					p.smoking && side === 1
						? -1.8
						: p.game === 'frisbee'
							? -Math.max(0, Math.sin((field.time / 3.5 + p.playSeed + p.volley) * Math.PI)) * 1.2
							: riding
								? -0.8
								: skating
									? side * 0.35
									: Math.sin(field.time * 0.7 + p.seed * 30) * 0.12,
				)
				box(
					p.smoking && side === 1 ? 0.12 : riding ? 0.17 : 0.015,
					side * 0.17,
					p.smoking && side === 1 ? 0.49 : chest - 0.17,
					0.065,
					0.065,
					0.06,
					k.skin,
				)
			}
		if (p.alert) box(0.02, 0.22, head + 0.08, 0.07, 0.07, 0.18, k.skin, -0.3)
		if (p.dodge) return
		if (riding) {
			base(pose.x, pose.y, ground, pose.dir, grow)
			box(0, 0, 0.24, 0.56, 0.06, 0.06, k.top, -0.35)
			box(0.22, 0, 0.32, 0.05, 0.055, 0.28, '#c7c4b8', -0.2)
			box(0.24, 0, 0.46, 0.055, 0.32, 0.04, '#33363a')
			box(-0.12, 0, 0.38, 0.18, 0.12, 0.045, '#33363a')
			for (const x of WHEELS) {
				local.makeTranslation(x, 0, 0.18)
				wheels.setMatrixAt(wn++, matrix.multiplyMatrices(body, local))
			}
		}

		if (p.kind === 'collector') {
			box(-0.08, -0.27, 0.18, 0.23, 0.2, 0.32, '#3c453d')
			for (let i = 0; i < Math.min(5, p.collected); i++)
				box(-0.14 + (i % 2) * 0.09, -0.27, 0.37 + Math.floor(i / 2) * 0.03, 0.06, 0.06, 0.19, '#4c783e')
		}
	}
	const riders = []
	const extras = field.definition.extras({ world, chunk, field, groups, material, box, base })
	const part = {
		chunk,
		groups,
		meshes: [mesh, wheels, ...extras.meshes],
		draw(view) {
			n = 0
			wn = 0
			for (const g of groups) {
				if (
					g.open === false ||
					g.seed >= field.density ||
					(view && (g.x < view.x0 - 5 || g.x > view.x1 + 5 || g.y < view.y0 - 5 || g.y > view.y1 + 5))
				)
					continue

				for (const p of g.people) person(p)
			}
			riders.length = 0
			for (const p of field.riders) {
				const shown = p.render
				if (!p.active || !owns(shown) || (view && !visible(shown, view, 25))) continue
				riders.push(p)
				person(p)
			}
			for (const p of field.collectors) if (p.seed < field.density && owns(p.render) && (!view || visible(p.render, view, 25))) person(p)
			extras.draw(view, riders)
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
