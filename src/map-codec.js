// A built map holds typed arrays; these turn it into plain JSON and back.

export function encodeMap(map) {
	return {
		...map,
		tiles: toBase64(map.tiles),
		streetOf: toBase64(new Uint8Array(map.streetOf.buffer)),
	}
}

export function decodeMap(json) {
	return {
		...json,
		tiles: fromBase64(json.tiles),
		streetOf: new Uint16Array(fromBase64(json.streetOf).buffer),
	}
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
