export async function copy(text) {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		const field = Object.assign(document.createElement('textarea'), { value: text })
		document.body.append(field)
		field.select()
		const ok = document.execCommand('copy')
		field.remove()
		return ok
	}
}
