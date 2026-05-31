## Summary
手動測試 PR #54 後跟 spec 對齊的 6 條修正。

## 對照表
| # | bug | 修法 | layer |
|---|---|---|---|
| 1 | candidate 看到每題配分 | ProblemPanel/ResultPage/ExamListPage 改「答對 X/Y 題」 | frontend + backend schema |
| 2 | score 顯示 100/25 | calc_score 按比例 * problem_points | backend |
| 3 | testcase 明細空白 | judge_callback INSERT SubmissionDetail | backend |
| 4 | correct_count 包含 stale AC | DISTINCT ON (problem_id) ORDER BY created_at DESC | backend |
| 5 | 進考試殘留舊 code | FinalizeModal 清 draft + start_time 變化清 | frontend |
| 6 | interviewer 無「移除題目」按鈕 | ExamDetailPage 加按鈕接既有 DELETE endpoint | frontend |

## Test plan
- [x] regression-questioner 7 pass（Q-1.3 score 50→12）
- [x] regression-coverage-gaps 4 pass / 1 expected fail (I-3.1)
- [x] 手動驗證所有 6 條