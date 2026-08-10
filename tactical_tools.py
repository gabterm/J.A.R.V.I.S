"""
Ferramenta de quadro tático de futebol para o JARVIS.

Este módulo não sabe nada sobre chat/LLM: ele só define a tool (spec no
formato OpenAI function-calling) e a função Python que ela executa, que
manda o evento pronto para a UI via ui_bridge.

Como você já tem um módulo de tools separado (com TOOLS e TOOL_FUNCTIONS),
o jeito mais simples de integrar é:

  1. Copiar TACTICAL_BOARD_TOOL e mostrar_quadro_tatico para dentro do seu
     tools.py existente (junto com as outras tools), OU
  2. Deixar este arquivo como está e, no seu tools.py, fazer:

         from tactical_tools import TACTICAL_BOARD_TOOL, mostrar_quadro_tatico

     e então incluir TACTICAL_BOARD_TOOL na lista TOOLS e registrar
     "mostrar_quadro_tatico" em TOOL_FUNCTIONS (ver trecho para main.py).
"""

import ui_bridge


TACTICAL_BOARD_TOOL = {
    "type": "function",
    "function": {
        "name": "mostrar_quadro_tatico",
        "description": (
            "Exibe um quadro tático de futebol na interface: jogadores, bola e "
            "setas sobre um campo. Aceita uma sequência de 1 ou mais quadros "
            "para simular uma jogada se desenrolando no tempo — cada quadro é "
            "um instante, e a UI anima a transição entre eles. Use coordenadas "
            "x e y de 0 a 100 (percentual do campo; x=0 é o gol do time da "
            "casa, x=100 é o gol do visitante; y=0 é a lateral de cima, "
            "y=100 é a lateral de baixo). Para jogadas com movimento, gere "
            "de 3 a 6 quadros — o suficiente para transmitir a ideia sem "
            "ficar repetitivo."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "titulo": {
                    "type": "string",
                    "description": "Título curto da situação tática",
                },
                "formacao_casa": {"type": "string"},
                "formacao_visitante": {"type": "string"},
                "quadros": {
                    "type": "array",
                    "minItems": 1,
                    "description": "Sequência de instantes da jogada, em ordem cronológica",
                    "items": {
                        "type": "object",
                        "required": ["jogadores"],
                        "properties": {
                            "anotacao": {
                                "type": "string",
                                "description": "O que acontece neste instante (explicação tática curta)",
                            },
                            "jogadores": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "required": ["time", "num", "x", "y"],
                                    "properties": {
                                        "time": {
                                            "type": "string",
                                            "enum": ["casa", "visitante"],
                                        },
                                        "num": {"type": "integer"},
                                        "x": {"type": "number"},
                                        "y": {"type": "number"},
                                        "papel": {
                                            "type": "string",
                                            "description": "Ex: GOL, ZAG, LE, LD, VOL, MEI, PE, PD, ATA",
                                        },
                                    },
                                },
                            },
                            "bola": {
                                "type": "object",
                                "properties": {
                                    "x": {"type": "number"},
                                    "y": {"type": "number"},
                                },
                            },
                            "setas": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "required": ["de", "para"],
                                    "properties": {
                                        "de": {
                                            "type": "object",
                                            "properties": {
                                                "x": {"type": "number"},
                                                "y": {"type": "number"},
                                            },
                                        },
                                        "para": {
                                            "type": "object",
                                            "properties": {
                                                "x": {"type": "number"},
                                                "y": {"type": "number"},
                                            },
                                        },
                                        "tipo": {
                                            "type": "string",
                                            "enum": ["passe", "corrida", "chute", "marcacao"],
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "required": ["titulo", "quadros"],
        },
    },
}


def _validar_coordenada(valor, campo):
    if not isinstance(valor, (int, float)):
        return f"Coordenada '{campo}' inválida: {valor!r}"
    if not (0 <= valor <= 100):
        return f"Coordenada '{campo}' fora do intervalo 0-100: {valor}"
    return None


def _validar_quadro(quadro, indice):
    jogadores = quadro.get("jogadores")

    if not jogadores:
        return f"Quadro {indice + 1} sem jogadores."

    for jogador in jogadores:
        for campo in ("x", "y"):
            erro = _validar_coordenada(jogador.get(campo), f"jogador {jogador.get('num')}.{campo}")
            if erro:
                return f"Quadro {indice + 1}: {erro}"

    bola = quadro.get("bola")
    if bola:
        for campo in ("x", "y"):
            erro = _validar_coordenada(bola.get(campo), f"bola.{campo}")
            if erro:
                return f"Quadro {indice + 1}: {erro}"

    return None


def mostrar_quadro_tatico(titulo, quadros, formacao_casa=None, formacao_visitante=None):
    """
    Valida o payload de um quadro tático e envia para a UI via WebSocket.

    Espelha o padrão já usado por outras tools do JARVIS: retorna um dict
    {"success": bool, "message": str} que vai direto pro histórico da
    conversa como resultado da tool call.
    """

    if not quadros:
        return {"success": False, "message": "Nenhum quadro fornecido."}

    for indice, quadro in enumerate(quadros):
        erro = _validar_quadro(quadro, indice)
        if erro:
            return {"success": False, "message": erro}

    ui_bridge.broadcast({
        "type": "tactical_board",
        "titulo": titulo,
        "formacao_casa": formacao_casa,
        "formacao_visitante": formacao_visitante,
        "quadros": quadros,
    })

    return {
        "success": True,
        "message": f"Quadro tático '{titulo}' exibido com {len(quadros)} instante(s).",
    }