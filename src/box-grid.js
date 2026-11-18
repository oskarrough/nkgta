export function boxGrid(items, bounds, size = 16) {
	const cells = new Map()
	for (const it of items) {
		const [x0, y0, x1, y1] = bounds(it)
		for (let y = Math.floor(y0 / size); y <= Math.floor(y1 / size); y++) {
			for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++) {
				const key = y * 65536 + x
				if (!cells.has(key)) cells.set(key, [])
				cells.get(key).push(it)
			}
		}
	}
	return (x, y) => cells.get(Math.floor(y / size) * 65536 + Math.floor(x / size)) ?? []
}
