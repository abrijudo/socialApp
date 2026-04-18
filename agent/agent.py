"""Mini-Discord · LiveKit Voice Agent (OpenAI Realtime API).

Agente de voz compatible con la LiveKit Agent Console (requiere
``livekit-agents>=1.5.2``). Arranca un Worker que escucha Jobs del
dispatcher de LiveKit y, por cada Job, se conecta a la sala y orquesta
una sesión voice-to-voice con OpenAI Realtime.

Ejecuta en local contra la Agent Console:

    python agent.py dev

Descarga modelos (Silero VAD, turn detector multilingüe, BVC):

    python agent.py download-files

Ejecuta en modo producción:

    python agent.py start
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
    metrics,
)
from livekit.plugins import noise_cancellation, openai, silero

load_dotenv()

logger = logging.getLogger("mini-discord-agent")
logger.setLevel(logging.INFO)


class MiniDiscordAssistant(Agent):
    """Asistente conversacional para canales de voz tipo Discord."""

    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "Eres un asistente de voz integrado en un servidor tipo Discord "
                "llamado Mini-Discord. Responde siempre en español, con un tono "
                "cercano, natural y amigable. Mantén las frases cortas y claras, "
                "pensadas para ser escuchadas por audio (sin emojis, ni markdown, "
                "ni listas numeradas). Si el usuario te interrumpe mientras hablas, "
                "detente inmediatamente y escucha. Cuando necesites datos externos, "
                "usa las herramientas que tienes disponibles en vez de inventar."
            ),
        )

    # ---------------------------------------------------------------
    # Function tools (quedan registradas automáticamente en el panel
    # "Events" y "RPC" de la LiveKit Agent Console).
    # ---------------------------------------------------------------

    @function_tool()
    async def get_server_time(self, context: RunContext) -> dict[str, str]:
        """Devuelve la fecha y hora actual del servidor en ISO 8601 y UTC.

        Úsala cuando el usuario pregunte la hora, fecha o cuánto tiempo falta
        para algo relativo al momento actual.
        """
        now = datetime.now(tz=timezone.utc)
        result = {
            "iso": now.isoformat(timespec="seconds"),
            "human": now.strftime("%d/%m/%Y %H:%M:%S UTC"),
        }
        logger.info("[tool:get_server_time] %s", result)
        return result

    @function_tool()
    async def get_voice_channel_info(self, context: RunContext) -> dict[str, Any]:
        """Devuelve información sobre el canal de voz actual.

        El nombre de sala en Mini-Discord sigue el patrón
        ``{serverId}:{channelId}``, así que lo descomponemos para que el
        agente pueda referirse a él de forma útil.
        """
        room = context.session.room  # type: ignore[attr-defined]
        room_name = getattr(room, "name", "") or ""
        server_id, _, channel_id = room_name.partition(":")
        humans = [
            {
                "identity": p.identity,
                "name": p.name or p.identity,
                "speaking": bool(getattr(p, "is_speaking", False)),
            }
            for p in room.remote_participants.values()
        ]
        info = {
            "room": room_name,
            "server_id": server_id or None,
            "channel_id": channel_id or None,
            "participants_count": len(humans),
            "participants": humans,
        }
        logger.info("[tool:get_voice_channel_info] %s", info)
        return info

    @function_tool()
    async def end_conversation(self, context: RunContext, reason: str = "") -> str:
        """Finaliza la conversación y desconecta al agente de la sala.

        Llámala cuando el usuario se despida ("adiós", "hasta luego",
        "cuelga", "sal del canal"...). Antes de cortar, el agente dará
        una despedida breve.
        """
        logger.info("[tool:end_conversation] reason=%s", reason or "(sin motivo)")
        await context.session.aclose()  # type: ignore[attr-defined]
        return "Conversación finalizada. ¡Hasta pronto!"


# -------------------------------------------------------------------
# Worker lifecycle
# -------------------------------------------------------------------


def prewarm(proc: JobProcess) -> None:
    """Se ejecuta una vez por subproceso antes de aceptar Jobs.

    Cargamos aquí los modelos pesados (Silero VAD) para compartirlos
    entre todos los Jobs de este proceso y reducir el cold start.
    """
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("Prewarm completado: Silero VAD cargado.")


async def entrypoint(ctx: JobContext) -> None:
    """Punto de entrada por cada Job (una sala) que el dispatcher envía."""

    # Añadimos campos que aparecerán en cada log de este Job (visibles
    # en la pestaña de logs de la Agent Console).
    ctx.log_context_fields = {
        "room": ctx.room.name,
        "job_id": ctx.job.id,
    }
    logger.info("Nuevo Job recibido para la sala %s", ctx.room.name)

    session = AgentSession(
        # OpenAI Realtime: speech-to-speech nativo, latencia mínima.
        # El VAD semántico del propio modelo ya maneja las interrupciones
        # del usuario (detiene el TTS al detectar habla entrante).
        llm=openai.realtime.RealtimeModel(
            model="gpt-realtime",
            voice="marin",
            temperature=0.7,
        ),
        # VAD local adicional: emite eventos de inicio/fin de voz hacia
        # la Agent Console (visibles en el panel "Audio" y "Events").
        vad=ctx.proc.userdata["vad"],
    )

    # -------------------------------------------------------------
    # Métricas en tiempo real (panel "Metrics" y "Usage" de la consola).
    # -------------------------------------------------------------
    usage_collector = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent) -> None:
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

    async def _log_usage_on_shutdown() -> None:
        summary = usage_collector.get_summary()
        logger.info("Resumen de uso final: %s", summary)

    ctx.add_shutdown_callback(_log_usage_on_shutdown)

    # -------------------------------------------------------------
    # Arranque de la sesión + supresión de ruido BVC (LiveKit Cloud).
    # -------------------------------------------------------------
    await session.start(
        agent=MiniDiscordAssistant(),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    await ctx.connect()

    # Saludo inicial proactivo.
    await session.generate_reply(
        instructions=(
            "Saluda brevemente en español, preséntate como el asistente de "
            "Mini-Discord y pregúntale al usuario en qué puede ayudarle."
        ),
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            # agent_name hace que el Worker sea "dispatcheable" de forma
            # explícita y aparezca con este nombre en la Agent Console.
            # Si prefieres que el agente se una automáticamente a CADA
            # sala creada, comenta esta línea.
            agent_name="mini-discord-agent",
        )
    )
