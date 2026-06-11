import { describe, it, expect } from 'vitest'
import * as interviewerPages from './index'

describe('Interviewer pages barrel', () => {
  it('exports all interviewer pages', () => {
    expect(interviewerPages.ExamListPage).toBeDefined()
    expect(interviewerPages.ExamFormPage).toBeDefined()
    expect(interviewerPages.ExamDetailPage).toBeDefined()
    expect(interviewerPages.ExamResultPage).toBeDefined()
    expect(interviewerPages.CandidateListPage).toBeDefined()
    expect(interviewerPages.CandidateFormPage).toBeDefined()
    expect(interviewerPages.CandidateDetailPage).toBeDefined()
    expect(interviewerPages.SubmissionDetailPage).toBeDefined()
    expect(interviewerPages.ProfilePage).toBeDefined()
  })
})
