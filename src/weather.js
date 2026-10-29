// A passing shower, then a slow dry-out. Reflections are painted bands in
// the ground pass: no mirrored city, render target or extra lights.
import * as THREE from 'three'
import { T } from './tiles.js'

const LIGHTS = 12
const DROPS = 1100
const DIP_CELL = 4 // terrain's own spacing; paving still gets one texel per tile
const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007

export function createWeather(world, shops, night, search = location.search) {
	const query = new URLSearchParams(search)
	let mode = query.get('weather') === 'rain' ? 'rain' : query.get('weather') === 'dry' ? 'dry' : 'auto'
	let raining = mode === 'rain'
	let remaining = 45 + Math.random() * 90
	let wetness = raining ? 1 : 0
	let rain = raining ? 1 : 0
	let elapsed = 0
	const wet = { value: wetness }
	const positions = new Float32Array(DROPS * 6)
	const phases = new Float32Array(DROPS * 2)
	for (let i = 0; i < DROPS; i++) {
		const x = (hash(i * 3) - 0.5) * 70
		const y = (hash(i * 3 + 1) - 0.5) * 70
		positions.set([x, y, 0, x - 0.1, y + 0.04, 0.65], i * 6)
		phases[i * 2] = phases[i * 2 + 1] = hash(i * 3 + 2) * 22
	}
	const rainTime = { value: 0 }
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute('rainPhase', new THREE.BufferAttribute(phases, 1))
	const material = new THREE.LineBasicMaterial({ color: '#adc5d4', transparent: true, opacity: 0, depthWrite: false })
	material.onBeforeCompile = (shader) => {
		shader.uniforms.rainTime = rainTime
		shader.vertexShader =
			'uniform float rainTime;\nattribute float rainPhase;\n' +
			shader.vertexShader.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\ntransformed.z += mod(rainPhase - rainTime * 19.0, 22.0);',
			)
	}
	const streaks = new THREE.LineSegments(geometry, material)
	streaks.frustumCulled = false
	streaks.visible = false

	return {
		streaks,
		get mode() {
			return mode
		},
		get wetness() {
			return wetness
		},
		setMode(value) {
			mode = value
			if (mode !== 'auto') raining = mode === 'rain'
			remaining = 45 + Math.random() * 90
		},
		update(dt, player, inside) {
			elapsed += dt
			if (mode === 'auto' && (remaining -= dt) <= 0) {
				raining = !raining
				remaining = raining ? 35 + Math.random() * 55 : 90 + Math.random() * 150
			}
			rain += ((raining ? 1 : 0) - rain) * Math.min(1, dt * 0.7)
			wetness = Math.max(0, Math.min(1, wetness + dt * (raining ? 1 / 35 : -1 / 120)))
			wet.value = wetness
			streaks.visible = !inside && rain > 0.01
			material.opacity = rain * 0.45
			if (!streaks.visible) return
			rainTime.value = elapsed
			streaks.position.set(player.x, -player.y, world.heightAt(player.x, player.y))
		},
		// Each chunk keeps a small wettable/dip mask and its nearest real lamps
		// and shopfronts. A map without terrain still has shallow paving dips.
		ground(material, chunk, lamps = []) {
			const data = new Uint8Array(chunk.w * chunk.h * 4)
			// Sample terrain once on its 12 m grid, then interpolate it for the
			// tile mask. The former five height lookups per tile stalled chunk builds.
			const cols = Math.ceil(chunk.w / DIP_CELL) + 1
			const rows = Math.ceil(chunk.h / DIP_CELL) + 1
			const dips = new Float32Array(cols * rows)
			for (let y = 0; y < rows; y++) {
				for (let x = 0; x < cols; x++) {
					const px = chunk.x + x * DIP_CELL,
						py = chunk.y + y * DIP_CELL
					const h = world.heightAt(px, py)
					const east = world.heightAt(px + 2, py),
						west = world.heightAt(px - 2, py)
					const north = world.heightAt(px, py - 2),
						south = world.heightAt(px, py + 2)
					const slope = Math.max(Math.abs(east - h), Math.abs(west - h), Math.abs(north - h), Math.abs(south - h))
					const dip = (east + west + north + south) / 4 - h
					dips[y * cols + x] = Math.max(0, Math.min(1, (0.45 + dip * 25) * (1 - Math.min(1, slope * 12))))
				}
			}
			for (let y = 0; y < chunk.h; y++) {
				const gy = (y + 0.5) / DIP_CELL,
					iy = Math.floor(gy),
					fy = gy - iy
				for (let x = 0; x < chunk.w; x++) {
					const gx = (x + 0.5) / DIP_CELL,
						ix = Math.floor(gx),
						fx = gx - ix
					const d = iy * cols + ix
					const top = dips[d] * (1 - fx) + dips[d + 1] * fx
					const bottom = dips[d + cols] * (1 - fx) + dips[d + cols + 1] * fx
					const i = (y * chunk.w + x) * 4
					const tile = world.tileAt(chunk.x + x + 0.5, chunk.y + y + 0.5)
					data[i] = tile === T.ROAD || tile === T.SIDEWALK || tile === T.GROUND || tile === T.CYCLEWAY || tile === T.PRIVATE ? 255 : 0
					data[i + 1] = Math.round(255 * (top * (1 - fy) + bottom * fy))
					data[i + 3] = 255
				}
			}
			const mask = new THREE.DataTexture(data, chunk.w, chunk.h)
			mask.magFilter = THREE.LinearFilter
			mask.needsUpdate = true
			const cx = chunk.x + chunk.w / 2,
				cy = chunk.y + chunk.h / 2
			const sources = [
				...lamps.map((l) => ({
					x: l.x + Math.cos(l.angle ?? 0) * (l.main ? 0.73 : 0.36),
					y: l.y + Math.sin(l.angle ?? 0) * (l.main ? 0.73 : 0.36),
					h: l.main ? 3.07 : 1.84,
					shop: 0,
				})),
				...shops
					.filter((s) => Math.abs(s.x - cx) < chunk.w / 2 + 8 && Math.abs(s.y - cy) < chunk.h / 2 + 8)
					.map((s) => ({ x: s.x, y: s.y, h: 0.9, shop: 1 })),
			]
				.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
				.slice(0, LIGHTS)
			const lights = Array.from({ length: LIGHTS }, (_, i) => {
				const s = sources[i]
				return s ? new THREE.Vector4(s.x, -s.y, world.heightAt(s.x, s.y) + s.h, s.shop) : new THREE.Vector4(-1e5, -1e5, 0, 0)
			})
			Object.assign(material.uniforms, {
				wetness: wet,
				wetNight: night,
				wetMask: { value: mask },
				wetRect: { value: new THREE.Vector4(chunk.x, chunk.y, chunk.w, chunk.h) },
				wetLights: { value: lights },
			})
			material.vertexShader =
				'varying float wetZ;\n' +
				material.vertexShader.replace('vTile = worldPosition.xy;', 'vTile = worldPosition.xy; wetZ = worldPosition.z;')
			material.fragmentShader =
				wetShader +
				material.fragmentShader.replace('// The last few tiles fade', 'color = wetGround(color, vTile, time);\n// The last few tiles fade')
			material.addEventListener('dispose', () => mask.dispose())
		},
	}
}

