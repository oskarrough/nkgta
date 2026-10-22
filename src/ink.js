// The render path, for every look (see looks.js): the city is drawn off
// screen at game resolution, plain grey and unshadowed if the look asks,
// inked, then blown up by whole device pixels and snapped to the palette if
// the look asks.
import * as THREE from 'three'
import { DEFAULT_LOOK, LOOKS } from './looks.js'
import { DITHER, LUT_SIZE, PALETTE_SIZE, paletteLut, paletteTexture } from './palette.js'

const INK = '#1A1E1B'
const INNER_SHADE = 0.55 // inner edges are a darker shade of their own colour
const DEPTH_EDGE = 0.012 // relative depth step that counts as a silhouette
const TURN_EDGE = 0.2 // how far a surface has to turn to count as an edge
const PLAIN = '#c8c8c2' // everything in the plain look

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
// People (see inkOutside) are inked round their outside instead, so a figure
// a few pixels wide keeps its colours: their normals come with alpha 0.
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

bool personAt(vec2 uv) {
	return texture2D(tNormal, uv).a < 0.5;
}

// A person at uv, in front of depth z.
bool personBefore(vec2 uv, float z) {
	return personAt(uv) && depthAt(uv) < z;
}

// How far two surfaces turn from each other; on a person, only against
// another bit of person.
float turnTo(vec4 a, vec4 b) {
	if (a.a < 0.5 && b.a > 0.5) return 0.0;
	return 1.0 - dot(a.xyz * 2.0 - 1.0, b.xyz * 2.0 - 1.0);
}

