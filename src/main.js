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
import { createHud, useHint } from './hud.js'
import { frameEnd, frameStart, phase, PERF } from './perf.js'
import { findShops } from './shops.js'
import { createVisit } from './visit.js'
import { createActors } from './actors.js'

import { sound } from './sound.js'

const START = { lat: 52.4764, lon: 13.4397 } // U Karl-Marx-Straße

const loading = document.getElementById('loading')
const map = await loadMap((text) => (loading.textContent = text)).catch((err) => {
	loading.textContent = `Karte konnte nicht laden: ${err.message}`
	throw err
})

const world = createWorld(map)
phase('createWorld')
const player = createPlayer(world.startPoint(START))
const pfand = createPfand(world)
const camera = createCamera(world)
const canvas = document.getElementById('overlay')
const shops = findShops(world)
phase('shops')
const city3d = createScene(document.getElementById('city'), world, shops)
const actors = createActors(city3d.scene, city3d.gradient, world.heightAt)
phase('createScene')
const hud = createHud(world)
const traffic = createTraffic(world)
phase('overlay, hud, traffic')
const draw = createRenderer(canvas, world, shops)
const visit = createVisit({ city3d, shops, player, pfand, say: hud.say, heightAt: world.heightAt })
const wasted = createWasted({
	player,
	onDown: () => pfand.spill(player.x, player.y),
	respawn: () => Object.assign(player, createPlayer(world.startPoint(START))),
})
if (PERF) globalThis.game = { world, player, city3d, traffic }
let showStreetNames = true
let showTransit = true
let showWalls = false

const overheadHelp = document.getElementById('help').textContent
const input = createInput({
	cameraActive: camera.active,
	look: camera.look,
	setLooking: camera.setLooking,
	move: camera.move,
	toggleCamera() {
		const third = camera.toggle(player)
		hud.say(third ? 'Verfolgerkamera · Rechte Maustaste halten und ziehen' : 'Vogelperspektive')
	},
	use,
	toggleMute: () => hud.say(sound.toggleMute() ? 'Leise: Ton aus' : 'Ton an'),
	zoom: camera.zoomBy,
	toggleStreetNames: () => (showStreetNames = !showStreetNames),
	toggleTransit: () => (showTransit = !showTransit),
	toggleWalls: () => (showWalls = !showWalls),
	cycleLook() {
		hud.say(`Look: ${city3d.cycleLook()}`)
		showWalls = city3d.showsWalls()
	},
	pickArea: () => (location.href = `/pick.html${location.search}`),
})

// E: in or out of a shop, out of the car, off the bike, or onto whichever is
// closer, bike or car.
function use() {
	if (wasted.active() || visit.use()) return
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

// The part of the map on screen, in tiles, shifted by (dx, dy) tiles.
const viewOf = (cam, dx = 0, dy = 0) =>
	cam.bounds ?? {
		x0: cam.x / cam.scale + dx,
		y0: cam.y / cam.scale + dy,
		x1: (cam.x + canvas.width) / cam.scale + dx,
		y1: (cam.y + canvas.height) / cam.scale + dy,
	}

let last = performance.now()
let first = true
function frame(now) {
	frameStart()
	const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
	camera.suspend(visit.busy())
	if (!wasted.active() && !visit.warping()) updatePlayer(player, input, visit.world(world), dt)
	visit.update(dt, input.axis())
	wasted.update(dt)
	const inside = visit.inside()
	const indoors = visit.indoors()
	camera.suspend(visit.busy())
	const cam = camera.update(visit.focus(dt), canvas, dt, city3d.pixelGrid(), visit.closer())
	// Inside a shop, the street carries on round its door.
	const street = visit.street()
	const streetView = viewOf(cam, street.x - player.x, street.y - player.y)
	const hit = traffic.update(dt, street, streetView)
	if (!inside && !visit.warping()) wasted.hit(hit)
	if (!inside && !player.car && !wasted.active()) pfand.update(player)
	sound.engine(player.car)
	sound.street(traffic.cars, street, streetView, dt)
	actors.update(player, traffic.peds, pfand.bottles, traffic.lights(), cam, dt)
	const help = camera.selected()
		? cam.third
			? 'V: Vogelperspektive · Rechte Maus ziehen: umsehen · Rad: Abstand · WASD: bewegen · E: benutzen · Leertaste: Turbo / Handbremse'
			: 'Ladeneingang: Vogelperspektive · Danach wieder Verfolgerkamera · V: Kamera wechseln'
		: overheadHelp
	if (document.getElementById('help').textContent !== help) document.getElementById('help').textContent = help
	visit.render(cam, traffic.cars, dt)
	draw({
		cam,
		player,
		peds: indoors ? [] : traffic.peds,
		lights: indoors ? [] : traffic.lights(),
		bottles: indoors ? [] : pfand.bottles,
		showStreetNames,
		showTransit,
		showWalls: showWalls && !indoors,
		inside: indoors,
	})
	const car = !inside && !player.car && !player.onBike && traffic.enterable(player.x, player.y)
	const door = visit.hint()
	input.setUse(door?.startsWith('E: ') ? door.slice(3) : door ? null : useHint(player, car))
	input.setDriving(!!player.car)
	hud.update({ player, car, bag: pfand.bag, showTransit, wasted: wasted.active(), inside: visit.shop(), door }, dt)
	frameEnd({ x: player.x, y: player.y, interval: now - last })
	last = now
	if (first) phase('first frame')
	first = false
	requestAnimationFrame(frame)
}
// Hold the loading text until what's on screen is painted.
loading.textContent = 'Male die Stadt…'
await city3d.ready(camera.update(player, canvas, 0, city3d.pixelGrid()))
phase('first textures')
loading.remove()
requestAnimationFrame(frame)

// For poking at the game from the console and automated browser tests while developing.
if (import.meta.env.DEV) window.nkgta = window.__nkgta = { player, shops, visit, pfand, camera, traffic }
