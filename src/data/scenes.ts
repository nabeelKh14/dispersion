/**
 * DISPERSION — scene content.
 *
 * The narrative: a market is undifferentiated light. PrismAI's engine refracts
 * it into separated, tradeable wavelengths. Each scene is one step of that
 * journey, and the prism physically moves through each of them.
 */

export type Scene = {
  id: string
  /** small mono eyebrow */
  eyebrow: string
  /** the headline — the "central point of focus" */
  headline: string
  /** optional sub-headline, one line */
  sub?: string
  /** the readable paragraph — the system's only "conversational voice" */
  body?: string
  /** stat block: big number + label */
  stat?: { value: string; label: string }
  /** where the text column sits */
  align: 'left' | 'right' | 'center'
  /** the accent colour for this scene's light */
  accent: string
  /** the primary light tint */
  key: string
  /** scene fog / background tint */
  fog: string
  /** 0..1 progress at which this scene is fully active */
  at: number
  /** how long this scene holds before the next begins (in progress units) */
  span: number
}

export const SCENES: Scene[] = [
  {
    id: 'origin',
    eyebrow: 'PRISMA AI — TRADE THE SPECTRUM',
    headline: 'EVERY MARKET IS\nONE BEAM OF LIGHT',
    sub: 'Undispersed. Indistinguishable. Full of everything.',
    body: 'Every quote, every order, every print arrives as the same undifferentiated signal. Most systems look at that beam and see one thing. We see the whole spectrum.',
    align: 'center',
    accent: '#f0ede4',
    key: '#cfe3ff',
    fog: '#05070c',
    at: 0.0,
    span: 0.1,
  },
  {
    id: 'noise',
    eyebrow: 'ACT I — THE NOISE',
    headline: 'WHITE LIGHT\nCONTAINS EVERY COLOUR',
    sub: 'We do not search for signal. We separate it.',
    body: 'Price action is white light: momentum, mean reversion, volatility, liquidity, sentiment and positioning are all present in every tick — superimposed, inseparable, and therefore invisible.',
    stat: { value: '4.1B', label: 'TICKS / DAY INGESTED' },
    align: 'left',
    accent: '#f0ede4',
    key: '#dbe7ff',
    fog: '#060810',
    at: 0.12,
    span: 0.12,
  },
  {
    id: 'refract',
    eyebrow: 'ACT II — THE REFRACTION',
    headline: 'DISPERSION',
    sub: 'One input. Separated into everything it always contained.',
    body: 'The prism is the model. It bends the raw feed across seven refractive indices — each tuned to a different statistical family of behaviour — and what comes out the far side is no longer the same market.',
    stat: { value: '7×', label: 'REFRACTIVE INDICES' },
    align: 'right',
    accent: '#7bdcff',
    key: '#9fe8ff',
    fog: '#050a14',
    at: 0.26,
    span: 0.14,
  },
  {
    id: 'spectrum',
    eyebrow: 'ACT III — THE SPECTRUM',
    headline: 'SEVEN WAVELENGTHS\nSEVEN INDEPENDENT EDGES',
    sub: 'Not seven strategies. One engine, refracted.',
    body: 'Momentum behaves nothing like funding. Volatility behaves nothing like order flow. Separated, each becomes measurable, testable and — critically — separately falsifiable.',
    align: 'left',
    accent: '#a78bfa',
    key: '#b9a4ff',
    fog: '#0a0714',
    at: 0.42,
    span: 0.14,
  },
  {
    id: 'risk',
    eyebrow: 'ACT IV — RISK',
    headline: 'THE BEAM\nALSO CARRIES HEAT',
    sub: 'Refraction is not a free lunch.',
    body: 'A prism that only ever made money would be a lie. We model the dispersion of our own outcomes: what breaks, how fast, and what it costs. A widening cone is a position that has stopped behaving.',
    stat: { value: '0.37%', label: 'MAX DRAWDOWN, 3Y LIVE' },
    align: 'right',
    accent: '#ff9d6b',
    key: '#ffb98c',
    fog: '#120a08',
    at: 0.58,
    span: 0.13,
  },
  {
    id: 'execute',
    eyebrow: 'ACT V — EXECUTION',
    headline: 'SEVEN BEAMS\nONE ORDER',
    sub: 'Signal is only real once it is filled.',
    body: 'The refracted edges are arbitraged into a single netted instruction, routed to whichever venue can absorb it without moving against us. The fill price is the only number that counts.',
    stat: { value: '11ms', label: 'DECISION → FILL' },
    align: 'left',
    accent: '#7dffb0',
    key: '#9dffc8',
    fog: '#04120c',
    at: 0.72,
    span: 0.13,
  },
  {
    id: 'proof',
    eyebrow: 'ACT VI — PROOF',
    headline: 'THREE YEARS\nOUT OF SAMPLE',
    sub: 'No curve-fitting. No screenshots.',
    body: 'Every edge is traded live, net of real spreads, real borrow and real fees. The record below is unedited and unaudited — because that is the only version worth showing.',
    align: 'right',
    accent: '#ffd166',
    key: '#ffe3a3',
    fog: '#0e0b04',
    at: 0.86,
    span: 0.14,
  },
]

/** The seven wavelengths, in render order. */
export const WAVELENGTHS = [
  { name: 'MOMENTUM', hex: '#ff5c5c', price: '4.82' },
  { name: 'MEAN REVERSION', hex: '#ff9d4d', price: '3.11' },
  { name: 'VOLATILITY', hex: '#ffd166', price: '6.04' },
  { name: 'LIQUIDITY', hex: '#7dffb0', price: '2.47' },
  { name: 'FLOW', hex: '#5cd4ff', price: '5.29' },
  { name: 'CARRY', hex: '#7b9dff', price: '1.88' },
  { name: 'SENTIMENT', hex: '#c07bff', price: '4.06' },
] as const

/** Scroll length in viewport heights per scene — controls pacing. */
export const SCROLL_PER_SCENE = 1.6
