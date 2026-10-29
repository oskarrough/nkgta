import * as THREE from 'three'
import { HILLS } from './terrain.js'
import { DECK } from './clouds.js'
import { SETT_ALPHA } from './map-image.js'
import { d, glsl, pulse } from './scene-shader.js'

// What the ground is made of, drawn on top of the map's flat colours by
// world position, so it stays sharp at every zoom and costs nothing per
// building. Each is how much darker or lighter a pattern makes the ground.
const GROUND_DETAIL = {
	lawnClumps: 0.1, // darker clumps in the grass
	lawnTufts: 0.16, // single dark tufts
	yardWear: 0.08, // worn patches on courtyards and bare ground
	yardJoints: 0.08, // the gaps between their cobbles
	pavingJoints: 0.09, // and between the pavement slabs
	asphaltPatches: 0.1, // repaired patches in the tarmac
	settJoints: 0.2, // the gaps between the setts of a cobbled street
	settSize: 7, // setts per tile, about
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
const GROUND_STEP = 2
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
	return new THREE.ShaderMaterial({
		lights: true,
		uniforms,
		vertexShader: `
			uniform vec3 toSun;
			varying vec2 vUv;
			varying vec2 vTile;
			varying float vHill;
			varying vec3 vNormal;
			#include <common>
			#include <shadowmap_pars_vertex>

			void main() {
				vUv = uv;
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
			uniform vec3 shade;
			uniform bool receiveShadow;
			varying vec2 vUv;
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
				vec4 ground = texture2D(map, vUv);
				gSett = clamp((1.0 - ground.a) / ${d(SETT_ALPHA)}, 0.0, 1.0);
				vec3 color = groundDetail(ground.rgb, vTile, time);
				float lit = getShadowMask();
				color *= mix(shade, sun, lit) * vHill;
				// Sun glints on water: a few cells at a time flash a white point,
				// gone once they'd be smaller than a pixel.
				vec2 gc = floor(vTile / ${d(GROUND_DETAIL.glintCell)});
				vec2 gp = (fract(vTile / ${d(GROUND_DETAIL.glintCell)}) - 0.25 - 0.5 * vec2(gHash(gc + 3.1), gHash(gc + 7.7))) * ${d(GROUND_DETAIL.glintCell)};
				float flash = step(fract(gHash(gc) * 13.0 + time * 0.4), ${d(GROUND_DETAIL.glints)});
				float spot = step(abs(gp.x) + abs(gp.y), ${d(GROUND_DETAIL.glintSize)});
				float seen = 1.0 - smoothstep(${d(GROUND_DETAIL.glintSize * 0.5)}, ${d(GROUND_DETAIL.glintSize)}, length(fwidth(vTile)) * 1.2);
				color = mix(color, ${glsl(GLINT)}, gWater * step(0.5, lit) * flash * spot * seen);
				// The last few tiles fade into the sky under the clouds.
				vec2 edge = min(vTile * vec2(1.0, -1.0), size - vTile * vec2(1.0, -1.0));
				color = mix(deck, color, smoothstep(0.0, ${EDGE_FADE.toFixed(1)}, min(edge.x, edge.y)));
				gl_FragColor = vec4(color, 1.0);
				#include <colorspace_fragment>
			}
		`,
	})
}
// The ground's materials, told apart by the colour the map painted: green
// is lawn, dark grey is tarmac, pale grey is pavement, the khaki between is
// courtyards and bare ground. Every pattern comes in hard steps, like paint,
// and fades out before its stones get smaller than a pixel.
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

// How much of a pavement slab pattern is joint, as gStones draws it, filtered
// over a pixel w tiles wide so the joints thin into a tone, not a flicker.
float gJoints(vec2 p, float edge, vec2 w) {
	float half_ = (1.0 - edge) * 0.5;
	float jx = pulse(p.x + floor(p.y) * 0.5 + half_, 0.0, 2.0 * half_, w.x);
	float jy = pulse(p.y + half_, 0.0, 2.0 * half_, w.y);
	return 1.0 - (1.0 - jx) * (1.0 - jy);
}

// Set by groundDetail: how much of this point is water.
float gWater = 0.0;
// Set before it: how much of this point is cobbled street, from the map's alpha.
float gSett = 0.0;

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

	float clumps = gBlots(p * 0.8);
	vec2 tuft = gStones(p * 2.2);
	// Short pale dashes on open water, past the shallows, rows drifting
	// either way.
	vec2 q = p * vec2(0.9, 2.6);
	q.x += time * ${d(GROUND_DETAIL.waveDrift)} * 0.9 * (mod(floor(q.y), 2.0) * 2.0 - 1.0);
	vec2 wf = fract(q);
	f += water * (1.0 - step(0.2, lum)) * mix(0.044, step(0.72, gHash(floor(q))) * step(abs(wf.y - 0.5), 0.13) * step(abs(wf.x - 0.5), 0.3), fine) * ${d(GROUND_DETAIL.waves)};

	f -= lawn * (1.0 - pitch) * (step(0.66, clumps) * ${d(GROUND_DETAIL.lawnClumps)} * near + step(0.93, tuft.x) * step(tuft.y, 0.45) * ${d(GROUND_DETAIL.lawnTufts)} * mid);

	float wear = gBlots(p * 0.45 + 3.7);
	float setts = gSetts(p * 4.0);
	f -= yard * (step(0.64, wear) * ${d(GROUND_DETAIL.yardWear)} * near + mix(0.18, step(setts, 0.1), joint) * ${d(GROUND_DETAIL.yardJoints)});

	f -= pavement * gJoints(p * 2.0, 0.86, fwidth(p) * 2.0) * ${d(GROUND_DETAIL.pavingJoints)};

	float repair = gBlots(p * 0.3 + 11.3);
	f -= tarmac * (1.0 - gSett) * step(0.73, repair) * ${d(GROUND_DETAIL.asphaltPatches)};

	// Cobbled streets: small setts, their joints thinning into a tone before
	// they'd flicker.
	float sett = gSetts(p * ${d(GROUND_DETAIL.settSize)});
	float settJoint = 1.0 - smoothstep(${d(0.1 / GROUND_DETAIL.settSize)}, ${d(0.24 / GROUND_DETAIL.settSize)}, px);
	f -= gSett * mix(0.21, step(sett, 0.12), settJoint) * ${d(GROUND_DETAIL.settJoints)};

	return color * f;
}
`
