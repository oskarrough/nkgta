import { createOpening } from './opening.js'
import { loadMap } from './load-map.js'
import { createWorld } from './world.js'
import { createInput } from './input.js'
import { createPlayer, leaveCar, nearBike, toggleBike, updatePlayer } from './player.js'
import { createTraffic } from './traffic.js'
import { createWasted } from './wasted.js'
import { hospitalWake } from './hospital.js'
import { createPfand } from './pfand.js'
import { createCamera, ZOOM } from './camera.js'
import { tuneZoom } from './tune.js'
import { createClock, tuneClock } from './daylight.js'
import { tuneWeather } from './weather.js'
import { createRenderer } from './draw.js'
import { createScene } from './scene.js'
import { createHud, useAction, useHint } from './hud.js'
import { frameEnd, frameStart, phase, PERF } from './perf.js'
import { shopsOf } from './shops.js'
import { createVisit } from './visit.js'
import { createActors } from './actors.js'

import { sound } from './sound.js'
import { createMusic } from './music.js'
import { createPocket } from './pocket.js'
import { createRacing } from './racing.js'
import { createFeedback, shortAgent } from './feedback.js'
import { createDailyPanel } from './daily-panel.js'
import { dailyQuizResult, dateKey, saveDailyQuiz } from './daily.js'
import { createQuiz } from './quiz.js'
import { areaFromUrl } from './area-url.js'

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
// ?cam=chase starts in the chase camera; ?hour=11 sets the time of day and stops the clock.
const URL_PARAMS = new URLSearchParams(location.search)
if (URL_PARAMS.get('cam') === 'chase') camera.toggle(player)
const canvas = document.getElementById('overlay')
const shops = shopsOf(world)
phase('shops')
const opening = createOpening()
const city3d = createScene(document.getElementById('city'), world, shops, opening)
const clock = createClock()
const frozenHour = Number(URL_PARAMS.get('hour') ?? NaN)
if (!Number.isNaN(frozenHour)) clock.set(frozenHour)
const actors = createActors(city3d.scene, city3d.gradient, world.heightAt)
phase('createScene')
const hud = createHud(world)
const traffic = createTraffic(world, (text) => hud.say(text))
const music = createMusic(world, shops)
phase('overlay, hud, traffic')
const pocket = createPocket({
	turnStation(step) {
		if (music.nextStation(!!player.car, step)) sound.tick()
	},
	toggleMute,
})
const draw = createRenderer(canvas, world, shops)
const visit = createVisit({ city3d, shops, player, pfand, say: hud.say, heightAt: world.heightAt, opening })
const veil = document.getElementById('veil')
const wasted = createWasted({
	player,
	onDown: () => {
		pfand.spill(player.x, player.y)
		racing.abort()
	},
	respawn: () => Object.assign(player, createPlayer(hospitalWake(world.pois, player.x, player.y, world.tileAt) ?? world.startPoint(START))),
	fade: (a) => {
		veil.style.opacity = String(a)
	},
})
const racing = createRacing({
	world,
	player,
	scene: city3d.scene,
	gradient: city3d.gradient,
	area: areaFromUrl() && Object.values(areaFromUrl()).join(','),
	say: hud.say,
	snapCamera: () => camera.snap(player),
})
if (PERF) globalThis.game = { world, player, city3d, traffic }
let showStreetNames = true
let showTransit = true
let showWalls = false
let showMusic = false
try {
	showMusic = localStorage.getItem('nk-musik-debug') === 'true'
} catch {
	// Debug views just start off when storage is blocked.
}

