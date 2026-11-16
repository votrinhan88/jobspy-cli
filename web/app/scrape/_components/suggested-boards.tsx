import { useEffect, useState } from "react";
import type { DiscoveredBoard } from "@/lib/board-discovery";
import { providerLabel } from "@/app/scrape/_components/scrape-options";

const PREVIEW_COUNT = 10;

export function SuggestedBoards({ onAdd }: { onAdd: (board: DiscoveredBoard) => void }) {
  const [boards, setBoards] = useState<DiscoveredBoard[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/boards/discovered")
      .then((r) => (r.ok ? r.json() : { boards: [] }))
      .then((data) => setBoards(Array.isArray(data.boards) ? data.boards : []))
      .catch(() => {});
  }, []);

  function add(board: DiscoveredBoard) {
    setBoards((list) => list.filter((b) => b.entry !== board.entry));
    onAdd(board);
  }

  async function dismiss(board: DiscoveredBoard) {
    setBoards((list) => list.filter((b) => b.entry !== board.entry));
    await fetch("/api/boards/discovered", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismiss: board.entry }),
    }).catch(() => {});
  }

  if (boards.length === 0) return null;
  const shown = showAll ? boards : boards.slice(0, PREVIEW_COUNT);

  return (
    <section className="suggested-boards" role="region" aria-label="Suggested company boards">
      <h2 className="settings-title">
        Suggested company boards
        <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
          {boards.length} found
        </span>
      </h2>
      <ul className={`suggested-list${showAll ? "" : " suggested-list--preview"}`}>
        {shown.map((board) => (
          <li key={board.entry} className="suggested-item">
            <div className="suggested-text">
              <span className="suggested-name">{board.name}</span>
              <span className="muted">
                {`${board.jobs} saved job${board.jobs === 1 ? "" : "s"} · ${providerLabel(board.entry)}`}
              </span>
            </div>
            <button type="button" className="btn btn-primary" aria-label={`Add ${board.name}`} onClick={() => add(board)}>
              Add
            </button>
            <button type="button" className="btn" aria-label={`Dismiss ${board.name}`} onClick={() => dismiss(board)}>
              Dismiss
            </button>
          </li>
        ))}
      </ul>
      {boards.length > PREVIEW_COUNT && (
        <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `View all ${boards.length} suggestions`}
        </button>
      )}
    </section>
  );
}
