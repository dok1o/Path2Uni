import { cloneAdmissionPlan } from '../data/admissionGraph.js'

// Frontend contract for the future backend endpoint.
// Replace this function body with POST /api/ai/admission-plan; keep the returned shape.
export async function generateAdmissionPlan({ profile, objective }) {
  await new Promise(resolve => setTimeout(resolve, 850))
  const plan = cloneAdmissionPlan()
  plan.status = 'generated'
  plan.generatedAt = new Date().toISOString()
  plan.request = { profile, objective }
  return plan
}
