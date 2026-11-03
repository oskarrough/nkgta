import { feldLayout, feldCrowd } from './feld-layout.js'
import { createFeldExtras } from './feld-extras.js'

export const feld = { id: 'feld', layout: feldLayout, crowd: feldCrowd, extras: createFeldExtras }
