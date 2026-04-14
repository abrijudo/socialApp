import { Skeleton } from '@/components/ui/skeleton'

/** Fila de carga que imita un mensaje (avatar + cabecera + cuerpo). */
export function MessageSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-2" aria-hidden>
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="h-4 w-full max-w-[80%]" />
      </div>
    </div>
  )
}
