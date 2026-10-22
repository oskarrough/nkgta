// A built map holds typed arrays and long coordinate lists; these turn it
// into compact plain JSON and back. Decoding gives back exactly the map that
// was encoded, down to the last tile.
//
// Grids go as runs, [value, count, value, count, …]: most of the city is long
// stretches of the same tile. Coordinates are already rounded to a tenth of
// a tile, so they go as whole tenths, each the step from the one before.

export function encodeMap(map) {
	return {
		...map,
		tiles: toRuns(map.tiles),
		streetOf: toRuns(map.streetOf),
		shapes: map.shapes.map((s) => (s.line ? { ...s, line: toSteps(s.line) } : { ...s, rings: s.rings.map(toSteps) })),
		buildings: map.buildings.map((b) => ({ ...b, rings: b.rings.map(toSteps) })),
		trees: {
			xy: toSteps(map.trees.flatMap((t) => [t.x, t.y])),
			size: map.trees.flatMap((t) => [Math.round(t.crown * 10), Math.round(t.top * 10)]),
		},
		roadNodes: toSteps(map.roadNodes),
	}
}

export function decodeMap(json) {
	const xy = fromSteps(json.trees.xy)
	const { size } = json.trees
	return {
		...json,
		tiles: fromRuns(json.tiles, new Uint8Array(json.w * json.h)),
		streetOf: fromRuns(json.streetOf, new Uint16Array(json.w * json.h)),
		shapes: json.shapes.map((s) => (s.line ? { ...s, line: fromSteps(s.line) } : { ...s, rings: s.rings.map(fromSteps) })),
		buildings: json.buildings.map((b) => ({ ...b, rings: b.rings.map(fromSteps) })),
		trees: Array.from({ length: size.length / 2 }, (_, i) => ({
			x: xy[i * 2],
			y: xy[i * 2 + 1],
			crown: size[i * 2] / 10,
			top: size[i * 2 + 1] / 10,
		})),
		roadNodes: fromSteps(json.roadNodes),
	}
}

function toRuns(grid) {
	const runs = []
	for (let i = 0; i < grid.length;) {
		let j = i + 1
		while (j < grid.length && grid[j] === grid[i]) j++
		runs.push(grid[i], j - i)
		i = j
	}
	return runs
}

function fromRuns(runs, grid) {
	for (let k = 0, i = 0; k < runs.length; k += 2) {
		grid.fill(runs[k], i, i + runs[k + 1])
		i += runs[k + 1]
	}
	return grid
}

// [x, y, x, y, …] in tenths, each x and y as the step from the previous one.
function toSteps(pts) {
	const out = new Array(pts.length)
	let px = 0
	let py = 0
	for (let i = 0; i < pts.length; i += 2) {
		const x = Math.round(pts[i] * 10)
		const y = Math.round(pts[i + 1] * 10)
		out[i] = x - px
		out[i + 1] = y - py
		px = x
		py = y
	}
	return out
}

function fromSteps(steps) {
	const out = new Array(steps.length)
	let x = 0
	let y = 0
	for (let i = 0; i < steps.length; i += 2) {
		x += steps[i]
		y += steps[i + 1]
		out[i] = x / 10
		out[i + 1] = y / 10
	}
	return out
}

export function toBase64(bytes) {
	let s = ''
	// In slices, since spreading a few million bytes overflows the call stack.
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	return btoa(s)
}

export function fromBase64(b64) {
	if (Uint8Array.fromBase64) return Uint8Array.fromBase64(b64)
	const s = atob(b64)
	const bytes = new Uint8Array(s.length)
	for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
	return bytes
}
