import { useState } from 'react';
import type { RetroNote as RetroNoteType } from '../retroTypes';

interface Props {
  note: RetroNoteType;
  canEdit: boolean; // the author
  canDelete: boolean; // author or facilitator
  onEdit: (text: string) => void;
  onDelete: () => void;
}

// A sticky note. Its colour is the author's auto-assigned participant colour
// (set server-side) — there's no manual colour picker.
export default function RetroNote({ note, canEdit, canDelete, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== note.text) onEdit(next);
    else setDraft(note.text);
  }

  return (
    <div className="retro-note" style={{ background: note.color }}>
      {editing ? (
        <textarea
          className="retro-note-edit"
          value={draft}
          autoFocus
          rows={3}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              setDraft(note.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <p
          className="retro-note-text"
          onClick={() => canEdit && setEditing(true)}
          title={canEdit ? 'Click to edit' : undefined}
        >
          {note.text}
        </p>
      )}

      <div className="retro-note-foot">
        <span className="retro-note-author">{note.authorName}</span>
        {canDelete && (
          <button className="retro-note-del" title="Delete note" onClick={onDelete}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}
