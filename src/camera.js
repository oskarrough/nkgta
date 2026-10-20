// Zoom the player controls, plus GTA 1's zoom-out as you speed up.
import { PX } from './map-image.js'
import { gameUpscale } from './ink.js'
import { T } from './tiles.js'
import { forwardSpeed } from './car.js'

export function createCamera(world) {
	let zoom = 11
	let userZoom = 11
	let cruise = 0
	let thirdPerson = false
	let suspended = false
	let yaw = 0
	let pitch = 0.35
	let distance = 3
	let looking = false
	let returnDelay = 0
	let speedDistance = 0
	let aheadX = 0
	let aheadY = 0
	let boom = null

	const active = () => thirdPerson && !suspended

	return {
		active,
		selected: () => thirdPerson,
		suspend: (value) => (suspended = value),
		toggle(target) {
			thirdPerson = !thirdPerson
			if (thirdPerson) yaw = target.dir
			boom = null
			speedDistance = aheadX = aheadY = 0
			return thirdPerson
		},
		setLooking(value) {
			if (looking && !value) returnDelay = 1.2
			looking = value
		},
		look(dx, dy) {
			if (!active()) return
			yaw += dx * 0.004
			pitch = Math.max(0.05, Math.min(1.25, pitch + dy * 0.004))
		},
		move(axis) {
			if (!active()) return axis
			return {
				x: -axis.y * Math.cos(yaw) - axis.x * Math.sin(yaw),
				y: -axis.y * Math.sin(yaw) + axis.x * Math.cos(yaw),
			}
		},
		zoomBy(f) {
			if (active()) distance = Math.max(0.8, Math.min(8, distance / f))
			else userZoom = Math.max(0.5, Math.min(24, userZoom * f))
		},

		// Screen pixels per tile, and the top-left corner, centred on `target`.
		// `closer` zooms in on top of the player's zoom, as inside a shop.
		update(target, canvas, dt, pixelGrid, closer = 1) {
			if (active()) {
				const vehicle = target.car || target.onBike
				const moving = vehicle && Math.abs(target.speed) > 0.12
				returnDelay = Math.max(0, returnDelay - dt)
				const following = moving && !looking && returnDelay === 0
				if (following) {
					// Follow the vehicle's nose, including in reverse; velocity would
					// whip the view round by 180° as soon as you backed up.
					const turn = Math.atan2(Math.sin(target.dir - yaw), Math.cos(target.dir - yaw))
					yaw += turn * (1 - Math.exp(-1.8 * dt))
				}
				const ease = 1 - Math.exp(-2.5 * dt)
				const extra = vehicle ? Math.min(2, Math.abs(target.speed) * 0.14) + (target.car?.model.length ?? 0) * 0.35 : 0
				speedDistance += (extra - speedDistance) * ease
				const pace = target.car ? forwardSpeed(target.car) : target.speed
				const lead = following ? Math.max(-1, Math.min(1.5, pace * 0.16)) : 0
				aheadX += (Math.cos(target.dir) * lead - aheadX) * ease
				aheadY += (Math.sin(target.dir) * lead - aheadY) * ease
				const height = 0.55 + Math.max(0, (target.car?.model.length ?? 0) - 1.5) * 0.15
				const reach = distance + speedDistance
				const horizontal = Math.cos(pitch) * reach
				const dx = -Math.cos(yaw) * horizontal
				const dy = -Math.sin(yaw) * horizontal
				// Leave room for the near plane; pull in immediately at walls.
				let fraction = 1
				const steps = Math.ceil(reach / 0.08)
				for (let i = 1; i <= steps; i++) {
					const t = i / steps
					const x = target.x + dx * t
					const y = target.y + dy * t
					if ([-0.15, 0.15].some((ox) => [-0.15, 0.15].some((oy) => world.tileAt(x + ox, y + oy) === T.BUILDING))) {
						fraction = Math.max(0.03, (i - 1) / steps)
						break
					}
				}
				// Never ease through a wall. Only the return to open space is soft.
				const clear = reach * fraction
				boom = boom === null || clear < boom ? clear : boom + (clear - boom) * (1 - Math.exp(-3 * dt))
				fraction = boom / reach
				return {
					scale: 24 * devicePixelRatio,
					third: {
						x: target.x + dx * fraction,
						y: target.y + dy * fraction,
						z: height + Math.sin(pitch) * boom,
						target: { x: target.x + aheadX, y: target.y + aheadY, z: height },
					},
					bounds: { x0: target.x - 64, y0: target.y - 64, x1: target.x + 64, y1: target.y + 64 },
				}
			}
			boom = null
			// Follow a slow average of speed, so bumping into walls doesn't pump the zoom.
			cruise += (Math.abs(target.speed) - cruise) * Math.min(1, dt * 1.5)
			// Only a touch: flat out you see about a fifth further than on foot.
			const out = Math.min(1, Math.max(0.8, 1 - cruise * 0.02)) * closer
			if (pixelGrid) {
				// On the pixel grid every in-between zoom redraws every pixel, so
				// zoom jumps straight there, and speed zooms out in two steps.
				zoom = (userZoom * Math.round(out * 10)) / 10
			} else {
				const want = userZoom * out
				zoom += (want - zoom) * Math.min(1, dt * 3)
				// Settle for good, or the zoom creeps on for seconds.
				if (Math.abs(want - zoom) < 0.002) zoom = want
			}
			const scale = PX * zoom * devicePixelRatio
			// Whole game pixels only, so a slow pan shifts the picture a pixel
			// at a time instead of smearing it between pixels.
			const snap = pixelGrid ? gameUpscale(scale) : 1
			return {
				scale,
				x: Math.round((target.x * scale - canvas.width / 2) / snap) * snap,
				y: Math.round((target.y * scale - canvas.height / 2) / snap) * snap,
			}
		},
	}
}
