// Where each city marker goes on the country map: exactly where the projection puts it.
//
// This file exists because that rule was once broken on purpose. The markers used to be
// pushed apart as the reader zoomed in — up to 31px each, then a pass that forced 40px
// between neighbours — so that labels in northern Italy would stop overlapping. It put
// Florence in the Tyrrhenian Sea. A map whose pins are not where the cities are is not a
// map, and nothing on screen tells the reader it is lying to them.
//
// Overlap is a label problem and gets a label answer: `crowded` marks a marker with a close
// neighbour at the current zoom, and the stylesheet hides its label until it is hovered or
// selected. Zooming separates them for real, because markers counter-scale and the map does
// not.

// A label is a box to the right of its pin, not a circle around it: two pins 60px apart
// horizontally still have their labels on top of each other, while two the same distance
// apart vertically do not. Measuring the box is what makes the hiding match what the reader
// actually sees. Counter-scaled, so these are on-screen pixels at any zoom.
const LABEL_WIDTH = 118
const LABEL_HEIGHT = 32

const MAP_WIDTH = 720
const MAP_HEIGHT = 540

/**
 * @param cities  the country's cities, each with `coordinates`
 * @param project  lon/lat → [x, y] in the 720×540 map box
 * @param zoom  current view zoom, 1 and up
 * @param frame  the rendered size of the map box in CSS pixels
 */
export function markerPositions(cities, project, zoom = 1, frame = { width: 720, height: 540 }) {
  const width = Math.max(1, frame.width)
  const height = Math.max(1, frame.height)
  const scale = Math.max(1, zoom)

  const points = (cities ?? []).map(place => {
    const [mapX, mapY] = project(place.coordinates)
    return { place, mapX, mapY, screenX: mapX / MAP_WIDTH * width * scale, screenY: mapY / MAP_HEIGHT * height * scale }
  })

  return points.map((point, index) => ({
    place: point.place,
    // Never adjusted, never rounded away from the projection.
    mapX: point.mapX,
    mapY: point.mapY,
    crowded: points.some((other, otherIndex) => otherIndex !== index
      && Math.abs(point.screenX - other.screenX) < LABEL_WIDTH
      && Math.abs(point.screenY - other.screenY) < LABEL_HEIGHT),
  }))
}
