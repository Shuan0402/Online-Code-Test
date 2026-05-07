import enum

class UserRole(enum.Enum):
    Admin = "Admin"
    Candidate = "Candidate"

class DifficultyLevel(enum.Enum):
    Easy = "Easy"
    Medium = "Medium"
    Hard = "Hard"

class ExamStatus(enum.Enum):
    Draft = "Draft"
    Published = "Published"
    Ongoing = "Ongoing"
    Finished = "Finished"
    Archived = "Archived"

class JudgeStatus(enum.Enum):
    Pending = "Pending"
    Judging = "Judging"
    AC = "AC"
    WA = "WA"
    TLE = "TLE"
    MLE = "MLE"
    RE = "RE"
    CE = "CE"