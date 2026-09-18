// A pin that is not where the city is, is a lie the reader cannot detect. Pinned here
// because it was already broken once, deliberately, to stop labels overlapping.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markerPositions } from '../src/services/mapMarkers.js'

// A stand-in projection scaled the way a country map really is — the whole 720×540 box for
// one country, not for the globe. Squeezing Italy into 20 pixels would make every pair of
// cities "crowded" and the test would prove nothing.
const project = ([lon, lat]) => [(lon - 6) * 60, (48 - lat) * 60]
const cities = [
  { name: 'Milan', coordinates: [9.19, 45.46] },
  { name: 'Pavia', coordinates: [9.16, 45.19] },   // 30km from Milan: crowded at low zoom
  { name: 'Naples', coordinates: [14.27, 40.85] }, // far from both
]

test('a marker is never moved off its projected position, at any zoom', () => {
  const expected = cities.map(city => project(city.coordinates))
  for (const zoom of [1, 1.5, 2.4, 3.2]) {
    const markers = markerPositions(cities, project, zoom, { width: 780, height: 585 })
    markers.forEach((marker, index) => {
      assert.equal(marker.mapX, expected[index][0], `${marker.place.name} moved horizontally at zoom ${zoom}`)
      assert.equal(marker.mapY, expected[index][1], `${marker.place.name} moved vertically at zoom ${zoom}`)
    })
  }
})

test('close neighbours are flagged, distant ones are not', () => {
  const markers = markerPositions(cities, project, 1, { width: 780, height: 585 })
  const byName = Object.fromEntries(markers.map(marker => [marker.place.name, marker]))
  assert.equal(byName.Milan.crowded, true)
  assert.equal(byName.Pavia.crowded, true)
  assert.equal(byName.Naples.crowded, false, 'Naples has no neighbour within a label width')
})

test('crowding is measured as a label box, not a circle', () => {
  // Same separation, one horizontal and one vertical. The label runs to the right, so only
  // the horizontal pair collides — a circle would have flagged both or neither.
  const apart = [
    { name: 'Origin', coordinates: [10, 45] },
    { name: 'East', coordinates: [11.4, 45] },
    { name: 'South', coordinates: [10, 43.6] },
  ]
  const markers = markerPositions(apart, project, 1, { width: 720, height: 540 })
  const byName = Object.fromEntries(markers.map(marker => [marker.place.name, marker]))
  assert.equal(byName.East.crowded, true, 'a neighbour under the label must be flagged')
  assert.equal(byName.South.crowded, false, 'the same distance below is clear of the label')
})

test('zooming in resolves crowding rather than displacing anything', () => {
  const far = markerPositions(cities, project, 4, { width: 780, height: 585 })
  assert.equal(far.find(marker => marker.place.name === 'Milan').crowded, false,
    'at high zoom the pair is far enough apart for both labels')
  // And the positions are the same ones as at zoom 1.
  const near = markerPositions(cities, project, 1, { width: 780, height: 585 })
  assert.deepEqual(far.map(m => [m.mapX, m.mapY]), near.map(m => [m.mapX, m.mapY]))
})

test('junk input does not throw', () => {
  assert.deepEqual(markerPositions(undefined, project), [])
  assert.deepEqual(markerPositions([], project, 0, { width: 0, height: 0 }), [])
})
