import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/filmUtils.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText
const {
  FILMS_STORAGE_KEY,
  dateSortKey,
  formatDate,
  formatLocalDate,
  formatLocalMonth,
  formatMonth,
  loadFilms,
  monthSortKey,
  parseDisplayDate,
  saveFilms,
} = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

const film = {
  id: 1,
  title: 'Past Lives',
  director: 'Celine Song',
  year: 2023,
  watchedOn: '21/09/2026',
  rating: 4.5,
  status: 'watched',
  note: '',
  poster: 'https://example.com/poster.jpg',
}

test('missing or empty storage starts with no films', () => {
  const storage = { getItem: () => null }
  assert.deepEqual(loadFilms(storage), [])

  storage.getItem = () => JSON.stringify([])
  assert.deepEqual(loadFilms(storage), [])
})

test('saved films load only when the stored collection is valid', () => {
  const storage = { getItem: () => JSON.stringify([film]) }

  assert.deepEqual(loadFilms(storage), [film])

  for (const value of ['not JSON', '{}', JSON.stringify([{ ...film, status: 'unknown' }]),
    JSON.stringify([{ ...film, watchedOn: '31/04/2026' }]),
    JSON.stringify([{ ...film, plannedMonth: '13/2026' }]),
    JSON.stringify([{ ...film, plannedMonth: '2026-13' }])]) {
    storage.getItem = () => value
    assert.deepEqual(loadFilms(storage), [])
  }
})

test('legacy ISO dates migrate to the display format when films load', () => {
  const legacyFilms = [
    { ...film, watchedOn: '2026-09-21' },
    { ...film, id: 2, status: 'planned', watchedOn: '', plannedMonth: '2027-01' },
  ]
  const storage = { getItem: () => JSON.stringify(legacyFilms) }

  assert.deepEqual(loadFilms(storage), [
    film,
    { ...film, id: 2, status: 'planned', watchedOn: '', plannedMonth: '01/2027' },
  ])
})

test('storage failures leave the app usable', () => {
  const films = [film]
  assert.deepEqual(loadFilms({ getItem: () => { throw new Error('blocked') } }), [])
  assert.equal(saveFilms(films, { setItem: () => { throw new Error('full') } }), false)

  let savedKey = ''
  let savedValue = ''
  assert.equal(saveFilms(films, { setItem: (key, value) => {
    savedKey = key
    savedValue = value
  } }), true)
  assert.equal(savedKey, FILMS_STORAGE_KEY)
  assert.deepEqual(JSON.parse(savedValue), films)
})

test('dates use the local calendar and reject impossible days', () => {
  assert.equal(formatLocalDate(new Date(2026, 8, 27, 0, 30)), '27/09/2026')
  assert.equal(formatLocalMonth(new Date(2026, 8, 27, 0, 30)), '09/2026')
  assert.equal(parseDisplayDate('29/02/2024'), '29/02/2024')
  assert.equal(parseDisplayDate('29/02/2025'), null)
  assert.equal(parseDisplayDate('31/04/2026'), null)
  assert.equal(formatDate('21/09/2026'), '21/09/2026')
  assert.equal(formatMonth('09/2026'), '09/2026')
  assert.equal(formatMonth('2026-13'), 'Chưa xếp tháng')
  assert.ok(dateSortKey('02/01/2027') > dateSortKey('31/12/2026'))
  assert.ok(monthSortKey('01/2027') > monthSortKey('12/2026'))
})

