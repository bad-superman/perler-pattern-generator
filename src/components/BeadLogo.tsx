const BEAD_COLORS = [
  '#FBED56', '#63F347', '#41CCFF', '#FD543D',
  '#9EF780', '#7B4DFF', '#FEAC4C', '#F4D738',
  '#01ACEB', '#E84B8A', '#1C9C4F', '#FF995B',
  '#324BCA', '#CAEB7B', '#FD7C72', '#3DAF80',
]

export function BeadLogo({ size = 28 }: { size?: number }) {
  const cell = size / 4
  return (
    <svg className="bead-logo" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {BEAD_COLORS.map((color, index) => {
        const x = (index % 4) * cell + cell / 2
        const y = Math.floor(index / 4) * cell + cell / 2
        return <circle key={color + index} cx={x} cy={y} r={cell * 0.38} fill={color} />
      })}
    </svg>
  )
}
