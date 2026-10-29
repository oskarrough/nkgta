import { decodeMap } from '../src/map-codec.js'

// Shared read-only: decoding the shipped map dominates these data checks.
let map
export function defaultMap() {
	return (map ??= Bun.file('public/map.json').json().then(decodeMap))
}
