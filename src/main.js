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
import { shopsOf } from './shops.js'
import { createVisit } from './visit.js'
import { createActors } from './actors.js'

import { sound } from './sound.js'
import { createMusic } from './music.js'

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
const shops = shopsOf(world)
phase('shops')
const city3d = createScene(document.getElementById('city'), world, shops)
const actors = createActors(city3d.scene, city3d.gradient, world.heightAt)
phase('createScene')
const hud = createHud(world)
const traffic = createTraffic(world)
const music = createMusic(world, shops)
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

// Tap the speaker for a volume slider; L still mutes.
const muteButton = document.getElementById('mute')
const volumePanel = document.getElementById('volume')
const volumeMute = document.getElementById('volume-mute')
const volumeSlider = document.getElementById('volume-slider')
function showMute(muted) {
	const volume = sound.volume()
	muteButton.querySelector('img').src = `/icons/${muted ? 'speaker-off' : volume < 0.5 ? 'speaker-low' : 'speaker'}.png`
	volumeMute.querySelector('img').src = `/icons/${muted ? 'speaker' : 'speaker-off'}.png`
	volumeMute.ariaLabel = volumeMute.title = muted ? 'Ton an (L)' : 'Ton aus (L)'
	const percent = muted ? 0 : Math.round(volume * 100)
	volumeSlider.value = String(percent)
	volumeSlider.style.setProperty('--level', `${percent}%`)
}
function toggleMute() {
	const muted = sound.toggleMute()
	showMute(muted)
	hud.say(muted ? 'Leise: Ton aus' : 'Ton an')
}
function showVolume(open) {
	volumePanel.hidden = !open
	muteButton.classList.toggle('on', open)
	muteButton.ariaExpanded = String(open)
}
showMute(sound.isMuted())
muteButton.addEventListener('click', () => {
	sound.start()
	showVolume(volumePanel.hidden)
	muteButton.blur()
})
volumeMute.addEventListener('click', () => {
	toggleMute()
	volumeMute.blur()
})
volumeSlider.addEventListener('input', () => showMute(sound.setVolume(volumeSlider.valueAsNumber / 100)))
// Hand the keys straight back to the game once the slider lets go.
volumeSlider.addEventListener('change', () => volumeSlider.blur())
addEventListener('pointerdown', (e) => {
	if (!volumePanel.hidden && !e.target.closest('#sound')) showVolume(false)
})
const actions = {
	cameraActive: camera.active,
	look: camera.look,
	setLooking: camera.setLooking,
	move: camera.move,
	toggleCamera() {
		const third = camera.toggle(player)
		hud.say(third ? 'Verfolgerkamera' : 'Vogelperspektive')
	},
	use,
	toggleMute,
	zoom: camera.zoomBy,
	toggleStreetNames: () => (showStreetNames = !showStreetNames),
	toggleTransit: () => (showTransit = !showTransit),
	toggleWalls: () => (showWalls = !showWalls),
	cycleLook() {
		hud.say(`Look: ${city3d.cycleLook()}`)
		showWalls = city3d.showsWalls()
	},
	pickArea: () => (location.href = `/pick.html${location.search}`),
}
const input = createInput(actions)

// The menu: what the keys do, as buttons, with each toggle's state.
const menu = document.getElementById('menu')
const menuButton = document.getElementById('menu-button')
const menuItems = {
	streets: [actions.toggleStreetNames, () => (showStreetNames ? 'an' : 'aus')],
	transit: [actions.toggleTransit, () => (showTransit ? 'an' : 'aus')],
	walls: [actions.toggleWalls, () => (showWalls ? 'an' : 'aus')],
	look: [actions.cycleLook, () => city3d.look()],
	camera: [actions.toggleCamera, () => (camera.selected() ? 'Verfolger' : 'von oben')],
	sound: [toggleMute, () => (sound.isMuted() ? 'aus' : 'an')],
	area: [actions.pickArea, () => ''],
}
function showMenuState() {
	for (const button of menu.querySelectorAll('button[data-action]')) {
		button.querySelector('b').textContent = menuItems[button.dataset.action][1]()
	}
}
function showMenu(open) {
	menu.hidden = !open
	menuButton.ariaExpanded = String(open)
	input.release()
	if (open) {
		showVolume(false)
		showMenuState()
	} else document.activeElement?.blur()
}
menu.addEventListener('click', (e) => {
	const button = e.target.closest('button[data-action]')
	if (!button) return
	menuItems[button.dataset.action][0]()
	showMenuState()
})
menuButton.addEventListener('click', () => {
	showMenu(menu.hidden)
	menuButton.blur()
})
// Esc closes the volume pill first, otherwise opens or closes the menu. While
// the menu is open the game doesn't hear walking, turbo or E.
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' ', 'e', 'Enter'])
addEventListener(
	'keydown',
	(e) => {
		if (e.key === 'Escape') {
			if (!volumePanel.hidden) showVolume(false)
			else showMenu(menu.hidden)
		} else if (!menu.hidden && GAME_KEYS.has(e.key.length === 1 ? e.key.toLowerCase() : e.key)) e.stopPropagation()
		else if (!menu.hidden) setTimeout(showMenuState)
	},
	{ capture: true },
)
addEventListener('pointerdown', (e) => {
	if (!menu.hidden && !e.target.closest('#menu, #menu-button')) showMenu(false)
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

// With ?fps: fps, the worst frame and the GPU, which is how to tell the
// browser has fallen back to drawing in software.
const FPS = new URLSearchParams(location.search).has('fps')
const meter =
	FPS &&
	document.body.appendChild(
		Object.assign(document.createElement('pre'), {
			style: 'position:fixed;top:0;left:0;margin:0;padding:4px;background:#000c;color:#0f0;font:12px monospace;z-index:9',
		}),
	)
const gpu = (() => {
	const gl = city3d.renderer.getContext()
	const info = gl.getExtension('WEBGL_debug_renderer_info')
	return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '?'
})()
let meterFrames = []
function fpsMeter(now) {
	meterFrames.push(now)
	if (now - meterFrames[0] < 1000) return
	const gaps = meterFrames.slice(1).map((t, i) => t - meterFrames[i])
	meter.textContent = `${gaps.length} fps · worst ${Math.round(Math.max(...gaps))} ms · buffer ${city3d.renderer.domElement.width}x${city3d.renderer.domElement.height} @ dpr ${devicePixelRatio}\n${gpu}`
	meterFrames = [now]
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
	music.update(sound.audio(), traffic.cars, street, streetView, !!player.car)
	actors.update(player, traffic.peds, pfand.bottles, traffic.lights(), cam, dt, visit.room())
	visit.render(cam, traffic.cars, dt)
	draw({
		cam,
		player,
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
	if (FPS) fpsMeter(now)
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
if (import.meta.env.DEV) window.nkgta = window.__nkgta = { world, player, shops, visit, pfand, camera, traffic, music, sound }
