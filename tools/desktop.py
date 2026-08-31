"""
Ponto de entrada para rodar o JARVIS como app nativo (janela própria),
em vez de aba de navegador comum.

Continua usando o mesmo servidor FastAPI/uvicorn (via ui_bridge) e o mesmo
loop de conversa (main.main()) — só troca "abrir no Chrome" por uma janela
Qt que hospeda o HUD, e adiciona um segundo QWebEngineView posicionado
por cima do painel .browser-panel do HUD, pra funcionar como um
"mini-navegador real" embutido no layout.

Uso:
    python desktop.py
(em vez de `python main.py`)
"""

import sys
import threading

from PySide6.QtCore import QObject, Slot, QUrl, QRect
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMainWindow, QWidget

import main as jarvis_main
import tools.ui_bridge as ui_bridge

HUD_URL = f"http://{ui_bridge.HOST}:{ui_bridge.PORT}/"


class Bridge(QObject):
    """
    Objeto exposto ao JS do HUD via QWebChannel (window.bridge no
    front-end). Dois papéis:
      1. report_panel_rect: o JS chama isso sempre que a área do painel
         .browser-panel muda (troca de aba, resize, etc.) — nós
         reposicionamos/mostramos/escondemos o QWebEngineView de overlay.
      2. navigate: o JS chama isso quando recebe um evento
         'browser_navigate' via WebSocket (disparado pelas tools
         search_web / play_music / browse_url no backend).
    """

    def __init__(self, overlay_view: QWebEngineView):
        super().__init__()
        self._overlay = overlay_view

    @Slot(float, float, float, float, bool)
    def report_panel_rect(self, x, y, w, h, visible):
        if not visible or w <= 0 or h <= 0:
            self._overlay.hide()
            return
        self._overlay.setGeometry(QRect(int(x), int(y), int(w), int(h)))
        self._overlay.show()
        self._overlay.raise_()

    @Slot(str)
    def navigate(self, url):
        self._overlay.setUrl(QUrl(url))


def build_window():
    window = QMainWindow()
    window.setWindowTitle("J.A.R.V.I.S")
    window.resize(1440, 900)

    container = QWidget()
    window.setCentralWidget(container)

    # view principal: o HUD inteiro (index.html + main.js + style.css),
    # sem nenhuma mudança — é o mesmo servidor que já existe hoje.
    hud_view = QWebEngineView(container)
    hud_view.setGeometry(0, 0, window.width(), window.height())
    hud_view.load(QUrl(HUD_URL))

    # view de overlay: começa escondida, é posicionada por cima da área
    # do painel .browser-panel via Bridge.report_panel_rect (chamado
    # pelo JS). É um QWebEngineView "de verdade" — carrega páginas reais.
    browser_view = QWebEngineView(container)
    browser_view.hide()

    bridge = Bridge(browser_view)
    channel = QWebChannel()
    channel.registerObject("bridge", bridge)
    hud_view.page().setWebChannel(channel)

    # mantém a hud_view preenchendo a janela ao redimensionar
    original_resize = container.resizeEvent

    def resizeEvent(event):
        hud_view.setGeometry(0, 0, container.width(), container.height())
        if original_resize:
            original_resize(event)

    container.resizeEvent = resizeEvent

    window._hud_view = hud_view
    window._browser_view = browser_view
    window._bridge = bridge
    window._channel = channel

    return window


def main():
    threading.Thread(target=jarvis_main.main, daemon=True).start()

    app = QApplication(sys.argv)
    window = build_window()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()