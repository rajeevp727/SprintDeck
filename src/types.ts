export type SessionStatus = 'waiting' | 'voting' | 'revealed';

export interface Participant {
  id: string;
  name: string;
  isModerator: boolean;
  hasVoted: boolean;
  vote: string | null; // null unless revealed (or it's your own vote)
}

export interface QueueItem {
  id: string;
  title: string;
}

export interface HistoryVote {
  name: string;
  vote: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  consensus: boolean;
  votes: HistoryVote[];
  at: number;
}

export interface Session {
  code: string;
  name: string;
  story: string;
  status: SessionStatus;
  finished: boolean;
  retroCode: string | null;
  deck: string[];
  moderatorId: string;
  participants: Participant[];
  queue: QueueItem[];
  history: HistoryEntry[];
  average: number | null;
  consensus: boolean;
}

export interface JoinResult {
  participantId: string;
  session: Session;
}
