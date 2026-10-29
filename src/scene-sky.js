import * as THREE from 'three'
import { daylight } from './daylight.js'

// One 2048 map over the visible area, so the edges stay hard.
// normalBias is in shadow texels, so it holds at every zoom.
const SHADOW = { size: 2048, bias: -0.0003, normalBias: 1.5, pad: 60 }

export function createSkyLighting(scene, world, sky, streetFog, clouds, cars) {
	// Sky light, then the sun, or the moon at night.
	const ambient = new THREE.AmbientLight()
	scene.add(ambient)
	const sun = new THREE.DirectionalLight()
	sun.castShadow = true
	sun.shadow.mapSize.set(SHADOW.size, SHADOW.size)
	sun.shadow.bias = SHADOW.bias
	// Drawn only while there are shadows to see, so not at night.
	sun.shadow.autoUpdate = false
	const sunTarget = new THREE.Object3D()
	sun.target = sunTarget
	scene.add(sun, sunTarget)

	// The shadow camera follows the view and stays just big enough for it, so
	// the map is spent on what's on screen. It snaps to whole shadow texels,
	// otherwise the edges crawl as you walk.
	const sunDir = new THREE.Vector3(0, 0, 1)
	const sunRight = new THREE.Vector3()
	const sunUp = new THREE.Vector3()
	const focus = new THREE.Vector3()
	function focusSun(x, y, radius) {
		const texel = (radius * 2) / SHADOW.size
		sun.shadow.normalBias = texel * SHADOW.normalBias
		focus.set(x, y, world.heightAt(x, -y))
		const right = Math.round(focus.dot(sunRight) / texel) * texel - focus.dot(sunRight)
		const up = Math.round(focus.dot(sunUp) / texel) * texel - focus.dot(sunUp)
		focus.addScaledVector(sunRight, right).addScaledVector(sunUp, up)
		sunTarget.position.copy(focus)
		sun.position.copy(focus).addScaledVector(sunDir, radius * 2 + SHADOW.pad)
		const shadow = sun.shadow.camera
		shadow.left = -radius
		shadow.right = radius
		shadow.top = radius
		shadow.bottom = -radius
		shadow.near = 1
		shadow.far = radius * 3 + SHADOW.pad * 2
		shadow.updateProjectionMatrix()
	}

	// The time of day, see daylight.js. Clouds keep their bands however dim
	// the light: it's measured against the light at noon.
	const brightness = ([color, intensity]) => (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) * intensity
	const noon = daylight(12)
	const fullLight = brightness(noon.ambient) + brightness(noon.sun)
	function setHour(hour) {
		const now = daylight(hour)
		ambient.color.copy(now.ambient[0])
		ambient.intensity = now.ambient[1]
		sun.color.copy(now.sun[0])
		sun.intensity = now.sun[1]
		sun.shadow.intensity = now.shadow
		sunDir.copy(now.direction)
		sunRight.crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize()
		sunUp.crossVectors(sunDir, sunRight).normalize()
		sky.toSun.value.copy(sunDir)
		sky.sun.value.copy(now.ground[0])
		sky.shade.value.copy(now.ground[1])
		sky.deck.value.copy(now.sky)
		scene.background.copy(now.sky)
		streetFog.color.copy(now.sky)
		sky.night.value = now.night
		sky.home.value = now.home
		clouds.light(now.clouds, fullLight / (brightness(now.ambient) + brightness(now.sun)))
		cars.light(sunDir, now.shadow, now.night)
	}
	return { sun, focusSun, setHour }
}
