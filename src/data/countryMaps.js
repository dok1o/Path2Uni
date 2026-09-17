import mapUnits from './ne-50m-map-units.json'

export const MAP_VIEWBOX = '0 0 720 540'

export const countryCatalog = [
  {
    id: 'usa', name: 'United States', shortName: 'USA', geoUnit: 'USA', currency: '$',
    cities: [
      { name: 'Boston', coordinates: [-71.0589, 42.3601], note: 'Research, biotech & liberal arts', universities: [{ id: 'mit', name: 'MIT', match: '91% match' }, { id: 'harvard', name: 'Harvard University', match: '88% match' }] },
      { name: 'New York', coordinates: [-74.006, 40.7128], note: 'Finance, media & global networks', universities: [{ id: 'nyu', name: 'New York University', match: '86% match' }, { id: 'columbia', name: 'Columbia University', match: '84% match' }] },
      { name: 'Chicago', coordinates: [-87.6298, 41.8781], note: 'Economics, research & city life', universities: [{ id: 'uchicago', name: 'University of Chicago', match: '87% match' }, { id: 'northwestern', name: 'Northwestern University', match: '82% match' }] },
      { name: 'Los Angeles', coordinates: [-118.2437, 34.0522], note: 'Film, tech & entrepreneurship', universities: [{ id: 'ucla', name: 'UCLA', match: '85% match' }, { id: 'usc', name: 'University of Southern California', match: '80% match' }] },
    ],
  },
  {
    id: 'italy', name: 'Italy', shortName: 'Italy', geoUnit: 'ITA', currency: '€',
    cities: [
      { name: 'Milan', coordinates: [9.19, 45.46], note: 'Design, engineering & business', universities: [{ id: 'polimi', name: 'Politecnico di Milano', match: '88% match' }, { id: 'bocconi', name: 'Bocconi University', match: '84% match' }, { id: 'unimi', name: 'University of Milan', match: '79% match' }] },
      { name: 'Bologna', coordinates: [11.3426, 44.4949], note: 'Historic student city', universities: [{ id: 'unibo', name: 'University of Bologna', match: '92% match' }, { id: 'bbs', name: 'Bologna Business School', match: '81% match' }] },
      { name: 'Rome', coordinates: [12.4964, 41.9028], note: 'Culture, research & opportunity', universities: [{ id: 'sapienza', name: 'Sapienza University', match: '86% match' }, { id: 'luiss', name: 'LUISS Guido Carli', match: '82% match' }] },
      { name: 'Turin', coordinates: [7.6869, 45.0703], note: 'Innovation and technology', universities: [{ id: 'polito', name: 'Politecnico di Torino', match: '87% match' }, { id: 'unito', name: 'University of Turin', match: '80% match' }] },
      { name: 'Florence', coordinates: [11.2558, 43.7696], note: 'Arts, architecture & humanities', universities: [{ id: 'unifi', name: 'University of Florence', match: '83% match' }, { id: 'polimoda', name: 'Polimoda', match: '77% match' }] },
    ],
  },
  {
    id: 'england', name: 'England', shortName: 'England', geoUnit: 'ENG', currency: '£',
    cities: [
      { name: 'London', coordinates: [-0.1276, 51.5072], note: 'Global careers, finance & creativity', universities: [{ id: 'ucl', name: 'UCL', match: '89% match' }, { id: 'kcl', name: "King’s College London", match: '85% match' }] },
      { name: 'Oxford', coordinates: [-1.2577, 51.752], note: 'Tutorial teaching & research', universities: [{ id: 'oxford', name: 'University of Oxford', match: '90% match' }] },
      { name: 'Cambridge', coordinates: [0.1218, 52.2053], note: 'Science, technology & tradition', universities: [{ id: 'cambridge', name: 'University of Cambridge', match: '90% match' }] },
      { name: 'Manchester', coordinates: [-2.2426, 53.4808], note: 'Engineering, music & student life', universities: [{ id: 'manchester', name: 'University of Manchester', match: '84% match' }] },
    ],
  },
  {
    id: 'hungary', name: 'Hungary', shortName: 'Hungary', geoUnit: 'HUN', currency: 'Ft',
    cities: [
      { name: 'Budapest', coordinates: [19.0402, 47.4979], note: 'Central-European capital & innovation', universities: [{ id: 'elte', name: 'Eötvös Loránd University', match: '86% match' }, { id: 'bme', name: 'Budapest University of Technology', match: '82% match' }] },
      { name: 'Szeged', coordinates: [20.1482, 46.253], note: 'Medicine, science & sunny student city', universities: [{ id: 'szeged', name: 'University of Szeged', match: '84% match' }] },
      { name: 'Debrecen', coordinates: [21.6273, 47.5316], note: 'Health sciences & international campus', universities: [{ id: 'debrecen', name: 'University of Debrecen', match: '81% match' }] },
    ],
  },
  {
    id: 'china', name: 'China', shortName: 'China', geoUnit: 'CHN', currency: '¥',
    cities: [
      { name: 'Beijing', coordinates: [116.4074, 39.9042], note: 'Research, policy & technology', universities: [{ id: 'tsinghua', name: 'Tsinghua University', match: '89% match' }, { id: 'peking', name: 'Peking University', match: '87% match' }] },
      { name: 'Shanghai', coordinates: [121.4737, 31.2304], note: 'Business, design & global industry', universities: [{ id: 'fudan', name: 'Fudan University', match: '85% match' }, { id: 'sjtu', name: 'Shanghai Jiao Tong University', match: '84% match' }] },
      { name: 'Nanjing', coordinates: [118.7969, 32.0603], note: 'Historic research hub', universities: [{ id: 'nju', name: 'Nanjing University', match: '82% match' }] },
    ],
  },
  {
    id: 'uae', name: 'United Arab Emirates', shortName: 'UAE', geoUnit: 'ARE', currency: 'AED',
    cities: [
      { name: 'Dubai', coordinates: [55.2708, 25.2048], note: 'Business, AI & international careers', universities: [{ id: 'aud', name: 'American University in Dubai', match: '85% match' }, { id: 'hw-dubai', name: 'Heriot-Watt University Dubai', match: '82% match' }] },
      { name: 'Abu Dhabi', coordinates: [54.3773, 24.4539], note: 'Research, culture & government', universities: [{ id: 'nyuad', name: 'NYU Abu Dhabi', match: '88% match' }, { id: 'ku', name: 'Khalifa University', match: '86% match' }] },
      { name: 'Sharjah', coordinates: [55.4033, 25.3463], note: 'Arts, engineering & campus life', universities: [{ id: 'aus', name: 'American University of Sharjah', match: '83% match' }] },
    ],
  },
  {
    id: 'malaysia', name: 'Malaysia', shortName: 'Malaysia', geoUnit: 'MYS', currency: 'RM',
    cities: [
      { name: 'Kuala Lumpur', coordinates: [101.6869, 3.139], note: 'International city & business', universities: [{ id: 'um', name: 'University of Malaya', match: '86% match' }, { id: 'monash-my', name: 'Monash University Malaysia', match: '82% match' }] },
      { name: 'Penang', coordinates: [100.3327, 5.4141], note: 'Engineering, health & island life', universities: [{ id: 'usm', name: 'Universiti Sains Malaysia', match: '83% match' }] },
      { name: 'Johor Bahru', coordinates: [103.7618, 1.4854], note: 'Singapore link & technology', universities: [{ id: 'utm', name: 'Universiti Teknologi Malaysia', match: '81% match' }] },
    ],
  },
  {
    id: 'switzerland', name: 'Switzerland', shortName: 'Switzerland', geoUnit: 'CHE', currency: 'CHF',
    cities: [
      { name: 'Zürich', coordinates: [8.5417, 47.3769], note: 'Finance, engineering & AI', universities: [{ id: 'eth', name: 'ETH Zürich', match: '90% match' }, { id: 'uzh', name: 'University of Zürich', match: '84% match' }] },
      { name: 'Lausanne', coordinates: [6.6323, 46.5197], note: 'Innovation on Lake Geneva', universities: [{ id: 'epfl', name: 'EPFL', match: '89% match' }] },
      { name: 'Geneva', coordinates: [6.1432, 46.2044], note: 'International relations & science', universities: [{ id: 'unige', name: 'University of Geneva', match: '83% match' }] },
      { name: 'Basel', coordinates: [7.5886, 47.5596], note: 'Life sciences & research', universities: [{ id: 'unibas', name: 'University of Basel', match: '82% match' }] },
    ],
  },
  {
    id: 'netherlands', name: 'Netherlands', shortName: 'Netherlands', geoUnit: 'NLD', currency: '€',
    cities: [
      { name: 'Amsterdam', coordinates: [4.9041, 52.3676], note: 'Creative economy & global campus', universities: [{ id: 'uva', name: 'University of Amsterdam', match: '86% match' }, { id: 'vu', name: 'Vrije Universiteit Amsterdam', match: '82% match' }] },
      { name: 'Delft', coordinates: [4.3571, 52.0116], note: 'Technology & design', universities: [{ id: 'tudelft', name: 'TU Delft', match: '89% match' }] },
      { name: 'Rotterdam', coordinates: [4.4777, 51.9244], note: 'Business, logistics & architecture', universities: [{ id: 'eur', name: 'Erasmus University Rotterdam', match: '84% match' }] },
      { name: 'Utrecht', coordinates: [5.1214, 52.0907], note: 'Research & student culture', universities: [{ id: 'uu', name: 'Utrecht University', match: '85% match' }] },
    ],
  },
  {
    id: 'germany', name: 'Germany', shortName: 'Germany', geoUnit: 'DEU', currency: '€',
    cities: [
      { name: 'Berlin', coordinates: [13.405, 52.52], note: 'Start-ups, arts & social sciences', universities: [{ id: 'tu-berlin', name: 'TU Berlin', match: '85% match' }, { id: 'hu-berlin', name: 'Humboldt University of Berlin', match: '82% match' }] },
      { name: 'Munich', coordinates: [11.582, 48.1351], note: 'Engineering, business & research', universities: [{ id: 'tum', name: 'Technical University of Munich', match: '89% match' }, { id: 'lmu', name: 'LMU Munich', match: '85% match' }] },
      { name: 'Heidelberg', coordinates: [8.6724, 49.3988], note: 'Medicine, science & heritage', universities: [{ id: 'heidelberg', name: 'Heidelberg University', match: '86% match' }] },
      { name: 'Aachen', coordinates: [6.0839, 50.7753], note: 'Engineering & applied research', universities: [{ id: 'rwth', name: 'RWTH Aachen University', match: '87% match' }] },
    ],
  },
]

