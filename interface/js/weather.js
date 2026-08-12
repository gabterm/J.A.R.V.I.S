/* ================= painel de clima ================= */
import { addEvent } from './events-feed.js';

const WEATHER_ICONS = {
  ceu_limpo: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>',
  nublado: '<path d="M17.5 19H9a5 5 0 1 1 1.6-9.7A6 6 0 0 1 22 12.5 4.5 4.5 0 0 1 17.5 19z"/>',
  chuva: '<path d="M16 13H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20.5 6.5 4.5 4.5 0 0 1 16 13z"/><line x1="8" y1="16" x2="8" y2="21"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="16" y1="16" x2="16" y2="21"/>',
  tempestade: '<path d="M16 13H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20.5 6.5 4.5 4.5 0 0 1 16 13z"/><polyline points="11 16 8 21 12 21 10 24"/>',
  neve: '<path d="M16 13H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20.5 6.5 4.5 4.5 0 0 1 16 13z"/><line x1="8" y1="17" x2="8" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="16" y1="17" x2="16" y2="21"/>',
  neblina: '<line x1="3" y1="8" x2="21" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/>'
};

export function renderWeather(dados) {
  const weatherEmpty = document.getElementById('weatherEmpty');
  const weatherBody = document.getElementById('weatherBody');
  const weatherIcon = document.getElementById('weatherIcon');
  const minimalWeatherIcon = document.getElementById('minimalWeatherIcon');
  const minimalWeatherValue = document.getElementById('minimalWeatherValue');

  weatherEmpty.style.display = 'none';
  weatherBody.style.display = 'block';
  document.getElementById('weatherTemp').innerHTML = `${Math.round(dados.temp)}<span>°C</span>`;
  document.getElementById('weatherCond').textContent = dados.condicao || '—';
  document.getElementById('weatherFeels').textContent = (dados.sensacao !== undefined ? Math.round(dados.sensacao) : '--') + '°';
  document.getElementById('weatherHumidity').textContent = (dados.umidade !== undefined ? dados.umidade : '--') + '%';
  document.getElementById('weatherWind').textContent = (dados.vento !== undefined ? dados.vento : '--') + ' km/h';
  document.getElementById('weatherMinMax').textContent = `${dados.min !== undefined ? Math.round(dados.min) : '--'}/${dados.max !== undefined ? Math.round(dados.max) : '--'}°`;
  document.getElementById('weatherLoc').textContent = dados.local || '—';
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('weatherUpdated').textContent = hora;
  const iconMarkup = WEATHER_ICONS[dados.icone] || WEATHER_ICONS.ceu_limpo;
  weatherIcon.innerHTML = iconMarkup;
  minimalWeatherIcon.innerHTML = iconMarkup;
  minimalWeatherValue.textContent = Math.round(dados.temp) + '°';
  addEvent('clima', 'Dados do clima atualizados');
}
