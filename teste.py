# ============================================================
# COMO INTEGRAR NO tools.py
# ============================================================
# Existem 3 blocos abaixo. Cole cada um no lugar indicado.
#   BLOCO 1 -> logo depois da função show_reasoning_board (antes de "TOOLS = [")
#   BLOCO 2 -> dentro da lista TOOLS, logo depois do dict do show_reasoning_board
#              (antes do "]" que fecha a lista TOOLS)
#   BLOCO 3 -> dentro do dict TOOL_FUNCTIONS, uma linha
# ============================================================


# ============================================================
# BLOCO 1 — cole antes de "TOOLS = ["
# ============================================================

# ============================================================
# SIMULAÇÃO VISUAL (show_simulation)
# ============================================================
#
# Generaliza o quadro de raciocínio: em vez de nós/conexões, os
# "objetos" aqui são formas livres (círculo, retângulo, texto, linha,
# onda) numa cena 0-100 x 0-100. Dois modos:
#
#   modo="fisica": os objetos podem ter um `movimento` (fórmula:
#   projétil, pêndulo, órbita, MHS, mola, onda, linear). O backend manda
#   UMA cena só (`simulation_scene`) e o NAVEGADOR calcula a posição a
#   cada frame sozinho — a animação roda em tempo real e continuamente,
#   sem depender de mais mensagens do backend. A `anotacao` (opcional)
#   é narrada uma vez, em paralelo à animação rodando.
#
#   modo="cenas": igual ao quadro de raciocínio — cada "quadro" é o
#   estado completo (objetos sem `movimento`, estáticos) daquele
#   instante, narrado em sequência e bloqueante, pra diagramas/passos
#   livres (reação química, algoritmo, etc.).

_TIPOS_OBJETO_SIMULACAO = {"circulo", "retangulo", "texto", "linha", "onda"}
_TIPOS_MOVIMENTO_SIMULACAO = {
    "projetil", "linear", "mhs", "pendulo", "orbital", "mola", "onda",
}


def _validar_objeto_simulacao(obj, contexto):
    if not obj.get("id"):
        return f"{contexto}: objeto sem 'id'."

    tipo = obj.get("tipo")
    if tipo not in _TIPOS_OBJETO_SIMULACAO:
        return f"{contexto}: tipo de objeto inválido '{tipo}' (id={obj.get('id')})."

    # linha usa x1/y1/x2/y2 em vez de x/y; onda pode não ter x/y próprio
    # (a posição vem inteira dos params do movimento) — por isso x/y só
    # são validados quando presentes, não são sempre obrigatórios aqui.
    for campo in ("x", "y", "x1", "y1", "x2", "y2"):
        valor = obj.get(campo)
        if valor is not None:
            erro = _validate_coordinate(valor, f"{obj.get('id')}.{campo}")
            if erro:
                return f"{contexto}: {erro}"

    movimento = obj.get("movimento")
    if movimento:
        tipo_mov = movimento.get("tipo")
        if tipo_mov not in _TIPOS_MOVIMENTO_SIMULACAO:
            return (
                f"{contexto}: tipo de movimento inválido '{tipo_mov}' "
                f"no objeto '{obj.get('id')}'."
            )

    return None


def _validar_cena_fisica_simulacao(objetos):
    if not objetos:
        return "Nenhum objeto fornecido para a simulação."
    for obj in objetos:
        erro = _validar_objeto_simulacao(obj, "Simulação")
        if erro:
            return erro
    return None


def _validar_quadro_simulacao(frame, index):
    objetos = frame.get("objetos")
    if not objetos:
        return f"Quadro {index + 1} sem objetos."
    for obj in objetos:
        erro = _validar_objeto_simulacao(obj, f"Quadro {index + 1}")
        if erro:
            return erro
    return None


# Mesma lógica das outras pausas: sem isso, um quadro sem anotação
# pularia instantaneamente na animação.
_PAUSA_QUADRO_SIMULACAO_SEM_NARRACAO = 1.0


