// The render path: the city is drawn, inked, and optionally drawn small,
// snapped to the palette, and blown up by whole screen pixels. Ink, sel-out
// outlines and crisp textures apply in every mode.
import * as THREE from 'three'
import { DITHER, LUT_SIZE, PALETTE_SIZE, paletteLut, paletteTexture } from './palette.js'

// One game pixel per PX_PER_TILE tiles: 3 m / 10 = 0.3 m. The upscale to the
// screen is a whole number of device pixels, so nothing gets smoothed.
export const PX_PER_TILE = 10
export const gameUpscale = (scale) => Math.max(1, Math.round(scale / PX_PER_TILE))

// Look knobs, and what the P key starts from. Palette is the default: smooth
// everywhere, ink on, every colour snapped to the palette. Pixel adds the grid.
export const PIXEL_GRID = false
export const PALETTE_SNAP = true
const INK = '#1A1E1B'
const INNER_SHADE = 0.55 // inner edges are a darker shade of their own colour
const DEPTH_EDGE = 0.012 // relative depth step that counts as a silhouette
const TURN_EDGE = 0.2 // how far a surface has to turn to count as an edge
const SILHOUETTE_PX = 2 // silhouette line width off the grid; 1 on it

// Covers the whole screen for the game-res passes, and the exact game frame
// for the upscale, which is why the quad's own transform has to apply.
const vertexShader = `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4((modelMatrix * vec4(position, 1.0)).xy, 0.0, 1.0);
}
`

// Ink at render resolution: one texel per pixel, so every decision is per
// pixel. Silhouettes go to the ink colour, inner edges to a darker shade of
// the pixel's own colour; the palette snap happens later, in the upscale.
const inkShader = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 res;
uniform float camNear;
uniform float camFar;
uniform float reach;
uniform vec3 ink;
varying vec2 vUv;

float depthAt(vec2 uv) {
	float d = texture2D(tDepth, uv).x * 2.0 - 1.0;
	return (2.0 * camNear * camFar) / (camFar + camNear - d * (camFar - camNear));
}

vec3 normalAt(vec2 uv) {
	return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
}

void main() {
	vec2 px = 1.0 / res;
	vec3 color = texture2D(tColor, vUv).rgb;

	// Silhouettes: a second difference in depth, so level ground stays quiet.
	// Only the near side of a jump is inked; reach sets how many pixels wide.
	vec2 ox = px * reach;
	float z = depthAt(vUv);
	float jx = (depthAt(vUv - vec2(ox.x, 0.0)) + depthAt(vUv + vec2(ox.x, 0.0)) - 2.0 * z) / z;
	float jy = (depthAt(vUv - vec2(0.0, ox.y)) + depthAt(vUv + vec2(0.0, ox.y)) - 2.0 * z) / z;

	// Inner edges: a crease to the right or below marks this pixel.
	vec3 n = normalAt(vUv);
	float turn = max(1.0 - dot(n, normalAt(vUv + vec2(px.x, 0.0))), 1.0 - dot(n, normalAt(vUv + vec2(0.0, px.y))));

	if (max(jx, jy) > ${DEPTH_EDGE.toFixed(3)}) color = ink;
	else if (turn > ${TURN_EDGE.toFixed(2)}) color *= ${INNER_SHADE.toFixed(2)};

	gl_FragColor = vec4(color, 1.0);
}
`

// Blow the frame up by whole pixels, and snap to the palette if it's on.
const blitShader = `
uniform sampler2D tPixels;
uniform sampler2D tPalette;
uniform sampler2D tLut;
uniform float paletteOn;
uniform float gameScale;
varying vec2 vUv;

