import json
import os
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import tools.ui_bridge as ui_bridge
from tools.voice import speak, limpar_para_fala
from tools.push import enviar_push

STATE_PATH = os.path.expanduser("~/.jarvis/proactive_state.json")
TIMEZONE = "America/Sao_Paulo"

HORARIOS_AGENDADOS = {
    "bom_dia": (7, 30),
    "boa_noite": (23, 0),
}
INTERVALO_CHECAGEM_SEGUNDOS = 30

_lock = threading.Lock()


def _load_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return {}


def _save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w", encoding="utf-8") as file:
        json.dump(state, file, ensure_ascii=False, indent=2)


def _anunciar(resumo, eventos_extra=None):
    """Fala o resumo, loga no HUD e opcionalmente manda eventos extra de UI."""
    speak(limpar_para_fala(resumo))
    ui_bridge.broadcast({"type": "log", "role": "jarvis", "text": resumo})
    for evento in eventos_extra or []:
        ui_bridge.broadcast(evento)
    return {"success": True, "message": resumo}


def _pendentes_lembretes(limite=5):
    from tools.tools import list_reminders

    lembretes = list_reminders()
    if not lembretes.get("success"):
        return []
    return [
        r["texto"] for r in lembretes.get("reminders", [])
        if not r.get("concluido")
    ][:limite]

def rotina_bom_dia():
    from tools.tools import get_weather, get_daily_news, list_alarms

    clima = get_weather()
    noticias = get_daily_news(limit=3)
    alarmes = list_alarms()
    pendentes = _pendentes_lembretes()

    partes = ["Bom dia, senhor."]

    if clima.get("success"):
        partes.append(
            f"Por aqui, senhor, {clima['temperatura']}°C e "
            f"{clima['condicao'].lower()}."
        )

    if pendentes:
        if len(pendentes) == 1:
            partes.append(
                f"Ah, senhor, ficou uma coisa pendente: {pendentes[0]}."
            )
        else:
            partes.append(
                f"Ah, senhor, ficaram algumas coisas pendentes: "
                + "; ".join(pendentes)
                + "."
            )

    if alarmes.get("success") and alarmes.get("count"):
        quantidade = alarmes["count"]

        if quantidade == 1:
            partes.append("Seu alarme continua programado, senhor.")
        else:
            partes.append(
                f"O senhor está com {quantidade} alarmes programados."
            )

    if noticias.get("success") and noticias.get("news"):
        titulos = [n["title"] for n in noticias["news"][:3]]

        partes.append(
            "Também separei algumas notícias para o senhor: "
            + "; ".join(titulos)
            + "."
        )

    resultado = _anunciar(" ".join(partes))

    enviar_push(
        "☀️ Bom dia",
        resultado["message"]
    )

    return resultado


def rotina_boa_noite():
    pendentes = _pendentes_lembretes()

    if pendentes:
        if len(pendentes) == 1:
            resumo = (
                f"Senhor, antes de encerrar o dia, "
                f"só ficou uma coisa pendente: {pendentes[0]}."
            )
        else:
            resumo = (
                "Senhor, antes de encerrar o dia, "
                "ainda ficaram algumas coisas pendentes: "
                + "; ".join(pendentes)
                + "."
            )
    else:
        resumo = "Senhor, por aqui está tudo certo. Boa noite."

    return _anunciar(resumo)

def rotina_saindo_de_casa():
    from tools.tools import get_weather

    clima = get_weather()
    aviso_clima = ""
    if clima.get("success"):
        aviso_clima = f" Lá fora está {clima['temperatura']}°C, {clima['condicao']}."

    resumo = (
        "Saindo de casa. Vou continuar de olho no WhatsApp e te aviso "
        "por notificação se precisar." + aviso_clima
    )
    return _anunciar(resumo, eventos_extra=[{"type": "presence", "estado": "fora"}])


def rotina_foco():
    resumo = "Modo foco ativado. Vou segurar avisos não urgentes até você desativar."
    return _anunciar(resumo, eventos_extra=[{"type": "focus_mode", "ativo": True}])


def rotina_fim_foco():
    resumo = "Modo foco desativado."
    return _anunciar(resumo, eventos_extra=[{"type": "focus_mode", "ativo": False}])


ROTINAS = {
    "bom_dia": rotina_bom_dia,
    "boa_noite": rotina_boa_noite,
    "saindo_de_casa": rotina_saindo_de_casa,
    "foco": rotina_foco,
    "fim_foco": rotina_fim_foco,
}


def run_routine(nome: str):
    funcao = ROTINAS.get(nome)
    if not funcao:
        return {
            "success": False,
            "message": f"Rotina desconhecida: '{nome}'. Disponíveis: " + ", ".join(ROTINAS.keys()),
        }
    try:
        return funcao()
    except Exception as error:
        print(f"⚠️  Erro na rotina '{nome}': {error}")
        return {"success": False, "message": f"Falha ao executar a rotina: {error}"}


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

def _ja_rodou_hoje(state, nome_rotina, hoje_iso):
    return state.get(nome_rotina) == hoje_iso


def _marcar_rodou_hoje(state, nome_rotina, hoje_iso):
    state[nome_rotina] = hoje_iso
    _save_state(state)


def _loop_scheduler():
    while True:
        try:
            agora = datetime.now(ZoneInfo(TIMEZONE))
            hoje_iso = agora.date().isoformat()

            with _lock:
                state = _load_state()
                for nome_rotina, (hora, minuto) in HORARIOS_AGENDADOS.items():
                    horario_alvo = agora.replace(hour=hora, minute=minuto, second=0, microsecond=0)
                    ja_passou = agora >= horario_alvo
                    ja_rodou = _ja_rodou_hoje(state, nome_rotina, hoje_iso)

                    if ja_passou and not ja_rodou:
                        _marcar_rodou_hoje(state, nome_rotina, hoje_iso)
                        threading.Thread(target=run_routine, args=(nome_rotina,), daemon=True).start()

        except Exception as error:
            print(f"⚠️  Erro no scheduler proativo: {error}")

        time.sleep(INTERVALO_CHECAGEM_SEGUNDOS)


_scheduler_started = False


def iniciar_scheduler():
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    threading.Thread(target=_loop_scheduler, daemon=True).start()