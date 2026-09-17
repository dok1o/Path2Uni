import { useEffect, useMemo, useState } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { curatedIsos, cityLoad, universitiesOf } from './data/worldUniversities.js'

// The projection is fitted to this box once; every coordinate below lives in it.
const W = 960, H = 500
const SPHERE = { type: 'Sphere' }

export default function WorldMap({ focus, onFocus, activeCity, onPickCity }) {
  const [shapes, setShapes] = useState(null)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('/world-countries-110m.json')
      .then(response => response.json())
      .then(topo => { if (alive) setShapes(feature(topo, topo.objects.countries).features) })
      .catch(() => { if (alive) setShapes([]) })
    return () => { alive = false }
  }, [])

  const projection = useMemo(() => geoNaturalEarth1().fitSize([W, H], SPHERE), [])
  const path = useMemo(() => geoPath(projection), [projection])

  // Zoom is a transform on the whole group rather than a reprojection, so it can be animated in CSS.
  const zoom = useMemo(() => {
    const country = focus && shapes?.find(shape => shape.properties.iso === focus)
    if (!country) return { k: 1, x: 0, y: 0 }
    const [[x0, y0], [x1, y1]] = path.bounds(country)
    const k = Math.min(20, 0.78 / Math.max((x1 - x0) / W, (y1 - y0) / H))
    return { k, x: W / 2 - k * (x0 + x1) / 2, y: H / 2 - k * (y0 + y1) / 2 }
  }, [focus, shapes, path])

  const markers = useMemo(() => {
    if (!shapes) return []
    if (!focus) return [...curatedIsos].map(iso => {
      const country = shapes.find(shape => shape.properties.iso === iso)
      if (!country) return null
      const [x, y] = path.centroid(country)
      return { key: iso, iso, x, y, label: universitiesOf(iso).length, name: country.properties.name }
    }).filter(Boolean)
    return cityLoad.filter(city => city.country === focus).map(city => {
      const [x, y] = projection([city.lng, city.lat])
      return { key: city.id, city, x, y, label: city.count }
    })
  }, [shapes, focus, path, projection])

  if (!shapes) return <div className="world-map loading"><span className="map-spinner"/>Loading the world…</div>
  if (!shapes.length) return <div className="world-map loading">The map could not load. Check that <code>/world-countries-110m.json</code> is served.</div>

  return <div className="world-map">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map of study destinations">
      <defs><radialGradient id="ocean" cx="50%" cy="45%"><stop offset="0" stopColor="#fbfcff"/><stop offset="1" stopColor="#eef1f8"/></radialGradient></defs>
      <path className="globe" d={path(SPHERE)} fill="url(#ocean)"/>
      <g className="map-zoom" style={{ transform: `translate(${zoom.x}px,${zoom.y}px) scale(${zoom.k})` }}>
        {shapes.map((shape, index) => {
          const iso = shape.properties.iso
          const curated = curatedIsos.has(iso)
          return <path
            key={iso || `shape-${index}`} d={path(shape)}
            className={`country ${curated ? 'curated' : ''} ${focus === iso ? 'focused' : ''} ${hovered === iso ? 'hovered' : ''}`}
            onMouseEnter={() => setHovered(iso)} onMouseLeave={() => setHovered(null)}
            onClick={() => iso && onFocus(focus === iso ? null : iso)}
            role="button" tabIndex={curated ? 0 : -1}
            aria-label={shape.properties.name}
            onKeyDown={event => { if (event.key === 'Enter' && iso) onFocus(focus === iso ? null : iso) }}
          />
        })}

        {markers.map(marker => <g
          key={marker.key} className={`map-marker ${marker.city ? 'city' : 'country'} ${activeCity === marker.city?.id ? 'active' : ''}`}
          style={{ transform: `translate(${marker.x}px,${marker.y}px) scale(${1 / zoom.k})` }}
          onClick={() => marker.city ? onPickCity(activeCity === marker.city.id ? null : marker.city.id) : onFocus(marker.iso)}
          role="button" tabIndex={0} aria-label={marker.city ? `${marker.city.name}, ${marker.label} universities` : `${marker.label} universities`}
          onKeyDown={event => { if (event.key === 'Enter') marker.city ? onPickCity(marker.city.id) : onFocus(marker.iso) }}
        >
          <circle className="marker-halo" r="13"/>
          <circle className="marker-dot" r="7"/>
          {marker.city && <text className="marker-count" y="3.5">{marker.label}</text>}
          <text className="marker-label" y="-17">{marker.city ? marker.city.name : `${marker.name} · ${marker.label}`}</text>
        </g>)}
      </g>
    </svg>

    <div className="map-controls">
      {activeCity
        ? <button className="map-chip" onClick={() => onPickCity(null)}>← All cities</button>
        : focus
          ? <button className="map-chip" onClick={() => { onFocus(null); onPickCity(null) }}>← Back to the world</button>
          : <span className="map-hint">Tap a highlighted country to zoom in</span>}
    </div>
  </div>
}