// Forward declarations: groundDetail supplies the same stable ink noise.
const wetShader = `
uniform float wetness;
uniform float wetNight;
uniform sampler2D wetMask;
uniform vec4 wetRect;
uniform vec4 wetLights[${LIGHTS}];
varying float wetZ;
float gNoise(vec2 p);
vec3 wetGround(vec3 color, vec2 p, float time) {
	if (wetness < 0.001) return color;
	vec2 mask = texture2D(wetMask, (p * vec2(1.0, -1.0) - wetRect.xy) / wetRect.zw).rg;
	float wet = wetness * mask.r;
	if (wet < 0.001) return color;
	color *= 1.0 - wet * 0.28;
	float blot = gNoise(p * 1.6) * 0.65 + gNoise(p * 4.3) * 0.35;
	float puddle = step(0.8 - mask.g * 0.15, blot) * smoothstep(0.45, 0.95, wet) * step(0.08, mask.g);
	// Broad, flat blue-grey highlights rather than a glossy PBR surface.
	float sheen = step(0.68, gNoise(p * 0.5)) * wet * wet;
	color = mix(color, vec3(0.24, 0.32, 0.39) * (1.0 - wetNight * 0.7), puddle * 0.5 + sheen * 0.12);
	float reflectivity = puddle * 0.75 + sheen * 0.06;
	if (wetNight > 0.01 && reflectivity > 0.001) {
		float ripple = sin(time * 2.0 + p.x * 9.0) * 0.12;
		for (int i = 0; i < ${LIGHTS}; i++) {
			vec4 light = wetLights[i];
			float h = max(0.1, light.z - wetZ);
			vec2 reflected = mix(light.xy, cameraPosition.xy, h / (max(0.2, cameraPosition.z - wetZ) + h));
			vec2 delta = p - reflected;
			if (dot(delta, delta) > 9.0) continue;
			vec2 toward = cameraPosition.xy - light.xy;
			toward /= max(length(toward), 0.001);
			float across = abs(dot(delta, vec2(-toward.y, toward.x)));
			float along = abs(dot(delta, toward));
			float band = step(0.3, fract(dot(p, toward) * 7.0 + ripple));
			float reflection = (1.0 - smoothstep(0.15, 0.6 + light.w * 0.4, across)) * (1.0 - smoothstep(0.3, 2.0, along)) * band;
			color += mix(vec3(0.85, 0.66, 0.3), vec3(0.8, 0.38, 0.2), light.w) * reflection * wetNight * reflectivity;
		}
	}
	return color;
}
`

export function tuneWeather(form, weather) {
	const label = document.createElement('label')
	label.textContent = 'Wetter '
	const select = document.createElement('select')
	for (const [value, text] of [
		['auto', 'Automatisch'],
		['rain', 'Regen'],
		['dry', 'Trocken'],
	]) {
		select.add(new Option(text, value))
	}
	select.value = weather.mode
	select.addEventListener('change', () => weather.setMode(select.value))
	label.append(select)
	form.append(label)
}
