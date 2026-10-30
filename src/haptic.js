// A tick in the hand for a press. Android vibrates; iOS has no vibrate, but
// Safari 17.4+ ticks when a switch checkbox flips, and only inside a user gesture,
// so this is for taps and steps, not for things that happen on their own.
let label = null
export function haptic(ms = 10) {
	if (navigator.vibrate) {
		navigator.vibrate(ms)
		return
	}
	if (!matchMedia('(pointer: coarse)').matches) return
	if (!label) {
		label = document.createElement('label')
		label.ariaHidden = 'true'
		label.style.display = 'none'
		label.innerHTML = '<input type="checkbox" switch>'
		document.body.append(label)
	}
	label.click()
}
