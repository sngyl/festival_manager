export type ActiveEvent = {
  id: string;
  name: string;
};

export type ClassRanking = {
  rank: number;
  grade: number;
  classNo: number;
  totalPoints: number;
};

export type PersonalRanking = {
  rank: number;
  sid: string;
  totalPoints: number;
};

export type LeaderboardPayload = {
  event: ActiveEvent | null;
  classRankings: ClassRanking[];
  personalRankings: PersonalRanking[];
  updatedAt: string;
};

export type StudentGameScore = {
  gameName: string;
  points: number;
};

export type StudentDetail = {
  sid: string;
  grade: number;
  classNo: number;
  studentNo: number;
  totalPoints: number;
  personalRank: number | null;
  classRank: number | null;
  games: StudentGameScore[];
};
