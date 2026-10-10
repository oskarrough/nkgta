// Everything that ends up on the canvas, once per frame.
import { PX, renderMapImage } from './map-image.js'
import { iconSprites, labelSprites, LABEL_PX } from './sprites.js'

export function createRenderer(canvas, world) {
	const ctx = canvas.getContext('2d', { alpha: false })
	const mips = renderMapImage(world)
	const icons = iconSprites()
	const labels = labelSprites(world.labels.map((l) => l.name))

	function resize() {
		canvas.width = innerWidth * devicePixelRatio
		canvas.height = innerHeight * devicePixelRatio
	}
	addEventListener('resize', resize)
	resize()

	return function draw({ cam, player, bottles, showStreetNames }) {
		const { scale } = cam
		const toScreen = (x, y) => [x * scale - cam.x, y * scale - cam.y]
		const onScreen = (sx, sy, pad) => sx > -pad && sy > -pad && sx < canvas.width + pad && sy < canvas.height + pad

		ctx.fillStyle = '#222'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		let level = 0
		while (level + 1 < mips.length && PX / 2 ** (level + 1) >= scale) level++
		// Below 8 px a tile, crisp pixels snap to the screen grid and the map
		// stutters past in whole-pixel steps. Smoothing lets it glide.
		ctx.imageSmoothingEnabled = scale < 8
		ctx.imageSmoothingQuality = 'high'
		ctx.drawImage(mips[level], -cam.x, -cam.y, world.W * scale, world.H * scale)
		ctx.imageSmoothingEnabled = true

		for (const b of bottles) {
			const [sx, sy] = toScreen(b.x, b.y)
			if (!onScreen(sx, sy, 20)) continue
			ctx.fillStyle = b.can ? '#c0c4c8' : '#3d7a3a'
			ctx.fillRect(sx - scale * 0.12, sy - scale * 0.3, scale * 0.24, scale * 0.6)
		}

		const icon = Math.max(10 * devicePixelRatio, scale * 1.4)
		for (const p of world.pois) {
			const [sx, sy] = toScreen(p.x, p.y)
			if (onScreen(sx, sy, icon)) ctx.drawImage(icons[p.kind], sx - icon / 2, sy - icon / 2, icon, icon)
		}

		if (showStreetNames) {
			const k = (13 / LABEL_PX) * devicePixelRatio
			for (const l of world.labels) {
				const [sx, sy] = toScreen(l.x, l.y)
				const c = labels[l.name]
				if (!onScreen(sx, sy, c.width * k)) continue
				const cos = Math.cos(l.angle) * k
				const sin = Math.sin(l.angle) * k
				ctx.setTransform(cos, sin, -sin, cos, sx, sy)
				ctx.drawImage(c, -c.width / 2, -c.height / 2)
			}
			ctx.setTransform(1, 0, 0, 1, 0, 0)
		}

		if (player.onBike) drawBike(...toScreen(player.x, player.y), player.dir)
		else drawBike(...toScreen(player.bike.x, player.bike.y), 0)
		drawPerson(...toScreen(player.x, player.y), player.dir)

		function drawBike(sx, sy, dir) {
			ctx.save()
			ctx.translate(sx, sy)
			ctx.rotate(dir)
			ctx.fillStyle = '#d23c3c'
			ctx.fillRect(-scale * 0.6, -scale * 0.12, scale * 1.2, scale * 0.24)
			ctx.fillStyle = '#111'
			ctx.fillRect(-scale * 0.7, -scale * 0.08, scale * 0.25, scale * 0.16)
			ctx.fillRect(scale * 0.45, -scale * 0.08, scale * 0.25, scale * 0.16)
			ctx.restore()
		}

		function drawPerson(sx, sy, dir) {
			ctx.fillStyle = '#f2d24b'
			ctx.strokeStyle = '#222'
			ctx.lineWidth = scale * 0.08
			ctx.beginPath()
			ctx.arc(sx, sy, scale * 0.38, 0, Math.PI * 2)
			ctx.fill()
			ctx.stroke()
			ctx.fillStyle = '#222'
			ctx.beginPath()
			ctx.arc(sx + Math.cos(dir) * scale * 0.2, sy + Math.sin(dir) * scale * 0.2, scale * 0.08, 0, Math.PI * 2)
			ctx.fill()
		}
	}
}
