import enum

class UserRole(str, enum.Enum):
    Admin = "Admin"
    Candidate = "Candidate"
    Interviewer = "Interviewer"
    Questioner = "Questioner"

class DifficultyLevel(str, enum.Enum):
    Easy = "Easy"
    Medium = "Medium"
    Hard = "Hard"

class ExamStatus(str, enum.Enum):
    Draft = "Draft"
    Published = "Published"
    Ongoing = "Ongoing"
    Finished = "Finished"
    Archived = "Archived"

class JudgeStatus(str, enum.Enum):
    Pending = "Pending"
    Judging = "Judging"
    AC = "AC"
    WA = "WA"
    TLE = "TLE"
    MLE = "MLE"
    RE = "RE"
    CE = "CE"

class SubmissionType(str, enum.Enum):
    RUN_ONLY = "RUN_ONLY"
    OFFICIAL = "OFFICIAL"