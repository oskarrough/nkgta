// "Heute" from the menu: today's race and today's Wo bin ich?, the same for
// everyone, each with how you did. Esc or a tap outside closes it.
import { clock } from './race.js'

export function createDailyPanel({ date, quizResult, raceBest, startQuiz, startRace }) {
	const el = document.createElement('div')
	el.id = 'daily'
	el.className = 'panel'
	el.hidden = true
	document.body.append(el)

	function render() {
		const quiz = quizResult()
		const best = raceBest()
		el.innerHTML = `
			<h2><img class="icon" src="/icons/race-finish.png" alt="">Heute <small>${date()}</small></h2>
			<ol>
				<li><span class="route"><strong>Wo bin ich?</strong><small>Fünf Orte, für alle dieselben</small></span>
					<span class="best"><b class="${quiz ? '' : 'none'}">${quiz ? `${quiz.score} / 5` : '–'}</b></span>
					<button type="button" class="go" data-play="quiz">${quiz ? 'Nochmal' : 'Los'}</button></li>
				<li><span class="route"><strong>Tagesrennen</strong><small>Vier Tore, für alle dieselben</small></span>
					<span class="best"><b class="${best ? '' : 'none'}">${best ? clock(best.time) : '–'}</b></span>
					<button type="button" class="go" data-play="race">${best ? 'Nochmal' : 'Los'}</button></li>
			</ol>`
	}

	const close = () => (el.hidden = true)
	el.addEventListener('click', (e) => {
		const play = e.target.closest('button')?.dataset.play
		if (!play) return
		close()
		;(play === 'quiz' ? startQuiz : startRace)(date())
	})
	addEventListener('pointerdown', (e) => {
		if (!el.hidden && !e.target.closest('#daily, #menu')) close()
	})
	addEventListener(
		'keydown',
		(e) => {
			if (el.hidden) return
			e.stopImmediatePropagation()
			if (e.key === 'Escape') close()
		},
		{ capture: true },
	)
	return {
		open() {
			render()
			el.hidden = false
		},
		isOpen: () => !el.hidden,
	}
}
