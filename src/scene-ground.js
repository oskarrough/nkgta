import * as THREE from 'three'
import { HILLS } from './terrain.js'
import { SURFACE } from './ground-surface.js'
import { DECK } from './clouds.js'
import { d, glsl, pulse } from './scene-shader.js'

// What the ground is made of, drawn on top of the map's flat colours by
// world position, so it stays sharp at every zoom and costs nothing per
// building. Each is how much darker or lighter a pattern makes the ground.
const GROUND_DETAIL = {
	lawnClumps: 0.1, // darker clumps in the grass
	lawnTufts: 0.16, // single dark tufts
	yardWear: 0.08, // worn patches on courtyards and bare ground
	yardJoints: 0.08, // the gaps between their cobbles
	asphaltPatches: 0.1, // repaired patches in the tarmac
	settJoints: 0.2, // the gaps between the setts of a cobbled street
	waves: 0.65, // pale wave dashes on water
	waveDrift: 0.15, // and how fast they drift, tiles a second
	glints: 0.035, // share of sunlit water cells sparkling at any moment
	glintCell: 1.3, // tiles, one glint at most in each
	glintSize: 0.13, // tiles
}
const GLINT = '#ffffff'
// Tiles over which the ground fades into the sky at the map edge.
const EDGE_FADE = 3
// A chunk's ground, in world coordinates: one quad where the land is flat,
// else a mesh following its rises and dips, a vertex every GROUND_STEP
// tiles, its normals from the slope so neighbouring chunks shade alike.
export const GROUND_STEP = 2
const HILLSHADE = HILLS.shade
export function groundGeometry(chunk, world) {
	const flat = world.flat
	const cols = flat ? 1 : Math.ceil(chunk.w / GROUND_STEP)
	const rows = flat ? 1 : Math.ceil(chunk.h / GROUND_STEP)
	const geo = new THREE.PlaneGeometry(chunk.w, chunk.h, cols, rows).translate(chunk.x + chunk.w / 2, -(chunk.y + chunk.h / 2), 0)
	const pos = geo.attributes.position
	const nor = geo.attributes.normal
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i)
		const y = -pos.getY(i)
		pos.setZ(i, world.heightAt(x, y))
		const [sx, sy] = world.slopeAt(x, y)
		const len = Math.hypot(sx, sy, 1)
		nor.setXYZ(i, -sx / len, sy / len, 1 / len)
	}
	geo.computeBoundingSphere()
	return geo
}

