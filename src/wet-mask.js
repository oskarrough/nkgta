import { T } from './tiles.js'

// Half-tile texels resolve a gutter without adding geometry or a render pass.
export function wetMask(world, chunk) {
	const scale = 2
	const w = chunk.w * scale,
		h = chunk.h * scale
	const data = new Uint8Array(w * h * 4)
	const step = 4
	const cols = Math.ceil(chunk.w / step) + 1
	const rows = Math.ceil(chunk.h / step) + 1
	const dips = new Float32Array(cols * rows)
	for (let y = 0; y < rows; y++)
		for (let x = 0; x < cols; x++) {
			const px = chunk.x + x * step,
				py = chunk.y + y * step
			const z = world.heightAt(px, py)
			const neighbours = [world.heightAt(px - 2, py), world.heightAt(px + 2, py), world.heightAt(px, py - 2), world.heightAt(px, py + 2)]
			const depth = Math.min(...neighbours) - z
			dips[y * cols + x] = Math.max(0, Math.min(1, (depth - 0.015) * 25))
		}
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const px = (x + 0.5) / scale,
				py = (y + 0.5) / scale
			const tile = world.tileAt(chunk.x + px, chunk.y + py)
			const i = (y * w + x) * 4
			data[i] = tile !== T.BUILDING && tile !== T.WATER ? 255 : 0
			const gx = px / step,
				gy = py / step,
				ix = Math.floor(gx),
				iy = Math.floor(gy),
				fx = gx - ix,
				fy = gy - iy
			const d = iy * cols + ix
			const dip = (dips[d] * (1 - fx) + dips[d + 1] * fx) * (1 - fy) + (dips[d + cols] * (1 - fx) + dips[d + cols + 1] * fx) * fy
			data[i + 1] = Math.round(255 * dip * (tile === T.ROAD || tile === T.GROUND ? 1 : 0))
			data[i + 3] = 255
		}
	for (const road of world.roads ?? []) {
		const radius = (road.kw ?? road.w) / 2
		let distance = 0
		for (let n = 1; n < road.nodes.length; n++) {
			const a = road.nodes[n - 1] * 2,
				b = road.nodes[n] * 2
			const ax = world.roadNodes[a],
				ay = world.roadNodes[a + 1]
			const dx = world.roadNodes[b] - ax,
				dy = world.roadNodes[b + 1] - ay
			const len = Math.hypot(dx, dy)
			if (len < 0.01) continue
			const x0 = Math.max(0, Math.floor((Math.min(ax, ax + dx) - radius - chunk.x) * scale))
			const x1 = Math.min(w - 1, Math.ceil((Math.max(ax, ax + dx) + radius - chunk.x) * scale))
			const y0 = Math.max(0, Math.floor((Math.min(ay, ay + dy) - radius - chunk.y) * scale))
			const y1 = Math.min(h - 1, Math.ceil((Math.max(ay, ay + dy) + radius - chunk.y) * scale))
			for (let y = y0; y <= y1; y++)
				for (let x = x0; x <= x1; x++) {
					const px = chunk.x + (x + 0.5) / scale,
						py = chunk.y + (y + 0.5) / scale
					if (world.tileAt(px, py) !== T.ROAD) continue
					const along = ((px - ax) * dx + (py - ay) * dy) / len
					if (along < 0 || along > len) continue
					if ((n === 1 && along < radius) || (n === road.nodes.length - 1 && along > len - radius)) continue
					const across = Math.abs(((px - ax) * dy - (py - ay) * dx) / len)
					const gutter = Math.max(0, 1 - Math.abs(across - (radius - 0.25)) / 0.5)
					const track = Math.max(0, 1 - Math.min(Math.abs(across - radius * 0.5 - 0.26), Math.abs(across - radius * 0.5 + 0.26)) / 0.3)
					const run = distance + along
					const broken = Math.max(0, Math.min(1, (Math.sin(run * 0.63 + road.nodes[0]) + Math.sin(run * 0.23 + across * 3) - 0.1) * 1.4))
					const amount = Math.max(gutter, track * 0.65) * broken
					const i = (y * w + x) * 4 + 1
					data[i] = Math.max(data[i], Math.round(amount * 255))
				}
			distance += len
		}
	}
	return { data, w, h }
}
