import type { HistoryEntry } from '../types';
import { exportDoc, planningExportDoc, exportFormats } from '../export';

interface Props {
  sessionName: string;
  history: HistoryEntry[];
  onClose: () => void;
}

function cell(n: number | null) {
  return n === null ? '—' : n;
}

export default function ResultsModal({ sessionName, history, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Sprint Results</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {history.length === 0 ? (
          <p className="muted modal-empty">No stories estimated yet. Reveal a story and click “Save &amp; next”.</p>
        ) : (
          <div className="table-scroll">
            <table className="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Story</th>
                  <th>Avg</th>
                  <th>Median</th>
                  <th>Range</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id}>
                    <td>{i + 1}</td>
                    <td className="story-cell">{h.title}</td>
                    <td>{cell(h.average)}</td>
                    <td>{cell(h.median)}</td>
                    <td>
                      {cell(h.min)}–{cell(h.max)}
                    </td>
                    <td className="votes-cell">
                      {h.votes.map((v) => `${v.name}=${v.vote}`).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="modal-footer">
          <span className="muted">{history.length} estimated</span>
          <div className="export-buttons">
            {exportFormats.map((f) => (
              <button
                key={f.format}
                className="ghost"
                disabled={history.length === 0}
                onClick={() => exportDoc(f.format, planningExportDoc(sessionName, history))}
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
