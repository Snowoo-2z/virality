'use strict';
/**
 * Point de démarrage du bot Virality.
 * Une seule commande lance TOUT : le bot discord + le dashboard web.
 *   npm start
 */
require('dotenv').config();

const { startDashboard } = require('./dashboard');
const { startBot } = require('./bot');

console.log('');
console.log('==============================================');
console.log('   🔥  VIRALITY BOT  🔥');
console.log('==============================================');
console.log('Démarrage en cours...');

// Filet de sécurité : on affiche les erreurs proprement sans tout planter
process.on('unhandledRejection', (err) => {
  console.error('⚠️  Erreur inattendue (le bot continue de tourner) :', err?.message || err);
});

// Si aucune config locale n'existe (nouveau PC...) mais que Supabase est
// configuré dans le .env, on récupère la copie sauvegardée là-bas.
async function bootstrap() {
  try {
    const supabase = require('./supabase');
    const { hasLocalConfig, replaceConfig } = require('./config');
    if (supabase.isConfigured()) {
      console.log('☁️  Supabase : sauvegarde cloud activée (miroir de la configuration).');
      if (!hasLocalConfig()) {
        console.log('☁️  Aucune configuration locale trouvée : je regarde sur Supabase...');
        // Sur Render, le dashboard doit répondre vite au contrôle de santé :
        // si Supabase met plus de 10 secondes, on démarre sans attendre.
        const remote = await Promise.race([
          supabase.fetchConfig(),
          new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
        ]);
        if (remote) {
          replaceConfig(remote);
          console.log('☁️  ✅ Configuration récupérée depuis Supabase !');
        } else {
          console.log('☁️  Rien sur Supabase pour le moment : démarrage avec les réglages par défaut.');
        }
      }
    }
  } catch (err) {
    console.warn('⚠️  Supabase ignoré au démarrage :', err?.message || err);
  }

  startDashboard();
  startBot();
}

bootstrap();
