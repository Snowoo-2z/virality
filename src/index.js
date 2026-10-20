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

startDashboard();
startBot();
