import { ArrowUpRight, Bookmark, CalendarDays, Check, CircleOff, Film, Pencil } from 'lucide-react'
import { formatDate, formatMonth, groupFilmsByMonth, type FilmEntry, type FilmView } from '../filmUtils'
import { Stars } from './Stars'

type FilmSectionProps = {
  view: FilmView
  films: FilmEntry[]
  canEdit: boolean
  onShowWatched: () => void
  onAddFilm: () => void
  onUpdateWatched: (film: FilmEntry) => void
  onMarkMissed: (filmId: number) => void
  onReturnToWatchlist: (filmId: number) => void
}

function FilmRow({ film, index, canEdit, onUpdateWatched, onMarkMissed, onReturnToWatchlist }: {
  film: FilmEntry
  index: number
  canEdit: boolean
  onUpdateWatched: FilmSectionProps['onUpdateWatched']
  onMarkMissed: FilmSectionProps['onMarkMissed']
  onReturnToWatchlist: FilmSectionProps['onReturnToWatchlist']
}) {
  return (
    <article className="film-row">
      <div className={`film-poster poster-${index % 4}`}>
        <img alt={`Poster phim ${film.title}`} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} src={film.poster} />
        <span>{film.title.slice(0, 1)}</span>
      </div>
      <div className="film-info">
        <div className="film-title-line"><h3>{film.title}</h3><span className="film-year">{film.year}</span></div>
        <p>{film.director}</p>
        <div className="film-bottom">
          <span className="film-date"><CalendarDays size={13} /> {film.status === 'watched' ? formatDate(film.watchedOn) : formatMonth(film.plannedMonth || '')}</span>
          {film.status === 'watched' ? (
            <div className="film-actions watched-actions">
              <Stars rating={film.rating} />
              {canEdit && <button className="edit-watched" onClick={() => onUpdateWatched(film)} type="button"><Pencil size={13} /> Sửa</button>}
            </div>
          ) : (
            canEdit && <div className="film-actions">
              <button className="mark-watched" onClick={() => onUpdateWatched(film)} type="button"><Check size={13} /> Đã xem</button>
              {film.status === 'planned' ? (
                <button className="mark-missed" onClick={() => onMarkMissed(film.id)} type="button"><CircleOff size={13} /> Bỏ lỡ</button>
              ) : (
                <button className="mark-missed" onClick={() => onReturnToWatchlist(film.id)} type="button"><Bookmark size={13} /> Muốn xem lại</button>
              )}
            </div>
          )}
        </div>
        {film.note && <p className="film-note">{film.note}</p>}
      </div>
    </article>
  )
}

export function FilmSection({ view, films, canEdit, onShowWatched, onAddFilm, onUpdateWatched, onMarkMissed, onReturnToWatchlist }: FilmSectionProps) {
  const groups = view === 'overview' ? [] : groupFilmsByMonth(films, view)

  return (
    <section className="film-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{view === 'planned' ? 'DANH SÁCH DỰ ĐỊNH' : view === 'missed' ? 'PHIM BỎ LỠ' : 'LƯU LẠI NHỮNG KHOẢNH KHẮC'}</p>
          <h2>{view === 'planned' ? 'Muốn xem' : view === 'missed' ? 'Phim bỏ lỡ' : view === 'watched' ? 'Nhật ký đã xem' : 'Nhật ký gần đây'} <span>{films.length.toString().padStart(2, '0')}</span></h2>
        </div>
        {view === 'overview' && <button className="subtle-link" onClick={onShowWatched} type="button">Xem tất cả <ArrowUpRight size={14} /></button>}
      </div>
      {films.length ? (
        <div className="film-list">
          {view === 'overview'
            ? films.map((film, index) => <FilmRow key={film.id} film={film} index={index} canEdit={canEdit} onUpdateWatched={onUpdateWatched} onMarkMissed={onMarkMissed} onReturnToWatchlist={onReturnToWatchlist} />)
            : groups.map((group) => (
                <section className="month-group" key={group.month || 'unscheduled'}>
                  <div className="month-heading"><h3>{formatMonth(group.month)}</h3><span>{group.films.length} PHIM</span></div>
                  {group.films.map((film, index) => <FilmRow key={film.id} film={film} index={index} canEdit={canEdit} onUpdateWatched={onUpdateWatched} onMarkMissed={onMarkMissed} onReturnToWatchlist={onReturnToWatchlist} />)}
                </section>
              ))}
        </div>
      ) : (
        <div className="empty-state"><Film size={24} /><p>Chưa có phim phù hợp.</p>{canEdit && <button onClick={onAddFilm} type="button">Thêm phim đầu tiên</button>}</div>
      )}
    </section>
  )
}
