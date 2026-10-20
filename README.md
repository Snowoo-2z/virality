# 🔥 Virality Bot

Le bot discord officiel du serveur **Virality**. Pour le moment, il gère un **système de bienvenue entièrement configurable**, de 2 façons :

- 🖥️ **Dashboard web** (page dans ton navigateur, protégée par mot de passe) avec aperçu en direct du message
- 💬 **Commande `/config`** directement dans discord (boutons + menus, réservée aux administrateurs)

Le bot ne fonctionne **que sur le serveur Virality** (`1562033502612885534`) : si quelqu'un essaie de l'ajouter ailleurs, il quitte le serveur tout seul.

### Ce que le système de bienvenue sait faire

- Message dans un salon au choix, au format **embed** (encadré coloré) ou **texte simple**
- Titre, description, petit texte du bas (footer), **couleur** libre
- Grande image : **bannière Virality** incluse, aucune, ou ton image par lien URL
- Miniature : avatar du nouveau membre, logo Virality, ou aucune
- Mention du nouveau membre (notification) activable
- **Message privé** de bienvenue en option (lui aussi personnalisable)
- **Rôle automatique** donné à l'arrivée (avec délai optionnel)
- Variables automatiques dans les textes : `{user}` `{username}` `{server}` `{memberCount}`
- Bouton **« Envoyer un test »** pour voir le résultat sans attendre un vrai nouveau membre

---

## 🚀 Installation pas à pas (première fois uniquement)

### Étape 1 — Installer Node.js

C'est le programme qui fait tourner le bot. Télécharge la version **LTS** ici : <https://nodejs.org/fr>
Installe-la comme n'importe quel logiciel (suivant, suivant, terminer).

### Étape 2 — Créer le bot sur le site de discord et récup le token

1. Va sur <https://discord.com/developers/applications> et connecte-toi
2. Bouton **« New Application »** → nomme-la par exemple `Virality` → **Create**
3. Dans le menu de gauche : **Bot**
4. ⚠️ **TRÈS IMPORTANT** : descends jusqu'à « Privileged Gateway Intents » et **active « SERVER MEMBERS INTENT »** (sinon le bot ne verra pas les nouveaux membres arriver), puis **Save Changes**
5. En haut de cette même page Bot : **« Reset Token »** → confirme → **copie le token** qui s'affiche (c'est le mot de passe du bot, garde-le secret !)
6. (Optionnel mais joli) Sur la page **General Information**, mets le logo Virality comme icône, et sur la page **Bot** tu peux aussi mettre un avatar / une bannière au bot.

### Étape 3 — Mettre le token dans le fichier `.env`

1. Dans le dossier du projet, fais une **copie** du fichier `.env.example` et renomme la copie en **`.env`** (juste `.env`)
2. Ouvre `.env` avec le Bloc-notes et remplace :
   - `DISCORD_TOKEN=colle_ton_token_ici` → colle ton token de l'étape 2
   - `DASHBOARD_PASSWORD=choisis_un_mot_de_passe` → choisis le mot de passe que tu veux pour le dashboard
3. Enregistre et ferme. (Le reste est déjà rempli, ne touche pas à `GUILD_ID`.)

> 🤐 **Ne partage jamais ton fichier `.env` ni ton token.** Quelqu'un qui a le token contrôle ton bot.

### Étape 4 — Lancer le bot

