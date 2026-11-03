import { BIKE_PAINTS, bikeAtShop, paintBike } from './bike-paint.js'
import { sound } from './sound.js'
import './bike-paint-screen.css'

export function createBikePaintScreen({ player, pocket }) {
	const page = document.createElement('div')
	page.className = 'app-bike-paint'
	page.innerHTML = `<header>Fahrradlack · gratis</header><div>${BIKE_PAINTS.map(
		(paint, i) => `<button type="button" data-paint="${i}" style="--paint: ${paint.color}">${i + 1} ${paint.name}</button>`,
	).join('')}</div><small></small>`
	const buttons = [...page.querySelectorAll('button')]
	const note = page.querySelector('small')
	let shop = null
	let selected = 0

	function draw() {
		const ready = bikeAtShop(player, shop)
		for (const [i, button] of buttons.entries()) {
			button.disabled = !ready
			button.ariaPressed = String((player.bike.color ?? BIKE_PAINTS[0].color) === BIKE_PAINTS[i].color)
			button.toggleAttribute('data-selected', i === selected)
		}
		note.textContent = ready
			? '1–6 / Tippen: Lack. ◀▶ + E / A: Lack. Zurücktreten: fertig.'
			: 'Fahrrad direkt vor der Tür abstellen, dann wieder reinkommen.'
	}
	function choose(i) {
		if (!Number.isInteger(i) || !BIKE_PAINTS[i] || !paintBike(player, shop, BIKE_PAINTS[i].color)) return false
		selected = i
		sound.tick()
		pocket.say(`${BIKE_PAINTS[i].name} lackiert`)
		draw()
		return true
	}
	page.addEventListener('click', (event) => {
		const button = event.target.closest('[data-paint]')
		if (button) choose(Number(button.dataset.paint))
	})
	pocket.add({ id: 'bike-paint', page, shown: draw })

	return {
		choose,
		use: () => choose(selected),
		active: () => !!shop,
		shift(n) {
			if (!shop) return false
			selected = (selected + n + BIKE_PAINTS.length) % BIKE_PAINTS.length
			draw()
			return true
		},
		update(atCounter) {
			if (atCounter === shop) return
			shop = atCounter
			if (!shop) {
				pocket.release('bike-paint')
				return
			}
			selected = Math.max(
				0,
				BIKE_PAINTS.findIndex((paint) => paint.color === player.bike.color),
			)
			draw()
			pocket.alert('bike-paint')
		},
	}
}
