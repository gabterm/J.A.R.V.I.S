export function renderReminders(items) {
  const remindersList = document.getElementById('remindersList');
  const remindersCount = document.getElementById('remindersCount');
  remindersList.innerHTML = '';
  const lista = items || [];
  if (lista.length === 0) {
    remindersList.innerHTML = '<div class="reminders-empty">nenhum lembrete ativo</div>';
    remindersCount.textContent = 0;
    return;
  }
  lista.forEach(item => {
    const div = document.createElement('div');
    div.className = 'reminder-item' + (item.concluido ? ' done' : '');
    div.innerHTML = `<div class="rd-dot"></div><div class="rd-body"><span class="rd-text">${item.texto}</span><span class="rd-time">${item.quando || ''}</span></div>`;
    remindersList.appendChild(div);
  });
  remindersCount.textContent = lista.filter(i => !i.concluido).length;
}
