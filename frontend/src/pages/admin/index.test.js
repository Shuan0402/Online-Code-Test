import { describe, it, expect } from 'vitest'
import * as adminPages from './index'

describe('Admin pages barrel', () => {
  it('exports all admin pages', () => {
    expect(adminPages.MemberListPage).toBeDefined()
    expect(adminPages.MemberCreatePage).toBeDefined()
    expect(adminPages.DashboardPage).toBeDefined()
    expect(adminPages.MemberDetailPage).toBeDefined()
    expect(adminPages.AdminExamListPage).toBeDefined()
    expect(adminPages.AdminExamDetailPage).toBeDefined()
    expect(adminPages.AdminProblemListPage).toBeDefined()
    expect(adminPages.AdminProblemDetailPage).toBeDefined()
  })
})
