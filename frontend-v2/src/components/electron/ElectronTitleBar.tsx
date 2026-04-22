import { Minus, Square, X } from 'lucide-react';

export function ElectronTitleBar() {
  const handleMinimize = () => {
    (window as any).electronAPI?.windowMin?.();
  };

  const handleMaximize = () => {
    (window as any).electronAPI?.windowMax?.();
  };

  const handleClose = () => {
    (window as any).electronAPI?.windowClose?.();
  };

  return (
    // CAMBIO AQUÍ: He quitado bg-[#09090b] y he puesto bg-transparent (o puedes probar bg-zinc-950 si tu app usa ese fondo base)
    <div className="flex h-9 w-full select-none items-center justify-between bg-transparent [-webkit-app-region:drag]">
      
      {/* Título */}
      <div className="flex items-center pl-4 text-xs font-medium text-zinc-500">
        <span>Social Club</span>
      </div>

      {/* Controles */}
      <div className="flex h-full items-center gap-x-1 pr-1 [-webkit-app-region:no-drag]">
        <button
          onClick={handleMinimize}
          className="flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent text-zinc-400 outline-none transition-colors hover:bg-zinc-800/50 hover:text-zinc-100 focus:outline-none"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>

        <button
          onClick={handleMaximize}
          className="flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent text-zinc-400 outline-none transition-colors hover:bg-zinc-800/50 hover:text-zinc-100 focus:outline-none"
        >
          <Square size={12} strokeWidth={1.5} />
        </button>

        <button
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent text-zinc-400 outline-none transition-colors hover:bg-red-500/80 hover:text-white focus:outline-none"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}