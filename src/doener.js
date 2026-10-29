import { euro } from './pfand.js'
import { sound } from './sound.js'

const PRICE = 350
const SALAD = ['Komplett', 'Ohne Salat']
const SAUCE = ['Knoblauch', 'Kräuter', 'Scharf']

export function createDoener(bag, say) {
	const panel = document.getElementById('doener-dialog')
	const question = panel.querySelector('.question')
	const choices = panel.querySelector('.choices')
	const carried = document.getElementById('doener-carried')
	let step = 0 // 0: away, 1: salad, 2: sauce, 3: served
	let selected = 0
	let salad = ''
	let count = 0

	function draw() {
		panel.hidden = step === 0 || step === 3
		if (panel.hidden) return
		question.textContent = step === 1 ? 'Salat komplett?' : 'Soße?'
		choices.replaceChildren(
			...(step === 1 ? SALAD : SAUCE).map((label, i) => {
				const button = document.createElement('button')
				button.type = 'button'
				button.textContent = `${i + 1} ${label}`
				button.classList.toggle('selected', i === selected)
				button.addEventListener('pointerdown', (e) => e.stopPropagation())
				button.addEventListener('click', () => choose(i))
				return button
			}),
		)
	}

	function choose(i) {
		if (step !== 1 && step !== 2) return false
		const options = step === 1 ? SALAD : SAUCE
		if (i < 0 || i >= options.length) return true
		sound.tick()
		if (step === 1) {
			salad = options[i]
			step = 2
			selected = 0
		} else {
			step = 3
			if (bag.cents < PRICE) {
				say(`Döner ${euro(PRICE)}. Dir fehlen ${euro(PRICE - bag.cents)}.`)
			} else {
				bag.cents -= PRICE
				count++
				carried.textContent = count === 1 ? '🥙 Döner' : `🥙 Döner ×${count}`
				sound.till()
				say(`Mit ${salad.toLowerCase()}, ${options[i].toLowerCase()}. Bitte schön! −${euro(PRICE)}`)
			}
		}
		draw()
		return true
	}

	return {
		active: () => step === 1 || step === 2,
		choose,
		use: () => choose(selected),
		shift(n) {
			if (step !== 1 && step !== 2) return false
			selected = (selected + n + (step === 1 ? 2 : 3)) % (step === 1 ? 2 : 3)
			draw()
			return true
		},
		update(atCounter) {
			if (!atCounter) {
				if (step) {
					step = 0
					draw()
				}
			} else if (!step) {
				step = 1
				selected = 0
				sound.tick()
				draw()
			}
		},
	}
}
