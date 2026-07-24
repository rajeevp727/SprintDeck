import type { RetroBoard } from '../retroTypes';
import { exportDoc, retroExportDoc, exportFormats } from '../export';

interface Props {
  board: RetroBoard;
  onClose: () => void;
}

// Shown to the facilitator once the retrospective is ended — mirrors the planning
// ResultsModal: a read-only summary of every column's notes plus the reviewed
// carry-over items, with the same Text / Excel / PDF export options.
export default function RetroResultsModal({ board, onClose }: Props) {
  const carryOver = board.carryOverItems ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Retrospective Results</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {carryOver.length > 0 && (
          <div className="table-scroll">
            <h4 className="results-subhead">Carried-over action items</h4>
            <table className="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Done</th>
                </tr>
              </thead>
              <tbody>
                {carryOver.map((it, i) => (
                  <tr key={it.id}>
                    <td>{i + 1}</td>
                    <td className="story-cell">{it.text}</td>
                    <td>{it.done ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {board.columns.map((col) => {
          const notes = board.notes.filter((n) => n.columnId === col.id);
          return (
            <div className="table-scroll" key={col.id}>
              <h4 className="results-subhead">
                {col.title} <span className="muted">({notes.length})</span>
              </h4>
              {notes.length === 0 ? (
                <p className="muted modal-empty">No notes.</p>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Note</th>
                      <th>Author</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((n, i) => (
                      <tr key={n.id}>
                        <td>{i + 1}</td>
                        <td className="story-cell">{n.text}</td>
                        <td>{n.authorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}

        <footer className="modal-footer">
          <span className="muted">{board.notes.length} notes</span>
          <div className="export-buttons">
            {exportFormats.map((f) => (
              <button
                key={f.format}
                className="ghost"
                onClick={() => exportDoc(f.format, retroExportDoc(board))}
              >
                {f.label}
              </button>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
