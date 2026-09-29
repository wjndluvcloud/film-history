import { Check, CircleOff, Plus } from 'lucide-react'
import type { FilmEntry } from '../filmUtils'

type WatchlistPanelProps = {
  films: FilmEntry[]
  canEdit: boolean
  currentMonth: string
  watchedThisMonthCount: number
  onUpdateWatched: (film: FilmEntry) => void
  onMarkMissed: (filmId: number) => void
  onAddFilm: () => void
}

export function WatchlistPanel({ films, canEdit, currentMonth, watchedThisMonthCount, onUpdateWatched, onMarkMissed, onAddFilm }: WatchlistPanelProps) {
  return (
    <aside className="watchlist-panel">
      <div className="watchlist-heading"><div><h2>Chờ được xem</h2></div><span className="watchlist-count">{films.length.toString().padStart(2, '0')}</span></div>
      <div className="watchlist-items">
        {films.slice(0, 3).map((film) => (
          <article className="watchlist-item" key={film.id}>
            <div className="watchlist-poster">
              {film.poster ? (
                <img alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} src={film.poster} />
              ) : (
                <span>{film.title.slice(0, 1)}</span>
              )}
            </div>
            <div className="watchlist-info"><h3>{film.title}</h3><p>{film.year}</p>{canEdit && <div className="watchlist-actions"><button onClick={() => onUpdateWatched(film)} type="button"><Check size={13} /> Đã xem</button><button className="missed-action" onClick={() => onMarkMissed(film.id)} type="button"><CircleOff size={13} /> Bỏ lỡ</button></div>}</div>
          </article>
        ))}
        {!films.length && <p className="watchlist-empty">Danh sách đang trống. Thêm một phim bạn muốn xem nhé.</p>}
      </div>
      {canEdit && <button className="watchlist-add" onClick={onAddFilm} type="button"><Plus size={15} /> Thêm vào danh sách</button>}
      <div className="monthly-note"><span className="monthly-icon">✳</span><div><strong>Mục tiêu {currentMonth}</strong><p>{watchedThisMonthCount} / 8 phim đã xem</p><div className="progress-track"><span style={{ width: `${Math.min((watchedThisMonthCount / 8) * 100, 100)}%` }} /></div></div></div>
    </aside>
  )
}
