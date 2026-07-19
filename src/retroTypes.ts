export interface RetroColumn {
  id: string;
  title: string;
  color: string;
}

export interface RetroNote {
  id: string;
  columnId: string;
  authorId: string;
  authorName: string;
  text: string;
  color: string;
  createdAt: number;
}

export interface RetroParticipant {
  id: string;
  name: string;
  color: string;
  isFacilitator: boolean;
}

export interface RetroBoard {
  code: string;
  name: string;
  facilitatorId: string;
  columns: RetroColumn[];
  notes: RetroNote[];
  participants: RetroParticipant[];
}

export interface RetroJoinResult {
  participantId: string;
  board: RetroBoard;
}
