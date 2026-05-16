"""
Judging service：從 worker callback 推 overall verdict + 算分。

Worker 只送 per_testcase（合約 3）；overall verdict 跟 score 都由 backend 算，
未來計分規則 / 加新 verdict 演進都只動這一檔（合約 5b）。
"""

from typing import Dict, List

from app.models.enums import JudgeStatus
from app.schemas.submission import CallbackTestcase


# 嚴重度由高到低（合約 3）：CE > RE > MLE > TLE > WA > AC
VERDICT_PRECEDENCE = ["CE", "RE", "MLE", "TLE", "WA", "AC"]


def aggregate_verdict(per_testcase: List[CallbackTestcase]) -> JudgeStatus:
    """從 per_testcase 推 overall verdict。

    Fail-fast 後 per_testcase 只含跑過的 testcases、最後一筆通常是 fail。
    若有任一 testcase 非 AC、整體就掛該 verdict（取嚴重度最高的）。

    Empty per_testcase = worker 沒成功跑任何一筆（理論上不該發生、防呆視為 RE）。
    """
    if not per_testcase:
        return JudgeStatus.RE
    verdicts = {tc.case_verdict for tc in per_testcase}
    for v in VERDICT_PRECEDENCE:
        if v in verdicts:
            return JudgeStatus(v)
    return JudgeStatus.AC


def calc_score(
    per_testcase: List[CallbackTestcase],
    weights_by_id: Dict[int, int],
) -> int:
    """Partial credit：只算 AC 那些 testcase 的 score_weight 和。

    沒在 per_testcase 內的 testcases（fail-fast 後沒跑到）視為「未測」、不計分。
    沒在 weights_by_id 內的 testcase_id（資料異常）也視為 0、不爆。
    """
    return sum(
        weights_by_id.get(tc.testcase_id, 0)
        for tc in per_testcase
        if tc.case_verdict == "AC"
    )