- **Windows** : double-clique sur **`DEMARRER.bat`** (il installe ce qu'il faut la première fois, puis lance tout)
- **Mac / Linux** : ouvre un terminal dans le dossier et lance `./demarrer.sh`
- **À la main** (terminal) : `npm install` (1ère fois) puis `npm start`

Une fenêtre noire s'ouvre : c'est le bot qui tourne. **Laisse-la ouverte** tant que tu veux que le bot soit en ligne. Tu devrais voir `✅ Bot connecté sur discord`.

### Étape 5 — Inviter le bot sur le serveur (1ère fois)

Si le bot n'est pas encore sur le serveur, la fenêtre noire affiche un **lien d'invitation** : clique dessus, choisis le serveur Virality, valide.
Le lien est aussi affiché en haut du dashboard web (étape 6).

### Étape 6 — Configurer

**Option A — Dashboard web (recommandé)**
1. Ouvre ton navigateur sur <http://localhost:3000>
2. Connecte-toi avec ton mot de passe (celui du `.env`)
3. Choisis le **salon de bienvenue**, écris tes textes en regardant l'**aperçu en direct** à droite
4. Clique **« 💾 Enregistrer »**, puis **« 📨 Envoyer un test »** pour vérifier sur discord

**Option B — Dans discord**
Tape `/config` dans n'importe quel salon du serveur (il faut être administrateur) : un panneau avec boutons et menus s'ouvre, rien que pour toi.

Les deux modifient la **même configuration** (fichier `data/config.json`), appliquée immédiatement, sans redémarrer le bot.

---

## 🧩 Variables pour personnaliser les textes

| Variable | Remplacée par |
|---|---|
| `{user}` | Mention du nouveau membre (@Pseudo) |
| `{username}` | Son pseudo, sans mention |
| `{server}` | Le nom du serveur |
| `{memberCount}` | Le nombre de membres du serveur |

Exemple : `Bienvenue {user} sur {server}, tu es le membre n°{memberCount} !`

Tu peux aussi mettre du `**gras**` et de l' `*italique*` comme dans discord.

---

## 🛠️ En cas de problème

| Symptôme | Solution |
|---|---|
| `⚠️ TOKEN DISCORD MANQUANT` au démarrage | Tu n'as pas créé le fichier `.env`, ou pas collé le token dedans (voir étape 3). Le dashboard marche quand même. |
| `❌ CONNEXION À DISCORD IMPOSSIBLE ... invalid token` | Le token dans le `.env` n'est pas le bon. Refais l'étape 2 (Reset Token) et recolle-le. |
| Erreur `disallowed intents` | Tu as oublié d'activer **SERVER MEMBERS INTENT** sur le portail développeur (étape 2, point 4). |
| Le bot est en ligne mais aucun message de bienvenue | Vérifie dans le dashboard : système **activé** + **salon choisi**. Puis teste avec le bouton « Envoyer un test ». Vérifie aussi que le bot a le droit d'écrire dans ce salon. |
| Le rôle automatique ne se donne pas | Paramètres du serveur → **Rôles** : glisse le rôle du bot **au-dessus** du rôle à donner. discord refuse sinon. |
| La commande `/config` n'apparaît pas | Elle est réservée aux administrateurs et enregistrée au démarrage du bot. Redémarre le bot, attends quelques secondes, réessaie. |
| `EADDRINUSE` / le dashboard ne démarre pas | Le port 3000 est déjà pris (bot lancé deux fois ?). Ferme l'autre fenêtre, ou change `DASHBOARD_PORT` dans le `.env`. |
| Mot de passe du dashboard oublié | C'est `DASHBOARD_PASSWORD` dans ton fichier `.env`. Si tu ne l'as jamais défini, il s'affiche dans la fenêtre noire au démarrage du bot. |

---

## 📁 Le projet en bref (pour plus tard)

```
virality/
├── .env                 ← TES secrets (token + mot de passe) — à créer depuis .env.example
├── data/config.json     ← la configuration sauvegardée (créé automatiquement)
├── src/
│   ├── index.js         ← démarrage (bot + dashboard)
│   ├── bot.js           ← le bot discord (limité au serveur Virality)
│   ├── welcome.js       ← envoi des messages de bienvenue
│   ├── configPanel.js   ← la commande /config dans discord
│   ├── dashboard.js     ← le serveur du dashboard web
│   └── config.js        ← lecture/écriture de la configuration
├── views/               ← pages du dashboard (connexion + configuration)
└── public/              ← style, script et images du dashboard
```

🔒 **Sécurité** : le dashboard est fait pour tourner **en local sur ton PC**. Ne l'expose pas sur internet (pas de redirection de port sur ta box) sans protection supplémentaire.
