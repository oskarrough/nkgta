import { loadMap } from './load-map.js'
import { createWorld } from './world.js'
import { createInput } from './input.js'
import { createPlayer, leaveCar, nearBike, toggleBike, updatePlayer } from './player.js'
import { createTraffic } from './traffic.js'
import { createWasted } from './wasted.js'
import { createPfand } from './pfand.js'
import { createCamera } from './camera.js'
import { createRenderer } from './draw.js'
import { createScene } from './scene.js'
import { createHud } from './hud.js'

import { sound } from './sound.js'

const START = { lat: 52.4764, lon: 13.4397 } // U Karl-Marx-Straße

const loading = document.getElementById('loading')
const map = await loadMap((text) => (loading.textContent = text)).catch((err) => {
	loading.textContent = `Karte konnte nicht laden: ${err.message}`
	throw err
})
loading.remove()

const world = createWorld(map)
const player = createPlayer(world.startPoint(START))
const pfand = createPfand(world)
const camera = createCamera()
const canvas = document.getElementById('overlay')
const city3d = createScene(document.getElementById('city'), world)
const draw = createRenderer(canvas, world)
const hud = createHud(world)
const traffic = createTraffic(world)
const wasted = createWasted({
	player,
	onDown: () => pfand.spill(player.x, player.y),
	respawn: () => Object.assign(player, createPlayer(world.startPoint(START))),
})
let showStreetNames = true
let showTransit = true

const input = createInput({
	use,
	toggleMute: () => hud.say(sound.toggleMute() ? 'Leise: Ton aus' : 'Ton an'),
	zoom: camera.zoomBy,
	toggleStreetNames: () => (showStreetNames = !showStreetNames),
	toggleTransit: () => (showTransit = !showTransit),
	cycleLook: () => hud.say(`Look: ${city3d.cycleLook()}`),
	pickArea: () => (location.href = `/pick.html${location.search}`),
})

// E: out of the car, off the bike, or onto whichever is closer, bike or car.
function use() {
	if (wasted.active()) return
	if (player.car) {
		leaveCar(player, world)
		sound.door()
		return
	}
	const car = !player.onBike && traffic.enterable(player.x, player.y)
	if (car && !(nearBike(player) && Math.hypot(player.bike.x - player.x, player.bike.y - player.y) < 0.6)) {
		traffic.steal(car, hud.say)
		player.car = car
		sound.door()
	} else toggleBike(player)
}

// The part of the map on screen, in tiles.
const viewOf = (cam) => ({
	x0: cam.x / cam.scale,
	y0: cam.y / cam.scale,
	x1: (cam.x + canvas.width) / cam.scale,
	y1: (cam.y + canvas.height) / cam.scale,
})

let last = performance.now()
function frame(now) {
	const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
	last = now
	if (!wasted.active()) updatePlayer(player, input.axis(), input.turbo(), world, dt)
	wasted.update(dt)
	const cam = camera.update(player, canvas, dt, city3d.pixelGrid())
	wasted.hit(traffic.update(dt, player, viewOf(cam)))
	if (!player.car && !wasted.active()) pfand.update(player, hud.say)
	sound.engine(player.car)
	sound.street(traffic.cars, player, viewOf(cam), dt)
	city3d.render(cam, traffic.cars)
	draw({ cam, player, peds: traffic.peds, lights: traffic.lights(), bottles: pfand.bottles, showStreetNames, showTransit })
	const car = !player.car && !player.onBike && traffic.enterable(player.x, player.y)
	hud.update({ player, car, bag: pfand.bag, showTransit, wasted: wasted.active() }, dt)
	requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
