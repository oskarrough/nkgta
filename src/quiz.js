import { copy } from './copy.js'
import { quizShareText, seeded } from './daily.js'
import { quizLine, quizRounds, streetSpots } from './quiz-rules.js'
import { COLORS } from './tiles.js'
import './quiz.css'

export function createQuiz({ world, player, camera, city3d, area, prepare, restore, say, finished }) {
	const root = document.createElement('section')
	root.id = 'quiz'
	root.hidden = true
	root.setAttribute('aria-label', 'Wo bin ich?')
	document.body.append(root)
	let phase = 'idle'
	let rounds = [],
		answers = [],
		saved,
		started = 0,
		selected = 0,
		generation = 0
	let daily = null // today's date while playing the round everyone gets
	let previousButtons = []
	let lastSecond = -1
	let sendFailed = false
	const active = () => phase !== 'idle'
	const button = (text, action) => {
		const b = document.createElement('button')
		b.type = 'button'
		b.textContent = text
		b.onclick = action
		return b
	}
	const title = (text) => {
		const h = document.createElement('h2')
		h.textContent = text
		root.append(h)
	}
	const select = (step) => {
		const buttons = [...root.querySelectorAll('button')]
		if (!buttons.length) return
		selected = (selected + step + buttons.length) % buttons.length
		buttons[selected].focus({ preventScroll: true })
	}
	function close() {
		generation++
		phase = 'idle'
		root.hidden = true
		document.body.classList.remove('quizzing')
		city3d.showQuizClues(true)
		Object.assign(player, saved.player)
		if (camera.selected() !== saved.camera) camera.toggle(player)
		camera.snap(player)
		restore()
	}
	async function next() {
		const ticket = ++generation
		phase = 'loading'
		root.replaceChildren()
		title(`${answers.length + 1} / 5 · …`)
		const spot = rounds[answers.length]
		Object.assign(player, { x: spot.x, y: spot.y, dir: spot.dir, speed: 0, car: null, onBike: false })
		if (!camera.selected()) camera.toggle(player)
		camera.snap(player)
		try {
			await city3d.ready(camera.update(player, document.getElementById('overlay'), 0, city3d.pixelGrid()))
		} catch {
			if (ticket !== generation) return
			close()
			say('Quiz konnte nicht laden. Versuch es noch einmal.')
			return
		}
		if (ticket !== generation) return
		started = performance.now()
		lastSecond = -1
		phase = 'look'
		root.replaceChildren()
		title('')
		const hint = document.createElement('p')
		hint.textContent = '↔ Umsehen · WASD / Stick: ein paar Schritte'
		root.append(hint)
		const turn = document.createElement('div')
		turn.className = 'quiz-turn'
		turn.append(
			button('↶', () => camera.look(-180, 0)),
			button('↷', () => camera.look(180, 0)),
		)
		root.append(turn)
	}
	function answer(name) {
		if (phase !== 'answer') return
		const spot = rounds[answers.length]
		const seconds = (performance.now() - started) / 1000
		answers.push({ ...spot, answer: name })
		fetch('https://inkast.0sk.ar/n3fnd6j6', { method: 'POST', body: quizLine(spot, name, seconds, area) })
			.then((res) => {
				if (!res.ok) reportSendFailure()
			})
			.catch(reportSendFailure)
		if (answers.length < 5) next()
		else recap()
	}
	function reportSendFailure() {
		sendFailed = true
		if (!active()) say('Quiz-Antwort konnte nicht gesendet werden.')
		else if (phase === 'done' && !root.querySelector('[role=status]')) {
			const notice = document.createElement('p')
			notice.setAttribute('role', 'status')
			notice.textContent = 'Nicht alle Antworten konnten gesendet werden.'
			root.append(notice)
		}
	}
	function recap() {
		phase = 'done'
		root.replaceChildren()
		title(`${answers.filter((a) => a.answer === a.street).length} / 5`)
		const map = document.createElement('canvas')
		map.width = 360
		map.height = Math.round((360 * world.H) / world.W)
		map.setAttribute('role', 'img')
		map.setAttribute('aria-label', 'Karte der fünf Orte, Norden oben; Zahlen wie in den Antworten')
		const ctx = map.getContext('2d')
		// A small overview from the same tiles the player walked on.
		for (let y = 0; y < map.height; y++)
			for (let x = 0; x < map.width; x++) {
				ctx.fillStyle = COLORS[world.tileAt((x * world.W) / map.width, (y * world.H) / map.height)]
				ctx.fillRect(x, y, 1, 1)
			}
		ctx.font = 'bold 14px sans-serif'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		answers.forEach((a, i) => {
			const x = (a.x / world.W) * map.width,
				y = (a.y / world.H) * map.height
			ctx.fillStyle = '#ffe369'
			ctx.beginPath()
			ctx.arc(x, y, 10, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = '#161c20'
			ctx.fillText(String(i + 1), x, y)
		})
		root.append(map)
		const list = document.createElement('ol')
		for (const a of answers) {
			const row = document.createElement('li')
			row.textContent = `${a.answer === a.street ? '✓' : '×'} ${a.street}${a.answer === a.street ? '' : ` ← ${a.answer ?? 'übersprungen'}`}`
			list.append(row)
		}
		root.append(list)
		if (daily) {
			const result = {
				date: daily,
				score: answers.filter((a) => a.answer === a.street).length,
				marks: answers.map((a) => (a.answer === a.street ? '✓' : '×')).join(''),
			}
			finished(result)
			root.append(
				button('Teilen', async () => {
					const link = `${location.origin}${location.pathname}?quiz=daily`
					if (await copy(quizShareText(result, link))) say('Ergebnis kopiert')
				}),
			)
		}
		root.append(button('Zurück ins Spiel', close))
		if (sendFailed) reportSendFailure()
		selected = 0
		select(0)
	}
	function tick(now, from) {
		if (!active()) return
		if (phase !== 'look' || Math.hypot(player.x - rounds[answers.length]?.x, player.y - rounds[answers.length]?.y) > 6 / world.tileM) {
			player.x = from.x
			player.y = from.y
			player.speed = 0
		}
		if (phase === 'look') {
			const left = Math.max(0, Math.ceil(10 - (now - started) / 1000))
			if (left !== lastSecond) root.querySelector('h2').textContent = `${answers.length + 1} / 5 · ${left}`
			lastSecond = left
			if (!left) {
				phase = 'answer'
				root.replaceChildren()
				title(`${answers.length + 1} / 5 · Wo bin ich?`)
				const choices = document.createElement('div')
				choices.className = 'quiz-choices'
				rounds[answers.length].choices.forEach((name, i) => choices.append(button(`${i + 1} · ${name}`, () => answer(name))))
				choices.append(button('5 · Überspringen', () => answer(null)))
				root.append(choices)
				selected = 0
				select(0)
			}
		}
		// Keep this available even when walking is frozen at the answer screen.
		const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected && p.mapping === 'standard')
		const buttons = Array.from(pad?.buttons ?? [], (b) => b.pressed)
		const fired = (i) => buttons[i] && !previousButtons[i]
		if (fired(9)) {
			close()
			return
		}
		if (phase === 'look') camera.look((pad?.axes[2] ?? 0) * 35, (pad?.axes[3] ?? 0) * 20)
		else if (phase === 'answer' || phase === 'done') {
			if (fired(12) || fired(14)) select(-1)
			if (fired(13) || fired(15)) select(1)
			if (fired(0)) root.querySelectorAll('button')[selected]?.click()
			if (fired(1) && phase === 'answer') answer(null)
		}
		previousButtons = buttons
	}
	addEventListener(
		'keydown',
		(e) => {
			if (!active()) return
			if (e.key === 'Escape') close()
			else if (phase === 'look' && ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
			else if (!e.repeat && phase === 'answer' && /^[1-5]$/.test(e.key)) answer(rounds[answers.length].choices[Number(e.key) - 1] ?? null)
			else if (['ArrowDown', 'ArrowRight', 'Tab'].includes(e.key)) select(e.shiftKey ? -1 : 1)
			else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) select(-1)
			else if (!e.repeat && ['Enter', ' '].includes(e.key)) root.querySelectorAll('button')[selected]?.click()
			e.preventDefault()
			e.stopImmediatePropagation()
		},
		{ capture: true },
	)
	for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) root.addEventListener(type, (e) => e.stopPropagation())
	return {
		active,
		tick,
		// `date`: play the round everyone gets that day, not a random one.
		async start(date = null) {
			if (active() || !prepare()) return
			daily = date
			const streets = streetSpots(world)
			rounds = quizRounds(streets, date ? seeded(`quiz|${area}|${date}`) : Math.random)
			if (!rounds.length) {
				say('Für das Quiz braucht die Gegend mindestens fünf Straßen.')
				return
			}
			saved = { player: { ...player }, camera: camera.selected() }
			answers = []
			sendFailed = false
			previousButtons = Array.from(
				[...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected && p.mapping === 'standard')?.buttons ?? [],
				(b) => b.pressed,
			)
			root.hidden = false
			document.body.classList.add('quizzing')
			city3d.showQuizClues(false)
			await next()
		},
	}
}
