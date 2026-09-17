export const admissionProfile = {
  studentId: 'student-demo-001',
  destination: 'Italy',
  degree: 'Bachelor',
  field: 'Economics & Management',
  intake: '2027',
  languages: [{ name: 'English', level: 'B2' }],
  goals: ['Find 5 best-fit universities', 'Prepare IELTS', 'Apply before early deadlines'],
}

export const seedAdmissionPlan = {
  status: 'draft',
  generatedAt: null,
  confidence: 0.86,
  graph: {
    nodes: [
      { id: 'profile', type: 'profile', label: 'Mila’s profile', meta: 'B2 · GPA 4.4', x: 14, y: 49, detail: 'The structured profile entered after registration. This becomes the context for every AI decision.' },
      { id: 'goal', type: 'goal', label: 'Italy · 2027', meta: 'Bachelor goal', x: 34, y: 25, detail: 'Target: Economics & Management in Italy, 2027 intake.' },
      { id: 'source', type: 'source', label: 'Official sources', meta: '12 verified pages', x: 35, y: 74, detail: 'University pages, Universitaly and official admission regulations. Every extracted fact keeps its source.' },
      { id: 'requirement', type: 'requirement', label: 'Entry requirements', meta: 'IELTS · GPA · docs', x: 59, y: 25, detail: 'The AI converts sourced facts into explicit requirements and flags contradictions for review.' },
      { id: 'research', type: 'task', taskType: 'research', label: 'Research shortlist', meta: 'Task 1 · active', x: 63, y: 73, detail: 'Compare eight matching programmes and save five to the shortlist.' },
      { id: 'documents', type: 'task', taskType: 'documents', label: 'Prepare documents', meta: 'Task 2 · locked', x: 84, y: 40, detail: 'Collect transcript, passport copy and certified translations.' },
      { id: 'application', type: 'task', taskType: 'application', label: 'Submit application', meta: 'Task 3 · locked', x: 85, y: 75, detail: 'Complete the university application before the earliest verified deadline.' },
    ],
    edges: [
      ['profile','goal'], ['profile','source'], ['goal','requirement'], ['source','requirement'],
      ['requirement','research'], ['research','documents'], ['documents','application'],
    ],
  },
  tasks: [
    { id: 'task-research', type: 'research', title: 'Research your best-fit universities', shortTitle: 'University research', description: 'Compare 8 programmes using verified admission sources.', state: 'current', xp: 120, due: 'Today · 12 min', subtasks: ['Review AI shortlist', 'Compare entry requirements', 'Save 5 universities'] },
    { id: 'task-documents', type: 'documents', title: 'Prepare your core documents', shortTitle: 'Documents', description: 'Collect and validate documents shared across your applications.', state: 'locked', xp: 180, due: 'Unlocks after research', subtasks: ['Academic transcript', 'Passport copy', 'Certified translation'] },
    { id: 'task-application', type: 'application', title: 'Build your first application', shortTitle: 'Application', description: 'Turn your verified requirements into a ready-to-submit application.', state: 'locked', xp: 300, due: 'Unlocks after documents', subtasks: ['Motivation letter', 'Application form', 'Final source check'] },
  ],
}

export const cloneAdmissionPlan = () => JSON.parse(JSON.stringify(seedAdmissionPlan))
