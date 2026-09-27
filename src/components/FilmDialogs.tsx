import { useEffect, useRef, type FormEventHandler, type ReactNode } from 'react'
import { Bookmark, Check, Plus, X } from 'lucide-react'
import { type FilmEntry, type FilmStatus } from '../filmUtils'
import { FilmDateField } from './FilmDateField'

type DialogShellProps = {
  titleId: string
  onClose: () => void
  children: ReactNode
}

function DialogShell({ titleId, onClose, children }: DialogShellProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLElement>('[data-initial-focus], input:not([type="hidden"])')?.focus()

    function handleKeydown(event: KeyboardEvent) {
      const calendar = document.querySelector<HTMLElement>('.calendar-field-popper')
      if (event.key === 'Escape') {
        if (calendar) return
        event.preventDefault()
        closeRef.current()
        return
      }

      if (event.key !== 'Tab') return
      if (calendar?.contains(document.activeElement)) return
      const focusable = dialog?.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]), select, textarea')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      previouslyFocused?.focus()
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby={titleId} aria-modal="true" className="film-modal" ref={dialogRef} role="dialog">
        {children}
      </section>
    </div>
  )
}

const ratingOptions = [0, 3, 3.5, 4, 4.5, 5]

function RatingField({ initialRating, fullWidth = false }: { initialRating: number; fullWidth?: boolean }) {
  return (
    <label className={`form-field${fullWidth ? ' full-field' : ''}`}>
      Đánh giá
      <select defaultValue={initialRating} name="rating">
        {ratingOptions.map((rating) => (
          <option key={rating} value={rating}>{rating === 0 ? 'Chưa chấm' : `${rating} sao`}</option>
        ))}
      </select>
    </label>
  )
}

type AddFilmDialogProps = {
  currentDate: string
  currentMonth: string
  status: FilmStatus
  onStatusChange: (status: FilmStatus) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export function AddFilmDialog({ currentDate, currentMonth, status, onStatusChange, onSubmit, onClose }: AddFilmDialogProps) {
  return (
    <DialogShell titleId="modal-title" onClose={onClose}>
      <div className="modal-heading"><div><p className="eyebrow">THÊM VÀO SỔ TAY</p><h2 id="modal-title">Ghi một bộ phim.</h2></div><button aria-label="Đóng" className="icon-button" onClick={onClose} type="button"><X size={19} /></button></div>
      <form onSubmit={onSubmit}>
        <label className="form-field full-field">Tên phim<input name="title" onInput={(event) => event.currentTarget.setCustomValidity('')} placeholder="Ví dụ: Before Sunrise" required /></label>
        <div className="form-grid">
          <label className="form-field">Đạo diễn<input name="director" placeholder="Tên đạo diễn" /></label>
          <label className="form-field">Năm phát hành<input min="1888" max="2100" name="year" placeholder="2024" type="number" /></label>
        </div>
        <div className="film-details">
          <label className="form-field">Trạng thái<select onChange={(event) => onStatusChange(event.currentTarget.value as FilmStatus)} name="status" value={status}><option value="watched">Đã xem</option><option value="planned">Muốn xem</option></select></label>
          {status === 'planned' ? (
            <FilmDateField initialValue={currentMonth} kind="month" />
          ) : (
            <>
              <RatingField initialRating={3} />
              <FilmDateField initialValue={currentDate} kind="day" />
            </>
          )}
          <label className="form-field">Link poster<input name="poster" placeholder="https://..." type="url" /></label>
        </div>
        <label className="form-field full-field">Ghi chú<textarea name="note" placeholder="Một câu về cảm giác sau khi xem..." rows={3} /></label>
        <div className="modal-actions"><button className="cancel-button" onClick={onClose} type="button">Hủy</button><button className="primary-button" type="submit"><Plus size={16} /> Lưu phim</button></div>
      </form>
    </DialogShell>
  )
}

type WatchedEntryDialogProps = {
  film: FilmEntry
  currentDate: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export function WatchedEntryDialog({ film, currentDate, onSubmit, onClose }: WatchedEntryDialogProps) {
  const isEditing = film.status === 'watched'

  return (
    <DialogShell titleId="watch-modal-title" onClose={onClose}>
      <div className="modal-heading">
        <div>
          <p className="eyebrow">{isEditing ? 'CHỈNH SỬA PHIM ĐÃ XEM' : 'CẬP NHẬT NHẬT KÝ'}</p>
          <h2 id="watch-modal-title">{film.title}</h2>
        </div>
        <button aria-label="Đóng" className="icon-button" onClick={onClose} type="button"><X size={19} /></button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="full-field"><FilmDateField initialValue={film.watchedOn || currentDate} kind="day" /></div>
        <RatingField fullWidth initialRating={isEditing ? film.rating : 3} />
        <label className="form-field full-field">Ghi chú<textarea defaultValue={film.note} name="note" placeholder="Bạn cảm thấy thế nào về bộ phim?" rows={4} /></label>
        <div className="modal-actions">
          <button className="cancel-button" onClick={onClose} type="button">Hủy</button>
          <button className="primary-button" type="submit"><Check size={16} /> {isEditing ? 'Lưu thay đổi' : 'Lưu vào nhật ký'}</button>
        </div>
      </form>
    </DialogShell>
  )
}

type ReturnToWatchlistDialogProps = {
  film: FilmEntry
  currentMonth: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export function ReturnToWatchlistDialog({ film, currentMonth, onSubmit, onClose }: ReturnToWatchlistDialogProps) {
  const initialMonth = film.plannedMonth || currentMonth

  return (
    <DialogShell titleId="return-modal-title" onClose={onClose}>
      <div className="modal-heading">
        <div>
          <p className="eyebrow">THÊM LẠI VÀO DANH SÁCH</p>
          <h2 id="return-modal-title">{film.title}</h2>
        </div>
        <button aria-label="Đóng" className="icon-button" onClick={onClose} type="button"><X size={19} /></button>
      </div>
      <form onSubmit={onSubmit}>
        <FilmDateField initialValue={initialMonth} kind="month" />
        <div className="modal-actions">
          <button className="cancel-button" onClick={onClose} type="button">Hủy</button>
          <button className="primary-button" type="submit"><Bookmark size={16} /> Lưu vào Muốn xem</button>
        </div>
      </form>
    </DialogShell>
  )
}