function toggleMute() {
	sound.toggleMute()
}
const actions = {
	cameraActive: camera.active,
	look: camera.look,
	setLooking: camera.setLooking,
	move: camera.move,
	toggleCamera() {
		camera.toggle(player)
	},
	use,
	choose: (i) => visit.choose(i),
	shiftChoice: (n) => visit.shiftChoice(n),
	toggleMute,
	zoom: camera.zoomBy,
	toggleStreetNames: () => (showStreetNames = !showStreetNames),
	toggleTransit: () => (showTransit = !showTransit),
	toggleWalls: () => (showWalls = !showWalls),
	toggleMusicDebug() {
		showMusic = !showMusic
		try {
			localStorage.setItem('nk-musik-debug', String(showMusic))
		} catch {
			// Fine, it just won't be remembered.
		}
	},
	cycleLook() {
		city3d.cycleLook()
		showWalls = city3d.showsWalls()
	},
	nextStation: () => music.nextStation(!!player.car),
	menuOpen: () => !menu.hidden || racing.listOpen() || dailyPanel.isOpen(),
	toggleMenu: () => showMenu(menu.hidden),
	toggleDebug: () => showDebug(debug.hidden),
	placeGate: () => racing.placeGate(),
	finishRace: () => racing.finish(),
	restartRace: () => racing.restart(),
	pickArea: () => (location.href = `/pick.html${location.search}`),
	openFeedback() {
		showMenu(false)
		feedback.open()
	},
}
const dailyPanel = createDailyPanel({
	date: dateKey,
	quizResult: () => dailyQuizResult(localStorage, dateKey()),
	raceBest: () => racing.dailyBest(dateKey()),
	startQuiz: (date) => quiz.start(date),
	startRace: (date) => racing.startDaily(date),
})
const feedback = createFeedback({
	thank: () => hud.say('Danke fürs Feedback!'),
	context: () => ({
		url: location.href,
		area: URL_PARAMS.get('area') ?? 'default',
		x: player.x,
		y: player.y,
		street: world.streetAt(player.x, player.y),
		hour: clock.hour,
		vehicle: player.car ? player.car.model.name : player.onBike ? 'bike' : 'foot',
		camera: camera.selected() ? 'third person' : 'overhead',
		agent: shortAgent(navigator.userAgent, document.body.classList.contains('touch')),
		version: typeof __GAME_VERSION__ === 'undefined' ? 'dev' : __GAME_VERSION__,
	}),
})
const quiz = createQuiz({
	world,
	player,
	camera,
	city3d,
	area: URL_PARAMS.get('area') ?? 'default',
	say: hud.say,
	prepare() {
		if (visit.busy() || wasted.active()) {
			hud.say('Geh erst zurück auf die Straße.')
			return false
		}
		showMenu(false)
		showDebug(false)
		racing.abort()
		input.release()
		return true
	},
	restore: () => input.release(),
	finished: (result) => saveDailyQuiz(localStorage, result),
})
// All input sources share the same guard; the quiz owns its answer controls.
const quizInput = Object.fromEntries(
	Object.entries(actions).map(([key, action]) => [
		key,
		(...args) => {
			if (!quiz.active() || ['cameraActive', 'look', 'setLooking', 'move', 'zoom', 'toggleMute', 'menuOpen'].includes(key))
				return action(...args)
		},
	]),
)
const input = createInput(quizInput)

const menu = document.getElementById('menu')
const menuButton = document.getElementById('menu-button')
const debug = document.getElementById('debug')
tuneClock(document.getElementById('clock'), clock)
tuneWeather(document.getElementById('clock'), city3d.weather)
tuneZoom(document.getElementById('tune'), ZOOM, camera, player)
const menuItems = {
	daily: [
		() => {
			showMenu(false)
			dailyPanel.open()
		},
		() => null,
	],
	quiz: [() => quiz.start(), () => null],
	streets: [actions.toggleStreetNames, () => showStreetNames],
	transit: [actions.toggleTransit, () => showTransit],
	walls: [actions.toggleWalls, () => showWalls],
	look: [actions.cycleLook, () => null],
	camera: [actions.toggleCamera, () => camera.selected()],
	music: [actions.toggleMusicDebug, () => showMusic],
	sound: [toggleMute, () => !sound.isMuted()],
	race: [
		() => {
			showMenu(false)
			racing.openList()
		},
		() => null,
	],
	area: [actions.pickArea, () => null],
	feedback: [actions.openFeedback, () => null],
}
function showMenuState() {
	for (const button of document.querySelectorAll('.panel button[data-action]')) {
		const on = menuItems[button.dataset.action][1]()
		button.classList.toggle('on', on === true)
		button.classList.toggle('off', on === false)
		button.ariaPressed = on === null ? null : String(on)
	}
	menu.querySelector('[data-action=sound] img').src = `/icons/${sound.isMuted() ? 'speaker-off' : 'speaker'}.png`
	menu.querySelector('[data-action=look]').title = `Look: ${city3d.look()} (P)`
}
function showMenu(open) {
	menu.hidden = !open
	menuButton.ariaExpanded = String(open)
	input.release()
	if (open) showMenuState()
	else document.activeElement?.blur()
}
function showDebug(open) {
	debug.hidden = !open
	if (open) showMenuState()
}
if (new URLSearchParams(location.search).has('tune')) showDebug(true)
for (const panel of [menu, debug]) {
	panel.addEventListener('click', (e) => {
		const button = e.target.closest('button[data-action]')
		if (!button) return
		menuItems[button.dataset.action][0]()
		showMenuState()
		button.blur()
	})
}
menuButton.addEventListener('click', () => {
	showMenu(menu.hidden)
	menuButton.blur()
})
const GAME_KEYS = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'w',
	'a',
	's',
	'd',
	' ',
	'e',
	'Enter',
	'g',
	'f',
	'q',
	'Backspace',
])
addEventListener(
	'keydown',
	(e) => {
		if (feedback.isOpen() || quiz.active()) return
		if (e.key === 'Escape') {
			showMenu(menu.hidden)
		} else if (!menu.hidden && GAME_KEYS.has(e.key.length === 1 ? e.key.toLowerCase() : e.key)) e.stopPropagation()
		else if (!menu.hidden || !debug.hidden) setTimeout(showMenuState)
	},
	{ capture: true },
)
addEventListener('pointerdown', (e) => {
	if (!menu.hidden && !e.target.closest('#menu, #menu-button')) showMenu(false)
})

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

