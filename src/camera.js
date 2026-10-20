// Zoom the player controls, plus GTA 1's zoom-out as you speed up.
import { PX } from './map-image.js'
import { gameUpscale } from './ink.js'

export function createCamera() {
	let zoom = 11
	let userZoom = 11
	let cruise = 0

	return {
		zoomBy: (f) => (userZoom = Math.max(0.5, Math.min(24, userZoom * f))),

		// Screen pixels per tile, and the top-left corner, centred on `target`.
		update(target, canvas, dt, pixelGrid) {
			// Follow a slow average of speed, so bumping into walls doesn't pump the zoom.
			cruise += (Math.abs(target.speed) - cruise) * Math.min(1, dt * 1.5)
			// Only a touch: flat out you see about a fifth further than on foot.
			const out = Math.min(1, Math.max(0.8, 1 - cruise * 0.02))
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
