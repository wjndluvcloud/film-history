import { useId, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { vi } from 'date-fns/locale'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

type FilmDateFieldProps = {
  kind: 'day' | 'month'
  initialValue: string
}

function initialDate(kind: FilmDateFieldProps['kind'], value: string): Date {
  const parts = value.split('/').map(Number)
  const date = new Date(0)
  if (kind === 'month') date.setFullYear(parts[1], parts[0] - 1, 1)
  else date.setFullYear(parts[2], parts[1] - 1, parts[0])
  return date
}

export function FilmDateField({ kind, initialValue }: FilmDateFieldProps) {
  const inputId = useId()
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => initialDate(kind, initialValue))
  const isMonth = kind === 'month'
  const label = isMonth ? 'Tháng dự định' : 'Ngày xem'

  return (
    <div className="calendar-field">
      <label className="calendar-field-label" htmlFor={inputId}>{label}</label>
      <DatePicker
        autoComplete="off"
        calendarClassName="calendar-field-calendar"
        className="calendar-field-input"
        customInput={<input
          inputMode="numeric"
          maxLength={isMonth ? 7 : 10}
          onInput={(event) => event.currentTarget.setCustomValidity('')}
          pattern={isMonth ? '(0[1-9]|1[0-2])/[0-9]{4}' : '[0-9]{2}/[0-9]{2}/[0-9]{4}'}
        />}
        dateFormat={isMonth ? 'MM/yyyy' : 'dd/MM/yyyy'}
        dropdownMode="select"
        icon={<button aria-label={`Mở lịch chọn ${isMonth ? 'tháng' : 'ngày'}`} type="button"><CalendarDays size={17} /></button>}
        id={inputId}
        locale={vi}
        name={isMonth ? 'plannedMonth' : 'watchedOn'}
        onChange={(date: Date | null) => {
          setSelectedDate(date)
          const input = document.getElementById(inputId)
          if (input instanceof HTMLInputElement) input.setCustomValidity('')
        }}
        placeholderText={isMonth ? 'MM/yyyy' : 'dd/MM/yyyy'}
        popperClassName="calendar-field-popper"
        popperPlacement="bottom-start"
        portalId="film-calendar-portal"
        required
        selected={selectedDate}
        showIcon
        showMonthDropdown={!isMonth}
        showMonthYearPicker={isMonth}
        showPopperArrow={false}
        showYearDropdown
        strictParsing
        title={isMonth ? 'Nhập tháng theo định dạng MM/yyyy' : 'Nhập ngày theo định dạng dd/MM/yyyy'}
        toggleCalendarOnIconClick
        wrapperClassName="calendar-field-wrapper"
        yearDropdownItemNumber={100}
      />
    </div>
  )
}
