// A built map holds typed arrays; these turn it into plain JSON and back.

export function encodeMap(map) {
	return {
		...map,
		tiles: toBase64(map.tiles),
		streetOf: toBase64(new Uint8Array(map.streetOf.buffer)),
		heights: toBase64(map.heights),
		buildingOf: toBase64(map.buildingOf),
	}
}

export function decodeMap(json) {
	return {
		...json,
		tiles: fromBase64(json.tiles),
		streetOf: new Uint16Array(fromBase64(json.streetOf).buffer),
		heights: fromBase64(json.heights),
		buildingOf: fromBase64(json.buildingOf),
	}
}

export function toBase64(bytes) {
	let s = ''
	// In slices, since spreading a few million bytes overflows the call stack.
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	return btoa(s)
}

export const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