const mapCache = new Map()
const mapWidth = 720
const mapHeight = 540
const padding = 44

function averagePoint(ring) {
  const points = ring.slice(0, -1)
  return points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0])
}

function coordinatePath(ring, project) {
  return `${ring.map((point, index) => `${index ? 'L' : 'M'}${project(point).map(value => value.toFixed(2)).join(' ')}`).join('')}Z`
}

export function getCountryMap(country) {
  if (mapCache.has(country.id)) return mapCache.get(country.id)

  const feature = mapUnits.features.find(item => item.properties.GU_A3 === country.geoUnit)
  if (!feature) throw new Error(`Map geometry for ${country.name} was not found`)

  let polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  // The map unit includes far-flung US possessions. Keep the recognised US outline,
  // including Alaska and Hawaiʻi, so the map remains legible in one frame.
  if (country.id === 'usa') polygons = polygons.filter(polygon => {
    const [longitude, latitude] = averagePoint(polygon[0])
    return longitude > -171 && longitude < -60 && latitude > 18 && latitude < 73
  })

  const points = polygons.flatMap(polygon => polygon.flat())
  const minLongitude = Math.min(...points.map(point => point[0]))
  const maxLongitude = Math.max(...points.map(point => point[0]))
  const minLatitude = Math.min(...points.map(point => point[1]))
  const maxLatitude = Math.max(...points.map(point => point[1]))
  const latitudeScale = Math.cos(((minLatitude + maxLatitude) / 2) * Math.PI / 180)
  const geographicWidth = (maxLongitude - minLongitude) * latitudeScale
  const geographicHeight = maxLatitude - minLatitude
  const scale = Math.min((mapWidth - padding * 2) / geographicWidth, (mapHeight - padding * 2) / geographicHeight)
  const offsetX = (mapWidth - geographicWidth * scale) / 2
  const offsetY = (mapHeight - geographicHeight * scale) / 2
  const project = ([longitude, latitude]) => [
    offsetX + (longitude - minLongitude) * latitudeScale * scale,
    offsetY + (maxLatitude - latitude) * scale,
  ]
  const value = {
    path: polygons.flatMap(polygon => polygon.map(ring => coordinatePath(ring, project))).join(' '),
    project,
  }
  mapCache.set(country.id, value)
  return value
}
