import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Report } from '@/types'

export default function ReportReader({ report }: { report: Report }) {
  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      <div className="bg-surface border border-border rounded-xl p-7 text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => <h2 className="text-lg font-bold mt-5 mb-2.5">{children}</h2>,
            h3: ({ children }) => <h3 className="text-[15px] font-bold mt-4 mb-2 text-muted-foreground">{children}</h3>,
            p: ({ children }) => <p className="mb-3 text-muted-foreground">{children}</p>,
            ul: ({ children }) => <ul className="pl-5 mb-3 list-disc">{children}</ul>,
            li: ({ children }) => <li className="mb-1 text-muted-foreground">{children}</li>,
            strong: ({ children }) => <strong className="text-foreground">{children}</strong>,
            table: ({ children }) => <table className="w-full text-xs border-collapse my-3">{children}</table>,
            th: ({ children }) => <th className="text-left px-2 py-1.5 border-b border-border text-muted-foreground font-semibold">{children}</th>,
            td: ({ children }) => <td className="px-2 py-1.5 border-b border-border-light">{children}</td>,
          }}
        >
          {report.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
