import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  Clapperboard,
  CircleOff,
  Film,
  LayoutDashboard,
  Plus,
  Search,
  Star,
  LogIn,
  LogOut,
} from 'lucide-react'
import { fetchFilms, login, logout, saveRemoteFilms, verifySession, type FilmSnapshot } from './filmApi'
import { AddFilmDialog, ReturnToWatchlistDialog, WatchedEntryDialog } from './components/FilmDialogs'
import { FilmSection } from './components/FilmSection'
import { Stars } from './components/Stars'
import { WatchlistPanel } from './components/WatchlistPanel'
import {
  formatDate,
  formatLocalDate,
  formatLocalMonth,
  dateSortKey,
  FILMS_STORAGE_KEY,
  loadFilms,
  parseDisplayDate,
  type FilmEntry,
  type FilmStatus,
} from './filmUtils'
import './App.css'

type View = 'overview' | FilmStatus

const navigation: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'watched', label: 'Đã xem', icon: Clapperboard },
  { id: 'planned', label: 'Muốn xem', icon: Bookmark },
  { id: 'missed', label: 'Bỏ lỡ', icon: CircleOff },
]

function readWatchedDate(form: HTMLFormElement): string | null {
  const dateInput = form.elements.namedItem('watchedOn') as HTMLInputElement
  const watchedOn = parseDisplayDate(dateInput.value)
  if (!watchedOn) {
    dateInput.setCustomValidity('Nhập ngày hợp lệ theo định dạng dd/MM/yyyy.')
    dateInput.reportValidity()
  }
  return watchedOn
}

