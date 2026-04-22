import { Skeleton } from '@/components/ui/skeleton'

/** Fila de carga que imita un mensaje (avatar + cabecera + cuerpo). */
export function MessageSkeleton() {
  return (
    <div className="flex gap-3.5 px-3 py-2.5" aria-hidden>
      <Skeleton className="size-10 shrink-0 rounded-[0.65rem] opacity-70" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <Skeleton className="h-3.5 w-28 rounded-md" />
        <Skeleton className="h-4 w-full max-w-[min(100%,55ch)] rounded-md" />
        <Skeleton className="h-4 w-[85%] max-w-[50ch] rounded-md opacity-80" />
      </div>
    </div>
  )
}