// The map image keeps its own colours: the ground samples the shadow map and
// multiplies by the hour's sun or shade, so nothing is lit twice.
export function groundMaterial(map, world) {
	const uniforms = THREE.UniformsUtils.merge([
		THREE.UniformsLib.lights,
		{
			sun: { value: new THREE.Color() },
			deck: { value: new THREE.Color(DECK) },
			time: { value: 0 },
			size: { value: new THREE.Vector2(world.W, world.H) },
			shade: { value: new THREE.Color() },
			toSun: { value: new THREE.Vector3(0, 0, 1) },
		},
	])
	uniforms.map = { value: map }
	uniforms.tileM = { value: world.tileM ?? 3 }
	uniforms.mapRect = { value: new THREE.Vector4(0, 0, world.W, world.H) }
	return new THREE.ShaderMaterial({
		lights: true,
		uniforms,
		vertexShader: `
			uniform vec3 toSun;
			#ifdef ROAD_PAINT
				attribute float surface;
				attribute vec2 paving;
				uniform vec4 mapRect;
			#endif
			varying vec2 vUv;
			#ifdef ROAD_PAINT
				varying vec3 vPaint;
				varying float vSurface;
				varying vec2 vPaving;
			#endif
			varying vec2 vTile;
			varying float vHill;
			varying vec3 vNormal;
			#include <common>
			#include <shadowmap_pars_vertex>

			void main() {
				vUv = uv;
				#ifdef ROAD_PAINT
					vPaint = color;
					vSurface = surface;
					vPaving = paving;
					vUv = vec2((position.x - mapRect.x) / mapRect.z, 1.0 - (-position.y - mapRect.y) / mapRect.w);
				#endif
				// Slopes towards the sun a touch brighter, away from it darker,
				// and no more so when the sun is low.
				vHill = 1.0 + (dot(normal, toSun) - toSun.z) / max(toSun.z, 0.6) * ${d(HILLSHADE)};
				#include <beginnormal_vertex>
				#include <defaultnormal_vertex>
				vNormal = transformedNormal;
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vTile = worldPosition.xy;
				#include <shadowmap_vertex>
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform sampler2D map;
			uniform vec3 sun;
			uniform vec3 deck;
			uniform vec2 size;
			uniform float time;
			uniform float tileM;
			uniform vec3 shade;
			uniform bool receiveShadow;
			varying vec2 vUv;
			#ifdef ROAD_PAINT
				varying vec3 vPaint;
				varying float vSurface;
				varying vec2 vPaving;
			#endif
			varying vec2 vTile;
			varying float vHill;
			varying vec3 vNormal;
			// For the ink, see ink.js.
			#define INK_NORMAL vNormal
			#include <common>
			#include <shadowmap_pars_fragment>
			#include <shadowmask_pars_fragment>
			${groundDetail}

			void main() {
				#ifdef ROAD_PAINT
					vec4 ground = texture2D(map, vUv);
					vec3 color = vPaint;
					if (vSurface > 1.5) color = surfaceDetail(vPaint, vPaving, vTile * tileM, vSurface) * ground.a;
					else if (vSurface > 0.5) color = groundDetail(vPaint, vTile, time) * ground.a;
				#else
				vec4 ground = texture2D(map, vUv);
				vec3 color = groundDetail(ground.rgb, vTile, time) * ground.a;
				#endif
				float lit = getShadowMask();
				color *= mix(shade, sun, lit) * vHill;
				#ifndef ROAD_PAINT
				// Sun glints on water: a few cells at a time flash a white point,
				// gone once they'd be smaller than a pixel.
				vec2 gc = floor(vTile / ${d(GROUND_DETAIL.glintCell)});
				vec2 gp = (fract(vTile / ${d(GROUND_DETAIL.glintCell)}) - 0.25 - 0.5 * vec2(gHash(gc + 3.1), gHash(gc + 7.7))) * ${d(GROUND_DETAIL.glintCell)};
				float flash = step(fract(gHash(gc) * 13.0 + time * 0.4), ${d(GROUND_DETAIL.glints)});
				float spot = step(abs(gp.x) + abs(gp.y), ${d(GROUND_DETAIL.glintSize)});
				float seen = 1.0 - smoothstep(${d(GROUND_DETAIL.glintSize * 0.5)}, ${d(GROUND_DETAIL.glintSize)}, length(fwidth(vTile)) * 1.2);
				color = mix(color, ${glsl(GLINT)}, gWater * step(0.5, lit) * flash * spot * seen);
				#endif
				// The last few tiles fade into the sky under the clouds.
				vec2 edge = min(vTile * vec2(1.0, -1.0), size - vTile * vec2(1.0, -1.0));
				color = mix(deck, color, smoothstep(0.0, ${EDGE_FADE.toFixed(1)}, min(edge.x, edge.y)));
				gl_FragColor = vec4(color, 1.0);
				#include <colorspace_fragment>
			}
		`,
	})
}
// Geometry carries explicit surface IDs; remaining painted areas retain
// their colour classification. Fine detail fades before it can shimmer.
const groundDetail = `
${pulse}
float gHash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float gNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float gBlots(vec2 p) {
	return gNoise(p) * 0.6 + gNoise(p * 2.3 + 7.1) * 0.4;
}

// Stones or slabs in staggered rows: x is the stone's own random, y how close to its
// edge this point is (0 in the middle, 1 on the joint).
vec2 gStones(vec2 p) {
	p.x += floor(p.y) * 0.5;
	vec2 cell = floor(p);
	vec2 f = abs(fract(p) - 0.5) * 2.0;
	return vec2(gHash(cell), max(f.x, f.y));
}

// Irregular stones: how close this point is to the joint between the
// nearest two, 0 on the joint.
float gSetts(vec2 p) {
	vec2 cell = floor(p);
	float f1 = 8.0;
	float f2 = 8.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 c = cell + vec2(x, y);
			vec2 o = c + 0.2 + 0.6 * vec2(gHash(c), gHash(c + 17.0)) - p;
			float dist = dot(o, o);
			if (dist < f1) {
				f2 = f1;
				f1 = dist;
			} else if (dist < f2) f2 = dist;
		}
	}
	return sqrt(f2) - sqrt(f1);
}

// Box-filter the joints; stone variation disappears before a stone spans
// fewer than two pixels. Derivatives are taken before staggering the rows.
float gRows(vec2 q, vec2 width, vec2 gap, float contrast, float variation) {
	float seen = 1.0 - smoothstep(0.22, 0.65, max(width.x, width.y));
	q.x += mod(floor(q.y), 2.0) * 0.5;
	float jx = pulse(q.x + gap.x * 0.5, 0.0, gap.x, width.x);
	float jy = pulse(q.y + gap.y * 0.5, 0.0, gap.y, width.y);
	float average = 1.0 - (1.0 - gap.x) * (1.0 - gap.y);
	float joints = mix(average, 1.0 - (1.0 - jx) * (1.0 - jy), seen);
	float tone = (step(0.5, gHash(floor(q))) - 0.5) * variation * seen;
	return 1.0 - joints * contrast + tone;
}

float gCobbles(vec2 uv) {
	vec2 size = vec2(0.18, 0.22);
	vec2 width = fwidth(uv.yx);
	vec2 q = uv.yx / size;
	float seen = 1.0 - smoothstep(0.22, 0.65, max(width.x / size.x, width.y / size.y));
	q.x += mod(floor(q.y), 2.0) * 0.5;
	float stone = gHash(floor(q));
	float radius = 0.018;
	vec2 inset = abs(fract(q) - 0.5) * size - (size * 0.5 - radius - 0.006 - stone * 0.003);
	float edge = length(max(inset, 0.0)) + min(max(inset.x, inset.y), 0.0) - radius;
	float pixel = max(max(width.x, width.y), 0.0001);
	float joint = mix(0.15, smoothstep(-pixel * 0.5, pixel * 0.5, edge), seen);
	return 1.0 - joint * ${d(GROUND_DETAIL.settJoints)} + (stone - 0.5) * 0.065 * seen;
}

vec3 surfaceDetail(vec3 color, vec2 uv, vec2 metres, float surface) {
	vec2 width = fwidth(uv);
	if (surface < ${d(SURFACE.setts + 0.5)}) {
		return color * gCobbles(uv);
	}
	if (abs(surface - ${d(SURFACE.asphalt)}) < 0.5) {
		vec2 grain = metres * 12.5;
		float seen = 1.0 - smoothstep(0.22, 0.7, max(fwidth(grain).x, fwidth(grain).y));
		float repair = step(0.73, gBlots(metres * 0.1 + 11.3));
		return color * (1.0 - repair * ${d(GROUND_DETAIL.asphaltPatches)} + (gNoise(grain) - 0.5) * 0.025 * seen);
	}
	vec2 slabSize = vec2(0.9, 1.5);
	float slab = gRows((uv + vec2(0.0, 0.75)) / slabSize, width / slabSize, vec2(0.008) / slabSize, 0.18, 0.035);
	if (surface > ${d(SURFACE.square - 0.5)}) return color * slab;
	float mosaic = gRows(uv / 0.09, width / 0.09, vec2(0.008 / 0.09), 0.18, 0.07);
	float band = 1.0 - smoothstep(0.75 - width.y, 0.75 + max(width.y, 0.0001), abs(uv.y));
	float seen = 1.0 - smoothstep(0.18, 0.6, max(width.x, width.y));
	return color * mix(0.98, mix(mosaic * 0.96, slab * 1.025, band), seen);
}

// Set by groundDetail: how much of this point is water.
float gWater = 0.0;

vec3 groundDetail(vec3 color, vec2 p, float time) {
	float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
	float green = color.g - max(color.r, color.b);
	float grey = 1.0 - smoothstep(0.03, 0.08, max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b)) - lum * 0.25);
	float lawn = smoothstep(0.05, 0.09, green);
	// Pitches are a bluer green than lawns and keep their mown look, water
	// a teal: green and blue well over red and close to each other.
	float pitch = lawn * smoothstep(0.5, 0.58, color.b / max(color.r, 0.001));
	float water = step(0.045, lum) * step(color.r * 1.5, color.g) * step(color.r * 1.5, color.b) * (1.0 - step(0.035, abs(color.g - color.b)));
	// Glints only off water in the sun, not in a quay wall's shadow.
	gWater = water * step(0.075, lum);
	float tarmac = grey * (1.0 - water) * (1.0 - smoothstep(0.1, 0.14, lum));
	float pavement = grey * (1.0 - water) * smoothstep(0.3, 0.36, lum);
	float yard = grey * (1.0 - water) * (1.0 - tarmac) * (1.0 - pavement) * smoothstep(0.15, 0.19, lum);

	// Tiles per screen pixel: fine patterns fade before they shimmer.
	float px = length(fwidth(p));
	float fine = 1.0 - smoothstep(0.05, 0.1, px);
	float mid = 1.0 - smoothstep(0.15, 0.3, px);
	// Cobble joints are thinner, so they go sooner.
	float joint = 1.0 - smoothstep(0.025, 0.06, px);
	// Blotches turn into camouflage across a whole park, so far out the
	// ground goes back to flat fills.
	float near = 1.0 - smoothstep(0.05, 0.12, px);
	float f = 1.0;

	// Short pale dashes on open water, past the shallows, rows drifting
	// either way.
	vec2 q = p * vec2(0.9, 2.6);
	q.x += time * ${d(GROUND_DETAIL.waveDrift)} * 0.9 * (mod(floor(q.y), 2.0) * 2.0 - 1.0);
	vec2 wf = fract(q);
	f += water * (1.0 - step(0.2, lum)) * mix(0.044, step(0.72, gHash(floor(q))) * step(abs(wf.y - 0.5), 0.13) * step(abs(wf.x - 0.5), 0.3), fine) * ${d(GROUND_DETAIL.waves)};

	if (lawn > 0.0 && pitch < 1.0) {
		float clumps = gBlots(p * 0.8);
		vec2 tuft = gStones(p * 2.2);
		f -= lawn * (1.0 - pitch) * (step(0.66, clumps) * ${d(GROUND_DETAIL.lawnClumps)} * near + step(0.93, tuft.x) * step(tuft.y, 0.45) * ${d(GROUND_DETAIL.lawnTufts)} * mid);
	}
	if (yard > 0.0) {
		float wear = gBlots(p * 0.45 + 3.7);
		float setts = gSetts(p * 4.0);
		f -= yard * (step(0.64, wear) * ${d(GROUND_DETAIL.yardWear)} * near + mix(0.18, step(setts, 0.1), joint) * ${d(GROUND_DETAIL.yardJoints)});
	}

	return color * f;
}
`
