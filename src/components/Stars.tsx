import { Star } from 'lucide-react'

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} trên 5 sao`}>
      <Star size={14} fill="currentColor" />
      <span>{rating ? rating.toFixed(1) : 'Chưa chấm'}</span>
    </span>
  )
}
