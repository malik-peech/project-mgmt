'use client'

/**
 * A thin draggable handle used to resize a column. Meant to be placed on the
 * right edge of a <th>. Parent should be `position: relative` and set a
 * computed pixel width via <col> or inline style.
 */
export default function ResizeHandle({
  onMouseDown,
  title = 'Redimensionner la colonne',
}: {
  onMouseDown: (e: React.MouseEvent) => void
  title?: string
}) {
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      title={title}
      className="absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize select-none group/handle z-10"
      style={{ touchAction: 'none' }}
    >
      <span className="block h-full w-[2px] mx-auto bg-gray-300 group-hover/handle:bg-indigo-500 transition-colors" />
    </span>
  )
}
