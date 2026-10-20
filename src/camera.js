// Zoom the player controls, plus GTA 1's zoom-out as you speed up.
import { PX } from './map-image.js'
import { gameUpscale } from './ink.js'
import { T } from './tiles.js'

export function createCamera(world) {
	let zoom = 11
	let userZoom = 11
	let cruise = 0
	let thirdPerson = false
	let suspended = false
	let yaw = 0
	let pitch = 0.35
	let distance = 3

	const active = () => thirdPerson && !suspended

	return {
		active,
		selected: () => thirdPerson,
		suspend: (value) => (suspended = value),
		toggle(target) {
			thirdPerson = !thirdPerson
			if (thirdPerson) yaw = target.dir
			return thirdPerson
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
				const horizontal = Math.cos(pitch) * distance
				const dx = -Math.cos(yaw) * horizontal
				const dy = -Math.sin(yaw) * horizontal
				// Leave room for the near plane; pull in immediately at walls.
				let fraction = 1
				const steps = Math.ceil(distance / 0.08)
				for (let i = 1; i <= steps; i++) {
					const t = i / steps
					const x = target.x + dx * t
					const y = target.y + dy * t
					if ([-0.15, 0.15].some((ox) => [-0.15, 0.15].some((oy) => world.tileAt(x + ox, y + oy) === T.BUILDING))) {
						fraction = Math.max(0.03, (i - 1) / steps)
						break
					}
				}
				return {
					scale: 24 * devicePixelRatio,
					third: {
						x: target.x + dx * fraction,
						y: target.y + dy * fraction,
						z: 0.55 + Math.sin(pitch) * distance * fraction,
						target: { x: target.x, y: target.y, z: 0.55 },
					},
					bounds: { x0: target.x - 64, y0: target.y - 64, x1: target.x + 64, y1: target.y + 64 },
				}
			}
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
