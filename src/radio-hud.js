// The car radio's little player, top-centre under the street name: a pocket
// music player with a screen for the station and song and a click wheel
// below. It opens for a few seconds whenever the station or song changes,
// then shrinks to just the station; the wheel turns the dial, left of it back,
// the rest forward.
import './radio-hud.css'

const OPEN = 4 // seconds it stays open after a change

export function createRadioHud(turn) {
	const el = document.createElement('div')
	el.id = 'radio'
	el.className = 'gone'
	el.innerHTML = `
		<div class="screen"><b></b><span></span></div>
		<div class="wheel">
			<button type="button" class="back" aria-label="Sender zurück" title="Sender zurück"></button>
			<button type="button" class="next" aria-label="Sender wechseln (R)" title="Sender wechseln (R)"></button>
			<button type="button" class="mid" aria-label="Sender wechseln (R)" title="Sender wechseln (R)"></button>
		</div>`
	document.body.append(el)
	const station = el.querySelector('b')
	const song = el.querySelector('span')
	let key = null
	let open = 0

	el.querySelector('.back').addEventListener('click', () => turn(-1))
	for (const b of el.querySelectorAll('.next, .mid')) b.addEventListener('click', () => turn(1))

	return {
		// `radio` is what the music has on, { name, title }, or null out of a car.
		update(radio, dt) {
			el.classList.toggle('gone', !radio)
			if (!radio) {
				key = null
				open = 0
				return
			}
			const next = `${radio.name}:${radio.title}`
			if (next !== key) {
				key = next
				open = OPEN
				station.textContent = radio.name ?? 'Radio aus'
				song.textContent = radio.title ?? ''
			}
			open = Math.max(0, open - dt)
			el.classList.toggle('open', open > 0)
			el.classList.toggle('off', !radio.name)
		},
	}
}