void main() {
	vec2 px = 1.0 / res;
	vec3 color = texture2D(tColor, vUv).rgb;
	vec4 n = texture2D(tNormal, vUv);
	bool person = n.a < 0.5;

	// Silhouettes: a second difference in depth, so level ground stays quiet.
	// Only the near side of a jump is inked; reach sets how many pixels wide.
	vec2 ox = px * reach;
	float z = depthAt(vUv);
	float jx = (depthAt(vUv - vec2(ox.x, 0.0)) + depthAt(vUv + vec2(ox.x, 0.0)) - 2.0 * z) / z;
	float jy = (depthAt(vUv - vec2(0.0, ox.y)) + depthAt(vUv + vec2(0.0, ox.y)) - 2.0 * z) / z;

	// Round a person, the far side is inked, as far as reach.
	bool beside = !person && (
		personBefore(vUv - vec2(px.x, 0.0), z) || personBefore(vUv + vec2(px.x, 0.0), z) ||
		personBefore(vUv - vec2(0.0, px.y), z) || personBefore(vUv + vec2(0.0, px.y), z) ||
		personBefore(vUv - vec2(ox.x, 0.0), z) || personBefore(vUv + vec2(ox.x, 0.0), z) ||
		personBefore(vUv - vec2(0.0, ox.y), z) || personBefore(vUv + vec2(0.0, ox.y), z));

	// Inner edges: a crease to the right or below marks this pixel.
	float turn = max(turnTo(n, texture2D(tNormal, vUv + vec2(px.x, 0.0))), turnTo(n, texture2D(tNormal, vUv + vec2(0.0, px.y))));

	if (beside || (!person && max(jx, jy) > ${DEPTH_EDGE.toFixed(3)})) color = ink;
	else if (turn > ${TURN_EDGE.toFixed(2)}) color *= ${INNER_SHADE.toFixed(2)};

	gl_FragColor = vec4(color, 1.0);
}
`

// Ink a material's meshes round the outside, for people: in the normal pass
// it draws its own normals, marked, instead of giving way to the pass's
// material.
const normalPass = { value: 0 }
export function inkOutside(material) {
	material.allowOverride = false
	material.onBeforeCompile = (shader) => {
		shader.uniforms.inkNormals = normalPass
		shader.fragmentShader = `uniform float inkNormals;\n${shader.fragmentShader}`.replace(
			/}\s*$/,
			'\tif (inkNormals > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 0.0);\n}',
		)
	}
	return material
}

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
// with no normals to speak of. `decor` isn't drawn at all in the plain look.
export function createInk(renderer, hidden = [], decor = []) {
	const crisp = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }
	const color = new THREE.WebGLRenderTarget(1, 1, { ...crisp, depthTexture: new THREE.DepthTexture(1, 1) })
	const normals = new THREE.WebGLRenderTarget(1, 1, crisp)
	const pixels = new THREE.WebGLRenderTarget(1, 1, crisp)
	const normalMaterial = new THREE.MeshNormalMaterial()
	const plainMaterial = new THREE.MeshLambertMaterial({ color: PLAIN, side: THREE.DoubleSide })
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
				reach: { value: 1 },
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
				paletteOn: { value: 0 },
				gameScale: { value: 1 },
			},
			vertexShader,
			fragmentShader: blitShader,
			depthTest: false,
			depthWrite: false,
		}),
	)
	const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

	// The target's scissor, in screen pixels from the bottom, as game pixels
	// on the passes. The edges reach a little further in, for the ink's
	// neighbours and the blit's rounding.
	let size = { upscale: 1, overflow: 0 }
	function clip(rect) {
		for (const [t, pad] of [
			[color, 4],
			[normals, 4],
			[pixels, 2],
		]) {
			t.scissorTest = !!rect
			if (!rect) continue
			const x = Math.floor(rect.x / size.upscale) - pad
			const y = Math.floor((rect.y + size.overflow) / size.upscale) - pad
			t.scissor.set(Math.max(0, x), Math.max(0, y), Math.ceil(rect.z / size.upscale) + pad * 2, Math.ceil(rect.w / size.upscale) + pad * 2)
		}
	}

	// Shadows only need drawing for the colour pass, and once per frame.
	renderer.shadowMap.autoUpdate = false
	let look = LOOKS[DEFAULT_LOOK]

	return {
		// The game frame in device pixels: the canvas rounded up to whole
		// pixels, so the upscale stays exact and only the overflow is cropped.
		frame: { width: 1, height: 1 },
		setLook(next) {
			look = next
			inkReach()
			blit.quad.material.uniforms.paletteOn.value = look.palette ? 1 : 0
			// Cast shadows would read as holes in the plain look.
			renderer.shadowMap.enabled = !look.plain
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
			size = { upscale, overflow: h * upscale - height }
			inkReach()
		},
		// Into `target` instead of the screen, for a view through the portal.
		// A scissored target only gets its patch drawn, in every pass.
		render(scene, camera, target = null) {
			renderer.shadowMap.needsUpdate = true
			clip(target?.scissorTest ? target.scissor : null)
			const shown = decor.map((object) => object.visible)
			if (look.plain) {
				scene.overrideMaterial = plainMaterial
				for (const object of decor) object.visible = false
			}
			renderer.setRenderTarget(color)
			renderer.render(scene, camera)
			scene.overrideMaterial = null

			inkPass(scene, camera)
			decor.forEach((object, i) => (object.visible = shown[i]))
			renderer.setRenderTarget(target)
			renderer.render(blit.scene, screenCamera)
		},
	}

	// Off the grid the outline is in device pixels, so it keeps its width
	// however coarse the passes are drawn.
	function inkReach() {
		ink.quad.material.uniforms.reach.value = look.grid ? look.outline : Math.max(1, Math.round(look.outline / size.upscale))
	}

	function inkPass(scene, camera) {
		ink.quad.material.uniforms.camNear.value = camera.near
		ink.quad.material.uniforms.camFar.value = camera.far
		scene.overrideMaterial = normalMaterial
		for (const object of hidden) object.visible = false
		normalPass.value = 1
		renderer.setRenderTarget(normals)
		renderer.render(scene, camera)
		normalPass.value = 0
		for (const object of hidden) object.visible = true
		scene.overrideMaterial = null

		renderer.setRenderTarget(pixels)
		renderer.render(ink.scene, screenCamera)
	}
}
