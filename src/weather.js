// A passing shower, then a slow dry-out. Reflections are painted bands in
// the ground pass: no mirrored city, render target or extra lights.
import * as THREE from 'three'
import { wetMask } from './wet-mask.js'
import { signColor } from './signs.js'

const LIGHTS = 8
const MOVING_LIGHTS = 4
const DROPS = 1100
const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007

export function createWeather(world, shops, night, search = location.search, opening) {
	const query = new URLSearchParams(search)
	let mode = query.get('weather') === 'rain' ? 'rain' : query.get('weather') === 'dry' ? 'dry' : 'auto'
	let raining = mode === 'rain'
	let remaining = 45 + Math.random() * 90
	let wetness = raining ? 1 : 0
	let rain = raining ? 1 : 0
	let elapsed = 0
	const wet = { value: wetness }
	let signals = []
	const moving = { value: Array.from({ length: MOVING_LIGHTS }, () => new THREE.Vector4(-1e5, -1e5, 0, 0)) }
	const movingColors = { value: Array.from({ length: MOVING_LIGHTS }, () => new THREE.Color()) }
	const signalColors = { red: '#ff3b2a', redamber: '#ff3b2a', amber: '#ffb020', green: '#3ce36a' }
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
		setSignals(lights) {
			signals = lights
		},
		reflectCars(cars, view) {
			if (wetness < 0.001 || night.value < 0.01) return
			const distance = (s) => (s.x - view.x) ** 2 + (-s.y - view.y) ** 2
			const nearestSignals = signals
				.filter((s) => distance(s) < 900)
				.sort((a, b) => distance(a) - distance(b))
				.slice(0, 2)
			const nearestCars = cars
				.filter((s) => distance(s) < 900)
				.sort((a, b) => distance(a) - distance(b))
				.slice(0, 2)
			for (let i = 0; i < MOVING_LIGHTS; i++) {
				const light = i < 2 ? nearestSignals[i] : nearestCars[i - 2]
				const at = moving.value[i]
				if (!light) {
					at.set(-1e5, -1e5, 0, 0)
					continue
				}
				const car = i >= 2
				const x = light.x + (car ? (Math.cos(light.angle) * light.model.length) / 2 : 0)
				const y = light.y + (car ? (Math.sin(light.angle) * light.model.length) / 2 : 0)
				at.set(x, -y, world.heightAt(x, y) + (car ? 0.22 : 0.9), car ? 0.5 : 0)
				movingColors.value[i].set(car ? '#fff0c4' : (signalColors[light.state] ?? '#ff3b2a'))
			}
		},
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
		ground(material, chunk, lamps = []) {
			const { data, w, h } = wetMask(world, chunk)
			const mask = new THREE.DataTexture(data, w, h)
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
					.map((s) => ({ x: s.x, y: s.y, h: 0.9, shop: 1, source: s })),
			]
				.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
				.slice(0, LIGHTS)
			const lights = Array.from({ length: LIGHTS }, (_, i) => {
				const s = sources[i]
				return s ? new THREE.Vector4(s.x, -s.y, world.heightAt(s.x, s.y) + s.h, s.shop) : new THREE.Vector4(-1e5, -1e5, 0, 0)
			})
			const colors = sources.map((s) => new THREE.Color(s.shop ? signColor(s.source.name) : '#e9bd78'))
			while (colors.length < LIGHTS) colors.push(new THREE.Color(0))
			const unwatch = sources.flatMap((s, i) =>
				s.shop && opening
					? [
							opening.watch(s.source.place, (open) => {
								colors[i].set(open ? signColor(s.source.name) : 0)
							}),
						]
					: [],
			)
			Object.assign(material.uniforms, {
				wetness: wet,
				wetNight: night,
				wetMask: { value: mask },
				wetRect: { value: new THREE.Vector4(chunk.x, chunk.y, chunk.w, chunk.h) },
				wetLights: { value: lights },
				wetColors: { value: colors },
				wetMoving: moving,
				wetMovingColors: movingColors,
			})
			material.vertexShader =
				'varying float wetZ;\n' +
				material.vertexShader.replace('vTile = worldPosition.xy;', 'vTile = worldPosition.xy; wetZ = worldPosition.z;')
			material.fragmentShader =
				wetShader +
				material.fragmentShader.replace('// The last few tiles fade', 'color = wetGround(color, vTile, time);\n// The last few tiles fade')
			material.addEventListener('dispose', () => {
				mask.dispose()
				for (const stop of unwatch) stop()
			})
		},
	}
}

const wetShader = `
uniform float wetness;
uniform float wetNight;
uniform sampler2D wetMask;
uniform vec4 wetRect;
uniform vec4 wetLights[${LIGHTS}];
uniform vec3 wetColors[${LIGHTS}];
uniform vec4 wetMoving[${MOVING_LIGHTS}];
uniform vec3 wetMovingColors[${MOVING_LIGHTS}];
varying float wetZ;
float wetReflection(vec4 light, vec2 p, float ripple) {
	float h = max(0.1, light.z - wetZ);
	vec2 reflected = mix(light.xy, cameraPosition.xy, h / (max(0.2, cameraPosition.z - wetZ) + h));
	vec2 delta = p - reflected;
	if (dot(delta, delta) > 16.0) return 0.0;
	vec2 toward = cameraPosition.xy - light.xy;
	toward /= max(length(toward), 0.001);
	float across = abs(dot(delta, vec2(-toward.y, toward.x)));
	float along = abs(dot(delta, toward));
	float band = 0.35 + 0.65 * smoothstep(0.15, 0.65, fract(dot(p, toward) * 6.0 + ripple));
	return (1.0 - smoothstep(0.08, 0.35 + light.w * 0.35, across)) * (1.0 - smoothstep(0.2, 3.5, along)) * band;
}
vec3 wetGround(vec3 color, vec2 p, float time) {
	if (wetness < 0.001) return color;
	vec2 mask = texture2D(wetMask, (p * vec2(1.0, -1.0) - wetRect.xy) / wetRect.zw).rg;
	float wet = wetness * mask.r;
	if (wet < 0.001) return color;
	color *= 1.0 - wet * 0.32;
	float puddle = smoothstep(0.12, 0.65, mask.g) * smoothstep(0.45, 0.95, wet);
	vec3 eye = normalize(cameraPosition - vec3(p, wetZ));
	float grazing = pow(1.0 - abs(eye.z), 3.0);
	float sheen = (0.025 + grazing * 0.09) * wet;
	// Keep the sky sheen relative to the ground: even at grazing angles a
	// puddle stays darker than the wet asphalt around it.
	color *= 1.0 - puddle * 0.38 + sheen + puddle * grazing * 0.16;
	float reflectivity = puddle * 0.65 + wet * (0.035 + grazing * 0.12);
	if (wetNight > 0.01) {
		float ripple = sin(time * 2.0 + p.x * 9.0) * 0.12;
		for (int i = 0; i < ${LIGHTS}; i++)
			color += wetColors[i] * wetReflection(wetLights[i], p, ripple) * wetNight * reflectivity;
		for (int i = 0; i < ${MOVING_LIGHTS}; i++)
			color += wetMovingColors[i] * wetReflection(wetMoving[i], p, ripple) * wetNight * reflectivity;
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
