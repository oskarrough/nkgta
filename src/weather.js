// A passing shower, then a slow dry-out. Reflections are painted bands in
// the ground pass: no mirrored city, render target or extra lights.
import * as THREE from 'three'
import { furnitureIn } from './kerbs.js'
import { T } from './tiles.js'

const LIGHTS = 12
const DROPS = 1100
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
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
	const material = new THREE.LineBasicMaterial({ color: '#adc5d4', transparent: true, opacity: 0, depthWrite: false })
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
			const ground = world.heightAt(player.x, player.y)
			for (let i = 0; i < DROPS; i++) {
				const x = player.x + (hash(i * 3) - 0.5) * 70
				const y = -player.y + (hash(i * 3 + 1) - 0.5) * 70
				const z = ground + ((((hash(i * 3 + 2) * 22 - elapsed * 19) % 22) + 22) % 22)
				const n = i * 6
				positions[n] = x
				positions[n + 1] = y
				positions[n + 2] = z
				positions[n + 3] = x - 0.1
				positions[n + 4] = y + 0.04
				positions[n + 5] = z + 0.65
			}
			geometry.attributes.position.needsUpdate = true
		},
		// Each chunk keeps a small wettable/dip mask and its nearest real lamps
		// and shopfronts. A map without terrain still has shallow paving dips.
		ground(material, chunk) {
			const data = new Uint8Array(chunk.w * chunk.h * 4)
			for (let y = 0; y < chunk.h; y++) {
				for (let x = 0; x < chunk.w; x++) {
					const px = chunk.x + x + 0.5,
						py = chunk.y + y + 0.5
					const h = world.heightAt(px, py)
					const neighbours = [
						[2, 0],
						[-2, 0],
						[0, 2],
						[0, -2],
					].map(([dx, dy]) => world.heightAt(px + dx, py + dy))
					const slope = Math.max(...neighbours.map((n) => Math.abs(n - h)))
					const dip = neighbours.reduce((a, b) => a + b, 0) / 4 - h
					const i = (y * chunk.w + x) * 4
					data[i] = [T.ROAD, T.SIDEWALK, T.GROUND, T.CYCLEWAY, T.PRIVATE].includes(world.tileAt(px, py)) ? 255 : 0
					data[i + 1] = Math.round(255 * Math.max(0, Math.min(1, (0.45 + dip * 25) * (1 - Math.min(1, slope * 12)))))
					data[i + 3] = 255
				}
			}
			const mask = new THREE.DataTexture(data, chunk.w, chunk.h)
			mask.magFilter = THREE.LinearFilter
			mask.needsUpdate = true
			const cx = chunk.x + chunk.w / 2,
				cy = chunk.y + chunk.h / 2
			const lamps = furnitureIn(world, { x: chunk.x - 8, y: chunk.y - 8, w: chunk.w + 16, h: chunk.h + 16 }, 4).lamps
			const sources = [
				...lamps.map((l) => ({
					x: l.x + Math.cos(l.angle) * (l.main ? 0.73 : 0.36),
					y: l.y + Math.sin(l.angle) * (l.main ? 0.73 : 0.36),
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
	color *= 1.0 - wet * 0.28;
	float blot = gNoise(p * 1.6) * 0.65 + gNoise(p * 4.3) * 0.35;
	float puddle = step(0.8 - mask.g * 0.15, blot) * smoothstep(0.45, 0.95, wet) * step(0.08, mask.g);
	// Broad, flat blue-grey highlights rather than a glossy PBR surface.
	float sheen = step(0.68, gNoise(p * 0.5)) * wet * wet;
	color = mix(color, vec3(0.24, 0.32, 0.39) * (1.0 - wetNight * 0.7), puddle * 0.5 + sheen * 0.12);
	if (wetNight > 0.01 && wet > 0.3) {
		for (int i = 0; i < ${LIGHTS}; i++) {
			vec4 light = wetLights[i];
			float h = max(0.1, light.z - wetZ);
			vec2 reflected = mix(light.xy, cameraPosition.xy, h / (max(0.2, cameraPosition.z - wetZ) + h));
			vec2 toward = cameraPosition.xy - light.xy;
			toward /= max(length(toward), 0.001);
			vec2 delta = p - reflected;
			float across = abs(dot(delta, vec2(-toward.y, toward.x)));
			float along = abs(dot(delta, toward));
			float band = step(0.3, fract(dot(p, toward) * 7.0 + sin(time * 2.0 + p.x * 9.0) * 0.12));
			float reflection = (1.0 - smoothstep(0.15, 0.6 + light.w * 0.4, across)) * (1.0 - smoothstep(0.3, 2.0, along)) * band;
			color += mix(vec3(0.85, 0.66, 0.3), vec3(0.8, 0.38, 0.2), light.w) * reflection * wetNight * (puddle * 0.75 + sheen * 0.06);
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