def _narrar_quadros_simulacao(quadros):
    """
    Espelha _narrar_quadros_raciocinio: manda o estado completo de cada
    quadro ('simulation_frame') e fala a anotação de forma bloqueante,
    então a animação avança exatamente no ritmo da narração. Usado só
    no modo="cenas".
    """
    for index, frame in enumerate(quadros):
        anotacao = frame.get("anotacao") or ""

        ui_bridge.broadcast({
            "type": "simulation_frame",
            "index": index,
            "anotacao": anotacao,
            "objetos": frame.get("objetos", []),
        })

        if anotacao.strip():
            speak(limpar_para_fala(anotacao))
        else:
            time.sleep(_PAUSA_QUADRO_SIMULACAO_SEM_NARRACAO)


def show_simulation(
    titulo: str,
    objetos: list,
    modo: str = "fisica",
    duracao: float = 8,
    loop: bool = True,
    velocidade: float = 1,
    anotacao: str = "",
):
    modo = modo if modo in ("fisica", "cenas") else "fisica"

    if modo == "fisica":
        erro = _validar_cena_fisica_simulacao(objetos)
        if erro:
            return {"success": False, "message": erro}
    else:
        if not objetos:
            return {"success": False, "message": "Nenhum quadro fornecido."}
        for index, frame in enumerate(objetos):
            erro = _validar_quadro_simulacao(frame, index)
            if erro:
                return {"success": False, "message": erro}

    try:
        ui_bridge.broadcast({"type": "simulation_board", "titulo": titulo})

        if modo == "fisica":
            # Uma mensagem só — o navegador anima sozinho, continuamente,
            # sem o backend precisar reenviar frames.
            ui_bridge.broadcast({
                "type": "simulation_scene",
                "objetos": objetos,
                "duracao": duracao,
                "loop": loop,
                "velocidade": velocidade,
                "anotacao": anotacao,
            })

            if anotacao.strip():
                speak(limpar_para_fala(anotacao))

            return {
                "success": True,
                "message": (
                    f"Simulação '{titulo}' iniciada e está rodando "
                    "continuamente na interface. Não descreva a "
                    "animação passo a passo na resposta final — ela já "
                    "está visível e rodando, só complemente com "
                    "contexto se fizer sentido."
                ),
            }

        _narrar_quadros_simulacao(objetos)

        return {
            "success": True,
            "message": (
                f"Simulação '{titulo}' narrada com {len(objetos)} "
                "passo(s). Não repita a explicação passo a passo na "
                "resposta final, ela já foi narrada — só complemente "
                "se fizer sentido."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível exibir a simulação: {error}",
        }


# ============================================================
# BLOCO 2 — cole dentro da lista TOOLS, logo após o dict de
# "show_reasoning_board" (antes do "]" que fecha TOOLS)
# ============================================================

    {
        "type": "function",
        "function": {
            "name": "show_simulation",
            "description": (
                "Exibe uma simulação visual/animação científica ou "
                "genérica na interface — círculos, retângulos, texto, "
                "linhas e ondas se movendo numa cena. Use para qualquer "
                "pedido de 'mostrar', 'simular', 'animar' ou 'visualizar' "
                "um fenômeno físico (queda livre, lançamento de "
                "projétil, pêndulo, órbita, oscilação, onda, mola, "
                "movimento uniforme) ou uma sequência visual livre "
                "passo a passo. NÃO use para raciocínio abstrato "
                "(ideias/argumentos) — para isso use show_reasoning_board. "
                "NÃO use para futebol em campo — para isso use "
                "show_tactical_board.\n\n"
                "Tem dois modos, escolhidos em 'modo':\n\n"
                "1) modo='fisica' (padrão, prefira este pra qualquer "
                "fenômeno com fórmula conhecida): 'objetos' é uma lista "
                "PLANA de objetos da cena. O navegador calcula a posição "
                "de cada objeto continuamente sozinho a partir do campo "
                "'movimento' — você NÃO precisa (nem deve) gerar frame a "
                "frame. Cada objeto pode ter:\n"
                "  - id (string, obrigatório, único)\n"
                "  - tipo: 'circulo' | 'retangulo' | 'texto' | 'linha' | 'onda'\n"
                "  - x, y: posição inicial/estática (0-100), quando aplicável\n"
                "  - raio (circulo), largura/altura (retangulo), rotulo (texto), "
                "x1,y1,x2,y2 (linha)\n"
                "  - cor: opcional, ex 'var(--amber)'\n"
                "  - rastro: true pra desenhar a trajetória percorrida\n"
                "  - movimento: { tipo, params } — os tipos disponíveis e "
                "seus params são:\n"
                "      projetil: {x0,y0,v0,angulo(graus),g} — lançamento "
                "oblíquo/queda livre (angulo=-90 = queda livre)\n"
                "      linear: {x0,y0,vx,vy,quicar(bool),min,max} — "
                "movimento retilíneo, opcionalmente quicando nas bordas\n"
                "      mhs: {x0,y0,amplitude,periodo,fase,eixo('x'|'y')} — "
                "oscilação harmônica simples\n"
                "      pendulo: {pivoX,pivoY,comprimento,amplitude(graus),"
                "periodo,fase}\n"
                "      orbital: {cx,cy,raio,periodo,fase} — órbita circular\n"
                "      mola: {x0,y0,amplitude,periodo,amortecimento,eixo} — "
                "oscilador amortecido\n"
                "      onda: {x_inicio,x_fim,y_base,amplitude,"
                "comprimento_onda,periodo,n_pontos} — use com objeto "
                "tipo='onda'\n"
                "Coordenadas e todos os params espaciais são num espaço "
                "normalizado 0-100. 'anotacao' (opcional) é falada uma "
                "vez, junto da animação começando. 'duracao' (segundos) "
                "e 'loop' controlam se a animação se repete.\n\n"
                "2) modo='cenas': 'objetos' é uma lista de QUADROS "
                "narrados em sequência — cada quadro é "
                "{'anotacao': str, 'objetos': [...]} com o estado "
                "completo (objetos SEM 'movimento', estáticos) daquele "
                "instante. Use isso só quando o fenômeno não se encaixa "
                "numa fórmula contínua (ex: passos de uma reação "
                "química, etapas de um algoritmo) — esta ferramenta já "
                "narra cada quadro em voz alta, em sincronia com a "
                "animação avançando, igual show_reasoning_board."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "titulo": {
                        "type": "string",
                        "description": "Título curto da simulação.",
                    },
                    "modo": {
                        "type": "string",
                        "enum": ["fisica", "cenas"],
                        "description": (
                            "'fisica' (padrão) pra fenômenos com fórmula "
                            "de movimento; 'cenas' pra sequência narrada "
                            "de quadros estáticos livres."
                        ),
                    },
                    "objetos": {
                        "type": "array",
                        "description": (
                            "Se modo='fisica': lista plana de objetos da "
                            "cena (ver descrição da ferramenta). Se "
                            "modo='cenas': lista de quadros, cada um "
                            "{'anotacao': str, 'objetos': [...]}."
                        ),
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                        },
                    },
                    "duracao": {
                        "type": "number",
                        "description": (
                            "Duração de um ciclo da animação em "
                            "segundos. Só usado em modo='fisica'. "
                            "Padrão: 8."
                        ),
                    },
                    "loop": {
                        "type": "boolean",
                        "description": (
                            "Se a animação repete em loop. Só usado em "
                            "modo='fisica'. Padrão: true."
                        ),
                    },
                    "velocidade": {
                        "type": "number",
                        "description": (
                            "Multiplicador de velocidade da animação "
                            "(1 = tempo real). Só usado em modo='fisica'. "
                            "Padrão: 1."
                        ),
                    },
                    "anotacao": {
                        "type": "string",
                        "description": (
                            "Texto falado uma vez, junto do início da "
                            "animação. Só usado em modo='fisica' — em "
                            "modo='cenas' cada quadro tem sua própria "
                            "anotação."
                        ),
                    },
                },
                "required": ["titulo", "objetos"],
                "additionalProperties": False,
            },
        },
    },


# ============================================================
# BLOCO 3 — cole dentro de TOOL_FUNCTIONS (uma linha, em
# qualquer posição, sugiro logo após "show_reasoning_board")
# ============================================================

    "show_simulation": show_simulation,