import type { CapacitorConfig } from '@capacitor/cli';

// JARVIS_LAN=1 no `cap sync` libera ws:// para testar com o servidor na rede local (sem HTTPS).
const lan = process.env.JARVIS_LAN === '1';

const config: CapacitorConfig = {
  appId: 'io.github.gabterm.jarvis',
  appName: 'JARVIS',
  webDir: 'dist',
  backgroundColor: '#040c11',
  server: lan ? { androidScheme: 'http', cleartext: true } : { androidScheme: 'https' },
};

export default config;