function heading() {
	const steering = input.steer()
	if (!steering) return input.axis()
	return { x: Math.cos(player.dir) * -steering.y, y: Math.sin(player.dir) * -steering.y }
}

let last = performance.now()
let first = true
function frame(now) {
	frameStart()
	const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
	camera.suspend(visit.busy())
	const from = { x: player.x, y: player.y }
	if (!wasted.active() && !visit.warping()) updatePlayer(player, input, visit.world(world), dt)
	if (quiz.active()) quiz.tick(now, from)
	else visit.update(dt, heading())
	wasted.update(dt)
	const inside = visit.inside()
	const indoors = visit.indoors()
	camera.suspend(visit.busy())
	const cam = camera.update(visit.focus(dt), canvas, dt, city3d.pixelGrid(), visit.closer())
	// Inside a shop, the street carries on round its door.
	const street = visit.street()
	const streetView = viewOf(cam, street.x - player.x, street.y - player.y)
	const hit = traffic.update(dt, street, streetView, clock.hour, clock.day)
	if (!quiz.active() && !inside && !visit.warping()) wasted.hit(hit)
	if (!quiz.active() && !inside && !player.car && !wasted.active()) pfand.update(player)
	sound.engine(player.car)
	sound.street(traffic.cars, street, streetView, dt)
	sound.listen(world, street.x, street.y, inside)
	music.update(sound.audio(), traffic.cars, street, streetView, { inCar: !!player.car, inside, down: wasted.active() })
	actors.update(player, traffic.peds, pfand.bottles, traffic.lights(), cam, dt, visit.room())
	if (Number.isNaN(frozenHour)) clock.tick(dt)
	city3d.weather.update(dt, player, inside)
	city3d.setHour(clock.hour)
	opening.set(clock.hour, clock.elapsedDays)
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
		music: showMusic ? () => ({ ...music.debug(), enclosure: sound.enclosure() }) : null,
		people: indoors ? [] : traffic.peds,
		cars: indoors ? [] : traffic.cars,
	})
	const car = !inside && !player.car && !player.onBike && traffic.enterable(player.x, player.y)
	const door = visit.hint()
	const action = useAction(door, useHint(player, car))
	input.setUse(action)
	input.setDriving(!!player.car)
	racing.update(dt, from, { inside: visit.busy() || quiz.active(), down: wasted.active() })
	pocket.update({ radio: music.radio(), hearing: music.hearing(), car: !!player.car }, dt)
	hud.update(
		{ player, cam, bag: pfand.bag, showTransit, wasted: wasted.shown(), inside: visit.shop(), door, action, gate: racing.target() },
		dt,
	)
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
if (URL_PARAMS.has('quiz')) quiz.start(URL_PARAMS.get('quiz') === 'daily' ? dateKey() : null)

// For poking at the game from the console and automated browser tests while developing.
if (import.meta.env.DEV)
	window.nkgta = window.__nkgta = {
		world,
		player,
		shops,
		visit,
		pfand,
		camera,
		traffic,
		music,
		sound,
		clock,
		weather: city3d.weather,
		racing,
		city3d,
	}