function App() {
  const [films, setFilms] = useState<FilmEntry[]>([])
  const snapshotRef = useRef<FilmSnapshot>({ films: [], sha: null })
  const savingRef = useRef(false)
  const [isOwner, setIsOwner] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [error, setError] = useState('')
  const [legacyFilms, setLegacyFilms] = useState<FilmEntry[]>(loadFilms)
  const [activeView, setActiveView] = useState<View>('overview')
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newFilmStatus, setNewFilmStatus] = useState<FilmStatus>('watched')
  const [filmToUpdateWatched, setFilmToUpdateWatched] = useState<FilmEntry | null>(null)
  const [filmToReturnToWatchlist, setFilmToReturnToWatchlist] = useState<FilmEntry | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchFilms().then((snapshot) => {
      if (cancelled) return
      snapshotRef.current = snapshot
      setFilms(snapshot.films)
      setHasLoaded(true)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu phim.')
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    verifySession().then((owner) => {
      if (!cancelled) setIsOwner(owner)
    }).catch(() => {
      if (!cancelled) setIsOwner(false)
    })
    return () => { cancelled = true }
  }, [])

  async function commitFilms(update: (current: FilmEntry[]) => FilmEntry[]): Promise<boolean> {
    if (!isOwner || savingRef.current || !hasLoaded) return false
    savingRef.current = true
    setIsSaving(true)
    setError('')
    try {
      const current = snapshotRef.current
      const saved = await saveRemoteFilms({ films: update(current.films), sha: current.sha })
      snapshotRef.current = saved
      setFilms(saved.films)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được dữ liệu phim.')
      return false
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const password = String(new FormData(form).get('password'))
    setError('')
    try {
      await login(password)
      setIsOwner(true)
      setIsLoginOpen(false)
      form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đăng nhập được.')
    }
  }

  async function handleLogout() {
    try { await logout() } catch { /* The local session is cleared even if the API is unavailable. */ }
    setIsOwner(false)
    setIsModalOpen(false)
    setFilmToUpdateWatched(null)
    setFilmToReturnToWatchlist(null)
  }

  async function importLocalFilms() {
    if (films.length || !legacyFilms.length) return
    const saved = await commitFilms(() => legacyFilms)
    if (saved) {
      localStorage.removeItem(FILMS_STORAGE_KEY)
      setLegacyFilms([])
    }
  }

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search-box input')?.focus()
      }
    }

    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  const today = new Date()
  const currentDate = formatLocalDate(today)
  const currentMonth = formatLocalMonth(today)
  const todayLabel = currentDate
  const watched = films
    .filter((film) => film.status === 'watched')
    .sort((first, second) => dateSortKey(second.watchedOn).localeCompare(dateSortKey(first.watchedOn)))
  const planned = films.filter((film) => film.status === 'planned')
  const missed = films.filter((film) => film.status === 'missed')
  const watchedThisMonth = watched.filter((film) => film.watchedOn.endsWith(currentMonth))
  const ratedFilms = watched.filter((film) => film.rating > 0)
  const averageRating = ratedFilms.length
    ? (ratedFilms.reduce((total, film) => total + film.rating, 0) / ratedFilms.length).toFixed(1)
    : '—'
  const latestFilm = watched[0]
  const collection = activeView === 'planned' ? planned : activeView === 'missed' ? missed : watched
  const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN')
  const visibleFilms = collection.filter((film) =>
    `${film.title} ${film.director} ${film.year}`.toLocaleLowerCase('vi-VN').includes(normalizedSearch),
  )
  async function saveWatchedEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!filmToUpdateWatched) return

    const formData = new FormData(event.currentTarget)
    const watchedOn = readWatchedDate(event.currentTarget)
    if (!watchedOn) return

    const saved = await commitFilms((currentFilms) =>
      currentFilms.map((film) =>
        film.id === filmToUpdateWatched.id
          ? {
              ...film,
              status: 'watched',
              watchedOn,
              rating: Number(formData.get('rating')),
              poster: String(formData.get('poster')).trim(),
              note: String(formData.get('note')).trim(),
            }
          : film,
      ),
    )
    if (saved) setFilmToUpdateWatched(null)
  }

  async function markFilmMissed(filmId: number) {
    await commitFilms((currentFilms) =>
      currentFilms.map((film) =>
        film.id === filmId
          ? { ...film, status: 'missed', watchedOn: '', rating: 0 }
          : film,
      ),
    )
  }

  function returnFilmToWatchlist(filmId: number) {
    const film = films.find((entry) => entry.id === filmId)
    if (film) setFilmToReturnToWatchlist(film)
  }

  async function saveReturnedFilm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!filmToReturnToWatchlist) return

    const formData = new FormData(event.currentTarget)
    const plannedMonth = String(formData.get('plannedMonth'))

    const saved = await commitFilms((currentFilms) =>
      currentFilms.map((film) =>
        film.id === filmToReturnToWatchlist.id
          ? { ...film, status: 'planned', watchedOn: '', rating: 0, plannedMonth }
          : film,
      ),
    )
    if (saved) {
      setFilmToReturnToWatchlist(null)
      setActiveView('planned')
    }
  }

  function openAddFilm(status: FilmStatus = activeView === 'planned' ? 'planned' : 'watched') {
    setNewFilmStatus(status)
    setIsModalOpen(true)
  }

  async function addFilm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const status = formData.get('status') as FilmStatus
    const title = String(formData.get('title')).trim()
    if (!title) {
      const titleInput = event.currentTarget.elements.namedItem('title') as HTMLInputElement
      titleInput.setCustomValidity('Nhập tên phim.')
      titleInput.reportValidity()
      return
    }
    const poster = String(formData.get('poster')).trim()
    const watchedOn = status === 'watched' ? readWatchedDate(event.currentTarget) : ''
    const plannedMonth = status === 'planned' ? String(formData.get('plannedMonth')) : ''
    if (status === 'watched' && !watchedOn) return

    const newFilm: FilmEntry = {
      id: 0,
      title,
      director: String(formData.get('director')).trim() || 'Chưa rõ đạo diễn',
      year: Number(formData.get('year')) || today.getFullYear(),
      watchedOn: watchedOn || '',
      plannedMonth,
      rating: status === 'watched' ? Number(formData.get('rating')) || 0 : 0,
      status,
      note: String(formData.get('note')).trim(),
      poster: poster || 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    }
    const saved = await commitFilms((currentFilms) => {
      const nextId = currentFilms.reduce((highest, film) => Math.max(highest, film.id), 0) + 1
      return [{ ...newFilm, id: nextId }, ...currentFilms]
    })
    if (saved) {
      setActiveView(status)
      setIsModalOpen(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Scenes, về đầu trang">
          <span className="brand-mark"><Film size={19} strokeWidth={2.4} /></span>
          <span>scenes<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-caption">NHẬT KÝ XEM PHIM</div>
        <nav className="main-nav" aria-label="Điều hướng chính">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${activeView === id ? 'active' : ''}`}
              key={id}
              aria-label={label}
              onClick={() => setActiveView(id)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {id === 'watched' && <span className="nav-count">{watched.length}</span>}
              {id === 'planned' && <span className="nav-count">{planned.length}</span>}
              {id === 'missed' && <span className="nav-count">{missed.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-mark">“</span>
          <p>Một bộ phim hay là một nơi chốn ta có thể quay về.</p>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">DV</span>
          <span className="profile-name">Duc Vu<small>Người thích xem phim</small></span>
          <span className="profile-menu">···</span>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">THƯ VIỆN <span>/</span> {navigation.find((item) => item.id === activeView)?.label.toUpperCase()}</div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Tìm phim"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm phim, đạo diễn..."
              value={search}
            />
            <kbd>Ctrl K</kbd>
          </label>
          <div className="owner-controls">
            {isOwner ? (
              <button onClick={handleLogout} type="button"><LogOut size={14} /> Đăng xuất</button>
            ) : (
              <button onClick={() => setIsLoginOpen((open) => !open)} type="button"><LogIn size={14} /> Đăng nhập</button>
            )}
          </div>
        </header>

        <div className="page-wrap">
          {error && <div className="api-message" role="alert">{error}</div>}
          {isLoading && <div className="api-message" role="status">Đang tải dữ liệu phim...</div>}
          {isSaving && <div className="api-message" role="status">Đang lưu thay đổi...</div>}
          {isOwner && hasLoaded && !films.length && legacyFilms.length > 0 && (
            <div className="api-message">
              Tìm thấy {legacyFilms.length} phim đã lưu trên trình duyệt này.{' '}
              <button disabled={isSaving} onClick={importLocalFilms} type="button">Nhập vào dữ liệu chung</button>
            </div>
          )}
          {isLoginOpen && !isOwner && (
            <form className="owner-login" onSubmit={handleLogin}>
              <label>Mật khẩu quản trị <input autoComplete="current-password" name="password" required type="password" /></label>
              <button className="primary-button" type="submit">Đăng nhập</button>
            </form>
          )}
          <section className="welcome-row">
            <div>
              <p className="eyebrow">{todayLabel}</p>
              <h1>{activeView === 'overview' ? 'Một tháng đầy thước phim.' : navigation.find((item) => item.id === activeView)?.label}</h1>
              <p className="welcome-copy">Chào bạn, đây là câu chuyện điện ảnh của mình.</p>
            </div>
            {isOwner && hasLoaded && <button className="primary-button" disabled={isSaving} onClick={() => openAddFilm()} type="button">
              <Plus size={17} /> Ghi phim mới
            </button>}
          </section>

          {activeView === 'overview' && latestFilm && (
            <section className="featured-film" aria-label="Phim xem gần nhất">
              <div className="featured-image">
                <img alt={`Poster phim ${latestFilm.title}`} src={latestFilm.poster} onError={(event) => { event.currentTarget.style.display = 'none' }} />
                <span className="image-index">01 <span>/ LATEST ENTRY</span></span>
                <span className="poster-caption">A FILM BY {latestFilm.director.toUpperCase()}</span>
              </div>
              <div className="featured-copy">
                <div className="feature-kicker"><span className="live-dot" /> PHIM VỪA XEM <span className="feature-date">{formatDate(latestFilm.watchedOn)}</span></div>
                <h2>{latestFilm.title}<span className="title-year">({latestFilm.year})</span></h2>
                <p className="feature-meta">{latestFilm.director}</p>
                <div className="feature-rating"><Stars rating={latestFilm.rating} /></div>
                <p className="feature-note">“{latestFilm.note || 'Một bộ phim đáng để ghi lại.'}”</p>
                <button className="text-link" onClick={() => setActiveView('watched')} type="button">Mở nhật ký <ArrowUpRight size={16} /></button>
              </div>
            </section>
          )}

          {hasLoaded && activeView === 'overview' && (
            <section className="stats-row" aria-label="Thống kê">
              <article className="stat-card">
                <div className="stat-top"><span>PHIM ĐÃ XEM</span><Clapperboard size={17} /></div>
                <div className="stat-value">{watched.length}<small> phim</small></div>
                <div className="stat-foot"><span className="stat-accent">+{watchedThisMonth.length}</span> trong tháng này</div>
              </article>
              <article className="stat-card">
                <div className="stat-top"><span>ĐIỂM TRUNG BÌNH</span><Star size={17} /></div>
                <div className="stat-value">{averageRating}<small> / 5</small></div>
                <div className="stat-foot">Từ những bộ phim đã chấm</div>
              </article>
              <article className="stat-card">
                <div className="stat-top"><span>MUỐN XEM</span><Bookmark size={17} /></div>
                <div className="stat-value">{planned.length}<small> phim</small></div>
                <div className="stat-foot">Trong danh sách dự định</div>
              </article>
            </section>
          )}

          {hasLoaded && <div className="content-grid">
            <FilmSection
              view={activeView}
              films={visibleFilms}
              canEdit={isOwner && !isSaving}
              onShowWatched={() => setActiveView('watched')}
              onAddFilm={() => openAddFilm()}
              onMarkWatched={setFilmToUpdateWatched}
              onEditWatched={setFilmToUpdateWatched}
              onMarkMissed={markFilmMissed}
              onReturnToWatchlist={returnFilmToWatchlist}
            />

            {activeView !== 'planned' && activeView !== 'missed' && (
              <WatchlistPanel
                films={planned}
                canEdit={isOwner && !isSaving}
                currentMonth={currentMonth}
                watchedThisMonthCount={watchedThisMonth.length}
                onMarkWatched={setFilmToUpdateWatched}
                onMarkMissed={markFilmMissed}
                onAddFilm={() => { setActiveView('planned'); openAddFilm('planned') }}
              />
            )}
          </div>}
          <footer className="page-footer"><span>SCENES © {today.getFullYear()}</span><span>ĐƯỢC LƯU GIỮ, KHÔNG BỊ LÃNG QUÊN.</span></footer>
        </div>
      </main>

      {isModalOpen && (
        <AddFilmDialog
          currentDate={currentDate}
          currentMonth={currentMonth}
          status={newFilmStatus}
          onStatusChange={setNewFilmStatus}
          onSubmit={addFilm}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {filmToUpdateWatched && (
        <WatchedEntryDialog
          film={filmToUpdateWatched}
          currentDate={currentDate}
          onSubmit={saveWatchedEntry}
          onClose={() => setFilmToUpdateWatched(null)}
        />
      )}

      {filmToReturnToWatchlist && (
        <ReturnToWatchlistDialog
          film={filmToReturnToWatchlist}
          currentMonth={currentMonth}
          onSubmit={saveReturnedFilm}
          onClose={() => setFilmToReturnToWatchlist(null)}
        />
      )}
    </div>
  )
}

export default App
