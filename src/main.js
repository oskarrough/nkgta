import { loadMap } from './load-map.js'
import { createWorld } from './world.js'
import { createInput } from './input.js'
import { createPlayer, toggleBike, updatePlayer } from './player.js'
import { createPfand } from './pfand.js'
import { createCamera } from './camera.js'
import { createRenderer } from './draw.js'
import { createHud } from './hud.js'

const START = { lat: 52.4878, lon: 13.4318 } // Weserstraße

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
const draw = createRenderer(document.querySelector('canvas'), world)
const hud = createHud(world)
let showStreetNames = true

const input = createInput({
	toggleBike: () => toggleBike(player),
	zoom: camera.zoomBy,
	toggleStreetNames: () => (showStreetNames = !showStreetNames),
	pickArea: () => (location.href = `/pick.html${location.search}`),
})

const canvas = document.querySelector('canvas')
let last = performance.now()
function frame(now) {
	const dt = Math.min(0.05, (now - last) / 1000)
	last = now
	updatePlayer(player, input.axis(), input.turbo(), world, dt)
	pfand.update(player, hud.say)
	const cam = camera.update(player, canvas, dt)
	draw({ cam, player, bottles: pfand.bottles, showStreetNames })
	hud.update({ player, bag: pfand.bag }, dt)
	requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
