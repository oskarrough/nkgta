// Browsers don't report an OS-killed tab. A foreground session left unfinished
// is only a hint; ordinary navigation and backgrounding clear it.
export function trackSession() {
	const key = 'nk-playing'
	let interrupted = !!document.wasDiscarded
	try {
		interrupted ||= sessionStorage.getItem(key) === 'yes'
	} catch {}
	const mark = (active) => {
		try {
			if (active) sessionStorage.setItem(key, 'yes')
			else sessionStorage.removeItem(key)
		} catch {}
	}
	addEventListener('pagehide', () => mark(false))
	addEventListener('pageshow', () => mark(!document.hidden))
	document.addEventListener('visibilitychange', () => mark(!document.hidden))
	mark(!document.hidden)
	return interrupted
}
