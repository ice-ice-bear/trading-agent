import { useRef, useCallback, useState, type ReactNode } from 'react'

interface MainLayoutProps {
  children: ReactNode
  rightPanel: ReactNode
}

export default function MainLayout({ children, rightPanel }: MainLayoutProps) {
  const [rightWidth, setRightWidth] = useState(420)
  const isResizing = useRef(false)

  const onMouseDown = useCallback(() => {
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = window.innerWidth - e.clientX
      if (newWidth >= 280 && newWidth <= 600) {
        setRightWidth(newWidth)
      }
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 min-w-0">
        {children}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="w-1 cursor-col-resize bg-transparent hover:bg-primary transition-colors shrink-0"
      />
      <div
        className="bg-surface border-l border-border flex flex-col overflow-hidden shrink-0"
        style={{ width: rightWidth }}
      >
        {rightPanel}
      </div>
    </div>
  )
}
