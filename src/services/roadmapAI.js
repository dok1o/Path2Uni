// Client for POST /api/ai/admission-plan.
//
// The endpoint already degrades to a rule-based plan when the model is unavailable, so the
// only case handled here is the API itself being unreachable — no backend running, or offline.
// Either way the user gets a usable plan; `plan.source` says where it came from.

import { buildLocalPlan } from './localPlan.js'

const ENDPOINT = '/api/ai/admission-plan'
const TIMEOUT_MS = 35_000

export async function generateAdmissionPlan({ profile, objective }) {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, objective }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`plan API returned ${response.status}`)
    const plan = await response.json()
    if (!plan?.tasks?.length) throw new Error('plan API returned no tasks')
    return { ...plan, request: { profile, objective } }
  } catch (error) {
    console.warn('[path2uni] plan API unavailable, using the local planner:', error.message)
    return { ...buildLocalPlan({ profile, objective, reason: 'api_unreachable' }), request: { profile, objective } }
  }
}
