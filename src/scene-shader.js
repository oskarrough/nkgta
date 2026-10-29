import * as THREE from 'three'

// Patterns fade to their average before they're smaller than a pixel, never
// into noise (after Slop New York). `pulse` is how much of a pixel `w` wide
// around `x` falls where fract(x) is in [a, b]: a box filter of a repeating
// band, exact. `box` is the same for a single band, [a, b] once.
export const pulse = `
float pulse(float x, float a, float b, float w) {
	float hw = max(w, 0.0001) * 0.5;
	float hi = floor(x + hw) * (b - a) + clamp(fract(x + hw), a, b) - a;
	float lo = floor(x - hw) * (b - a) + clamp(fract(x - hw), a, b) - a;
	return (hi - lo) / (2.0 * hw);
}

float box(float x, float a, float b, float w) {
	float hw = max(w, 0.0001) * 0.5;
	return clamp((min(x + hw, b) - max(x - hw, a)) / (2.0 * hw), 0.0, 1.0);
}
`

export const d = (v) => v.toFixed(3)
// The average of some colours.
export function mean(hexes) {
	const c = new THREE.Color(0, 0, 0)
	for (const hex of hexes) c.add(new THREE.Color(hex))
	return c.multiplyScalar(1 / hexes.length)
}

// A colour as a linear GLSL vec3, for baking into shader source.
export function glsl(hex) {
	const c = new THREE.Color(hex)
	return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
}
