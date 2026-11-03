export function applyMeasuredTrees(map, data) {
	if (
		!data ||
		data.version !== 1 ||
		data.tileM !== map.tileM ||
		!['south', 'west', 'north', 'east'].every((key) => data.bbox?.[key] === map.bbox[key])
	)
		return
	// Packed rows: x/y in tenths of tiles, crown/height in decimetres, stem radius in centimetres, species.
	const rows = data.trees
	if (!Array.isArray(rows) || !rows.length || rows.length % 6) return
	const trees = []
	for (let i = 0; i < rows.length; i += 6) {
		const [x, y, crown, top, stem, species] = rows.slice(i, i + 6)
		if (
			![x, y, crown, top, stem, species].every(Number.isFinite) ||
			x < 0 ||
			y < 0 ||
			x / 10 >= map.w ||
			y / 10 >= map.h ||
			crown <= 0 ||
			top <= 0 ||
			stem <= 0 ||
			!Number.isInteger(species) ||
			species < 0 ||
			species > 6
		)
			return
		trees.push({ x: x / 10, y: y / 10, crown: crown / 10, top: top / 10, stem: stem / 100, species })
	}
	map.trees = trees
}