// Ordered 4x4 Bayer, the usual recursive recipe; DITHER scales it.
float bayer2(vec2 a) {
	a = floor(a);
	return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
	return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

// The nearest palette colour, as an index, via the lookup table.
float palette(vec3 color, float dither) {
	vec3 c = clamp(color + dither, 0.0, 0.9999);
	vec2 cell = vec2(floor(c.b * ${LUT_SIZE.toFixed(1)}) * ${LUT_SIZE.toFixed(1)} + floor(c.r * ${LUT_SIZE.toFixed(1)}), floor(c.g * ${LUT_SIZE.toFixed(1)}));
	return floor(texture2D(tLut, (cell + 0.5) / vec2(${(LUT_SIZE * LUT_SIZE).toFixed(1)}, ${LUT_SIZE.toFixed(1)})).r * 255.0 + 0.5);
}

void main() {
	vec3 color = texture2D(tPixels, vUv).rgb;
	if (paletteOn > 0.5) {
		float dither = (bayer4(floor(gl_FragCoord.xy / gameScale)) - 0.5) * ${DITHER.toFixed(2)} / ${LUT_SIZE.toFixed(1)};
		float i = palette(color, dither);
		color = texture2D(tPalette, vec2((i + 0.5) / ${PALETTE_SIZE.toFixed(1)}, 0.5)).rgb;
	}
	gl_FragColor = vec4(color, 1.0);

	#include <colorspace_fragment>
}
`

// `hidden` is drawn in colour but not in the normal pass, for flat things
// with no normals to speak of.
export function createInk(renderer, hidden = []) {
	const crisp = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }
	const color = new THREE.WebGLRenderTarget(1, 1, { ...crisp, depthTexture: new THREE.DepthTexture(1, 1) })
	const normals = new THREE.WebGLRenderTarget(1, 1, crisp)
	const pixels = new THREE.WebGLRenderTarget(1, 1, crisp)
	const normalMaterial = new THREE.MeshNormalMaterial()
	const mesh = (material) => {
		const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
		quad.frustumCulled = false
		return { quad, scene: new THREE.Scene().add(quad) }
	}
	const ink = mesh(
		new THREE.ShaderMaterial({
			uniforms: {
				tColor: { value: color.texture },
				tDepth: { value: color.depthTexture },
				tNormal: { value: normals.texture },
				res: { value: new THREE.Vector2(1, 1) },
				camNear: { value: 1 },
				camFar: { value: 1000 },
				reach: { value: PIXEL_GRID ? 1 : SILHOUETTE_PX },
				ink: { value: new THREE.Color(INK) },
			},
			vertexShader,
			fragmentShader: inkShader,
			depthTest: false,
			depthWrite: false,
		}),
	)
	const blit = mesh(
		new THREE.ShaderMaterial({
			uniforms: {
				tPixels: { value: pixels.texture },
				tPalette: { value: paletteTexture() },
				tLut: { value: paletteLut() },
				paletteOn: { value: PALETTE_SNAP ? 1 : 0 },
				gameScale: { value: 1 },
			},
			vertexShader,
			fragmentShader: blitShader,
			depthTest: false,
			depthWrite: false,
		}),
	)
	const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

	// Shadows only need drawing for the colour pass, and once per frame.
	renderer.shadowMap.autoUpdate = false

	return {
		// The game frame in device pixels: the canvas rounded up to whole
		// pixels, so the upscale stays exact and only the overflow is cropped.
		frame: { width: 1, height: 1 },
		// Press P: comic (neither), palette only, then the full pixel grid.
		setLook(snap, grid) {
			blit.quad.material.uniforms.paletteOn.value = snap ? 1 : 0
			ink.quad.material.uniforms.reach.value = grid ? 1 : SILHOUETTE_PX
		},
		setSize(width, height, upscale) {
			const w = Math.max(1, Math.ceil(width / upscale))
			const h = Math.max(1, Math.ceil(height / upscale))
			color.setSize(w, h)
			normals.setSize(w, h)
			pixels.setSize(w, h)
			ink.quad.material.uniforms.res.value.set(w, h)
			blit.quad.material.uniforms.gameScale.value = upscale
			this.frame.width = w * upscale
			this.frame.height = h * upscale
			blit.quad.scale.set(this.frame.width / width, this.frame.height / height, 1)
			blit.quad.position.set(blit.quad.scale.x - 1, 1 - blit.quad.scale.y, 0)
		},
		// Into `target` instead of the screen, for a view through the portal.
		render(scene, camera, target = null) {
			ink.quad.material.uniforms.camNear.value = camera.near
			ink.quad.material.uniforms.camFar.value = camera.far
			renderer.shadowMap.needsUpdate = true
			renderer.setRenderTarget(color)
			renderer.render(scene, camera)

			scene.overrideMaterial = normalMaterial
			for (const object of hidden) object.visible = false
			renderer.setRenderTarget(normals)
			renderer.render(scene, camera)
			for (const object of hidden) object.visible = true
			scene.overrideMaterial = null

			renderer.setRenderTarget(pixels)
			renderer.render(ink.scene, screenCamera)

			renderer.setRenderTarget(target)
			renderer.render(blit.scene, screenCamera)
		},
	}
}
