import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Order } from '@/types'
import { getOrders } from '@/services/api'

export default function RecentOrders({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    getOrders(10).then(d => setOrders(d.orders)).catch(() => {})
  }, [refreshTrigger])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Recent Orders</h3>
        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {orders.filter(o => new Date(o.timestamp).toDateString() === new Date().toDateString()).length} today
        </span>
      </div>
      {orders.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No orders yet</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Stock</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Side</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Qty</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 5).map(o => (
              <tr key={o.id} className="hover:bg-muted/50">
                <td className="px-3 py-2.5 border-b border-border-light font-semibold">{o.stock_name}</td>
                <td className="px-3 py-2.5 border-b border-border-light">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-bold text-white',
                    o.side === 'buy' ? 'bg-error' : 'bg-blue'
                  )}>
                    {o.side.toUpperCase()}
                  </span>
                </td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{o.quantity}</td>
                <td className={cn('px-3 py-2.5 border-b border-border-light text-xs font-semibold',
                  o.status === 'filled' ? 'text-success' : o.status === 'rejected' ? 'text-error' : 'text-muted-foreground'
                )}>
                  {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
