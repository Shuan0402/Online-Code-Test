import { describe, it, expect } from 'vitest'
import * as questionerPages from './index'

describe('Questioner pages barrel', () => {
  it('exports all questioner pages', () => {
    expect(questionerPages.ProblemListPage).toBeDefined()
    expect(questionerPages.ProblemFormPage).toBeDefined()
    expect(questionerPages.ProblemSubmissionsPage).toBeDefined()
  })
})
