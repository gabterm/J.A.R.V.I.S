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


def rotina_bom_dia():
    from tools.tools import get_weather, get_daily_news, list_reminders, list_alarms

    clima = get_weather()
    noticias = get_daily_news(limit=3)
    lembretes = list_reminders()
    alarmes = list_alarms()

    partes = ["Bom dia!"]

    if clima.get("success"):
        partes.append(
            f"Em {clima['local']} está {clima['temperatura']}°C, {clima['condicao']}."
        )

    if lembretes.get("success") and lembretes.get("count"):
        pendentes = [
            r["texto"] for r in lembretes.get("reminders", [])
            if not r.get("concluido")
        ]
        if pendentes:
            partes.append(
                f"Você tem {len(pendentes)} lembrete(s) pendente(s): "
                + "; ".join(pendentes[:5]) + "."
            )

    if alarmes.get("success") and alarmes.get("count"):
        partes.append(f"Você tem {alarmes['count']} alarme(s) ativo(s).")

    if noticias.get("success") and noticias.get("news"):
        titulos = [n["title"] for n in noticias["news"][:3]]
        partes.append("Principais notícias: " + "; ".join(titulos) + ".")

    resumo = " ".join(partes)

    speak(limpar_para_fala(resumo))
    ui_bridge.broadcast({"type": "log", "role": "jarvis", "text": resumo})
    enviar_push("☀️ Bom dia", resumo)

    return {"success": True, "message": resumo}


def rotina_boa_noite():
    from tools.tools import list_reminders

    lembretes = list_reminders()
    pendentes = []
    if lembretes.get("success"):
        pendentes = [
            r["texto"] for r in lembretes.get("reminders", [])
            if not r.get("concluido")
        ]

    if pendentes:
        resumo = (
            "Boa noite! Antes de dormir, você ainda tem pendente: "
            + "; ".join(pendentes[:5]) + "."
        )
    else:
        resumo = "Boa noite! Sem pendências pra amanhã. Durma bem."

    speak(limpar_para_fala(resumo))
    ui_bridge.broadcast({"type": "log", "role": "jarvis", "text": resumo})

    return {"success": True, "message": resumo}


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

    speak(limpar_para_fala(resumo))
    ui_bridge.broadcast({"type": "log", "role": "jarvis", "text": resumo})
    ui_bridge.broadcast({"type": "presence", "estado": "fora"})

    return {"success": True, "message": resumo}


def rotina_foco():
    resumo = "Modo foco ativado. Vou segurar avisos não urgentes até você desativar."
    ui_bridge.broadcast({"type": "focus_mode", "ativo": True})
    ui_bridge.broadcast({"type": "log", "role": "jarvis", "text": resumo})
    speak(limpar_para_fala(resumo))
    return {"success": True, "message": resumo}


def rotina_fim_foco():
    resumo = "Modo foco desativado."
    ui_bridge.broadcast({"type": "focus_mode", "ativo": False})
    ui_bridge.broadcast({"type": "log", "role": "jarvis", "text": resumo})
    speak(limpar_para_fala(resumo))
    return {"success": True, "message": resumo}


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
            "message": (
                f"Rotina desconhecida: '{nome}'. Disponíveis: "
                + ", ".join(ROTINAS.keys())
            ),
        }
    try:
        return funcao()
    except Exception as error:
        return {"success": False, "message": f"Falha ao executar a rotina: {error}"}


_HORARIOS_AGENDADOS = {
    "bom_dia": (7, 30),
    "boa_noite": (23, 0),
}

_INTERVALO_CHECAGEM_SEGUNDOS = 30


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

                for nome_rotina, (hora, minuto) in _HORARIOS_AGENDADOS.items():
                    horario_alvo = agora.replace(
                        hour=hora, minute=minuto, second=0, microsecond=0
                    )

                    ja_passou = agora >= horario_alvo
                    ja_rodou = _ja_rodou_hoje(state, nome_rotina, hoje_iso)

                    if ja_passou and not ja_rodou:
                        _marcar_rodou_hoje(state, nome_rotina, hoje_iso)
                        threading.Thread(
                            target=run_routine,
                            args=(nome_rotina,),
                            daemon=True,
                        ).start()

        except Exception as error:
            print(f"⚠️  Erro no scheduler proativo: {error}")

        time.sleep(_INTERVALO_CHECAGEM_SEGUNDOS)


_scheduler_started = False


def iniciar_scheduler():
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    threading.Thread(target=_loop_scheduler, daemon=True).start()