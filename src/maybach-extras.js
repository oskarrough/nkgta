const AWNINGS = ['#b75343', '#498c72', '#d4aa45', '#4c779c', '#935b85']
const PRODUCE = ['#d85236', '#e7bf4b', '#72a441', '#d89739', '#785b8b']
const SIDES = [-1, 1]
const CRATES = [-0.65, 0, 0.65]

export function createMaybachExtras({ world, field, groups, box, base }) {
	return {
		meshes: [],
		draw(view) {
			for (const g of groups) {
				if (view && (g.x < view.x0 - 8 || g.x > view.x1 + 8 || g.y < view.y0 - 8 || g.y > view.y1 + 8)) continue
				const z = world.heightAt(g.x, g.y)
				if (g.type === 'stall' || g.type === 'barrier') {
					if (!field.active) continue
					base(g.x, g.y, z, g.angle)
					if (g.type === 'barrier') {
						for (const y of SIDES) box(0, y * 1.1, 0.2, 0.12, 0.12, 0.4, '#dfded2')
						box(0, 0, 0.35, 0.08, 2.6, 0.18, '#e5dfce')
						for (let i = -3; i <= 3; i += 2) box(-0.05, i * 0.32, 0.35, 0.025, 0.28, 0.14, '#c34d3b')
						continue
					}
					const color = AWNINGS[Math.floor(g.seed * AWNINGS.length)]
					for (const x of SIDES) for (const y of SIDES) box(x * 0.47, y * 0.99, 0.5, 0.035, 0.035, 1, '#c1b89b')
					box(0, 0, 1.02, 1.12, 2.2, 0.07, color)
					for (let i = -2; i <= 2; i++) box(0, i * 0.4, 1.06, 1.13, 0.16, 0.02, '#e9dfbc')
					box(0.52, 0, 0.91, 0.035, 2.2, 0.18, color)
					box(0.43, 0, 0.28, 0.45, 2, 0.09, '#a78150')
					for (const y of CRATES) {
						box(0.43, y, 0.37, 0.43, 0.56, 0.17, '#947445')
						for (let k = 0; k < 6; k++)
							box(
								0.32 + (k % 2) * 0.19,
								y - 0.18 + Math.floor(k / 2) * 0.17,
								0.48,
								0.14,
								0.14,
								0.12,
								PRODUCE[(Math.floor(g.seed * 10) + Math.round(y * 3) + k + 10) % 5],
							)
						box(-0.25, y, 0.12, 0.35, 0.45, 0.24, '#a27e45')
					}
				} else if (g.type === 'quay') {
					base(g.x, g.y, z, g.angle)
					box(0, 0, 0.17, 0.28, 3.5, 0.34, '#8e8c7c')
					box(0, 0, 0.36, 0.37, 3.55, 0.08, '#bdb6a0')
					if (g.seed >= field.density) continue
					for (const p of g.people) {
						const at = p.render
						base(at.x, at.y, world.heightAt(at.x, at.y) + 0.38, p.dir)
						box(-0.04, 0.25, 0.11, 0.055, 0.055, 0.22, '#477446')
						box(-0.04, 0.25, 0.24, 0.028, 0.028, 0.07, '#46713b')
						if (p.guitar) {
							box(0.19, 0, 0.23, 0.1, 0.23, 0.2, '#bd873d')
							box(0.19, 0, 0.37, 0.09, 0.16, 0.15, '#bd873d')
							box(0.19, 0, 0.59, 0.06, 0.055, 0.34, '#664a2f', -0.25)
							box(0.25, 0, 0.29, 0.015, 0.065, 0.065, '#3b3329')
						}
					}
				} else if (g.type === 'birds' && g.seed < field.density) {
					for (let i = 0; i < 3; i++) {
						const t = field.time * 0.2 + g.seed * 7 + i * 0.6,
							x = g.x + Math.cos(t) * 0.7,
							y = g.y + Math.sin(t) * 0.7
						base(x, y, world.heightAt(x, y) + 0.035, t + Math.PI / 2)
						const swan = i === 0,
							coat = swan ? '#e9e3d1' : '#806c4c'
						box(0, 0, 0.09, swan ? 0.42 : 0.25, swan ? 0.23 : 0.17, 0.16, coat)
						box(0.15, 0, swan ? 0.26 : 0.16, 0.07, 0.07, swan ? 0.3 : 0.1, swan ? coat : '#416a4c')
						box(0.2, 0, swan ? 0.41 : 0.2, 0.1, 0.08, 0.09, swan ? coat : '#416a4c')
						box(0.27, 0, swan ? 0.39 : 0.18, 0.09, 0.06, 0.035, '#dca33e')
					}
				}
			}
		},
	}
}
