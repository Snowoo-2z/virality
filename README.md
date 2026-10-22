# 🔥 Virality Bot

Le bot discord officiel du serveur **Virality**. Il gère la **bienvenue**, le **style des rôles** et la **structure complète du serveur**, de 2 façons :

- 🖥️ **Dashboard web** (page dans ton navigateur, protégée par mot de passe) organisé en onglets : **👋 Bienvenue**, **🎨 Rôles**, **🎫 Tickets**, **🧱 Embeds**, **🏗️ Structure & sauvegarde**
- 💬 **Commande `/config`** directement dans discord (boutons + menus, réservée aux administrateurs) pour la bienvenue

### Les 5 onglets du dashboard

- **👋 Bienvenue** : le message d'accueil des nouveaux membres (voir détail ci-dessous), avec aperçu en direct
- **🎨 Rôles du serveur** : en 1 clic, renomme + recolore les rôles du staff aux couleurs Virality et crée les rôles **Accueil**, **Membre** et **Clipper** (noms/couleurs ajustables, permissions inchangées)
- **🎫 Tickets** : système de support complet — panneau stylé avec **plusieurs boutons** publié dans le salon de ton choix. **Chaque bouton = un type de ticket différent** (Question/Support, Commander un clip, Partenariat, + les tiens) avec **ses rôles staff à pinger**, **son message d'ouverture**, **sa catégorie**, **son nom de salon** et **son comportement IA**. Salon privé créé automatiquement, formulaire de sujet optionnel, fermeture avec **transcription** (.txt) dans un salon de logs et/ou en MP. En bonus : une **assistante IA Ministral 3 14B** (`ministral-14b-2512`) peut accueillir le membre et répondre dans le ticket — modèle, déclencheur, créativité, mémoire et consignes (générales + par bouton) sont réglables depuis cet onglet
- **🧱 Embeds** : créateur d'embeds 100 % personnalisable (auteur, titre, description, couleur, footer, grande image, miniature, horodatage, **champs** titre+texte, texte au-dessus, mentions @everyone) avec aperçu en direct, **modèles enregistrables** et envoi en 1 clic dans le salon de ton choix
- **🏗️ Structure & sauvegarde** : en 1 clic, construis tout le serveur — catégories **📌 Informations** (annonces, bienvenue, à-propos, en lecture seule), **💬 Communauté** (success-flex, proof, tickets) et **🔒 Espace Clipper** privé (commandes, discussion, bonus : les Membres voient sans l'historique, les Clippers voient tout). Le bot ne supprime jamais rien : il crée ce qui manque et range ce qui existe. C'est aussi là qu'on active la **sauvegarde automatique sur Supabase** (optionnelle) : une copie de tes réglages est envoyée à chaque enregistrement, et récupérée toute seule si tu changes de PC (voir les lignes `SUPABASE_...` dans `.env.example` et le fichier `supabase/schema.sql`)

Le bot ne fonctionne **que sur le serveur Virality** (`1562033502612885534`) : si quelqu'un essaie de l'ajouter ailleurs, il quitte le serveur tout seul.

### Ce que le système de bienvenue sait faire

- Message dans un salon au choix, au format **embed** (encadré coloré) ou **texte simple**
- Titre, description, petit texte du bas (footer), **couleur** libre
- Grande image : **bannière Virality** incluse, aucune, ou ton image par lien URL
- Miniature : avatar du nouveau membre, logo Virality, ou aucune
- Mention du nouveau membre (notification) activable
- **Message privé** de bienvenue en option (lui aussi personnalisable)
- **Rôle 🔥・Membre donné automatiquement** à l'arrivée (activé par défaut, le bot retrouve le rôle tout seul) + un autre rôle automatique au choix en option
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
4. ⚠️ **TRÈS IMPORTANT** : descends jusqu'à « Privileged Gateway Intents » et **active « SERVER MEMBERS INTENT »** (sinon le bot ne verra pas les nouveaux membres arriver). Active aussi **« MESSAGE CONTENT INTENT »** si tu veux l'**IA dans les tickets** (c'est ce qui permet au bot de lire les messages des membres), puis **Save Changes**
5. En haut de cette même page Bot : **« Reset Token »** → confirme → **copie le token** qui s'affiche (c'est le mot de passe du bot, garde-le secret !)
6. (Optionnel mais joli) Sur la page **General Information**, mets le logo Virality comme icône, et sur la page **Bot** tu peux aussi mettre un avatar / une bannière au bot.

### Étape 3 — Mettre le token dans le fichier `.env`

1. Dans le dossier du projet, fais une **copie** du fichier `.env.example` et renomme la copie en **`.env`** (juste `.env`)
2. Ouvre `.env` avec le Bloc-notes et remplace :
   - `DISCORD_TOKEN=colle_ton_token_ici` → colle ton token de l'étape 2
   - `DASHBOARD_PASSWORD=choisis_un_mot_de_passe` → choisis le mot de passe que tu veux pour le dashboard
   - (Optionnel — pour l'IA des tickets) `MISTRAL_API_KEY=colle_ta_cle_mistral_ici` → ta clé créée sur <https://console.mistral.ai> (menu « API Keys »)
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

### 🤖 Activer l'assistante IA des tickets (optionnel)

1. Va sur <https://console.mistral.ai> → **API Keys** → crée une clé → **copie-la**
2. Ouvre ton fichier `.env` (Bloc-notes) → colle la clé après **`MISTRAL_API_KEY=`** → **Enregistre**
3. Va sur <https://discord.com/developers/applications> → ton application → **Bot** → active **« MESSAGE CONTENT INTENT »** → **Save Changes**
4. Dans le dashboard, onglet **🎫 Tickets** → section **« 🤖 Assistante IA »** → allume **« Activer l'assistante IA »** → **💾 Enregistrer** (bouton orange en haut de l'onglet Bienvenue)
5. **Ferme la fenêtre noire du bot et relance-le** (l'écoute des messages ne peut démarrer qu'au lancement) — l'encadré d'état dans le dashboard doit afficher **✅ IA en ligne**

Le bot utilise **Ministral 3 14B** (`ministral-14b-2512`) et espace tout seul ses appels d'un peu plus d'1 seconde pour rester sous 1 requête/seconde. Pour chaque **bouton** du panneau, tu peux dire à l'IA quoi faire (ex : pour « Commander un clip », récolter le brief complet) dans **« Consignes spéciales »** du type.

**Lien long que l'IA doit envoyer ?** Ne le colle pas dans les consignes : une IA peut changer une lettre en le recopiant. Dans la section **« 🔗 Liens exacts »**, clique **« ➕ Ajouter un lien exact »**, choisis un petit code (ex : `inscription`), colle le lien complet, écris à quoi il sert, puis enregistre. L'IA écrira seulement `{{inscription}}` et le bot remplacera ce code par ton vrai lien, caractère par caractère.

---

## ☁️ Déployer gratuitement sur Render (optionnel)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Snowoo-2z/virality/tree/arena/df51ada1-virality)

Le fichier `render.yaml` prépare déjà un **Web Service gratuit**, en région **Frankfurt**, avec démarrage automatique et contrôle de santé sur `/health`.

1. Clique sur le bouton **Deploy to Render** ci-dessus.
2. Connecte-toi à **Render** et autorise l'accès au dépôt GitHub si Render le demande.
3. Remplis les secrets demandés :
   - **`DISCORD_TOKEN`** : le token de ton bot
   - **`DASHBOARD_PASSWORD`** : un mot de passe solide pour le dashboard (il sera sur internet)
   - **`MISTRAL_API_KEY`** : ta clé Mistral si tu utilises l'IA des tickets
   - **`SUPABASE_SERVICE_ROLE_KEY`** : très recommandé pour garder tes réglages après un redémarrage Render
4. Clique sur **Apply / Deploy** et attends que Render affiche **Live**.
5. Clique sur l'adresse **onrender.com** du service et connecte-toi avec ton mot de passe dashboard.
6. Vérifie dans l'onglet **🏗️ Structure & sauvegarde** que **« Auto-ping Render : activé »** s'affiche.

**Auto-ping inclus :** le bot appelle automatiquement son adresse publique `/health` toutes les 10 minutes. Cela limite la mise en veille du plan gratuit (Render endort un service gratuit après 15 minutes sans trafic). Cela consomme des heures gratuites tant que le service reste allumé, donc surveille ton quota si tu as plusieurs services gratuits.

⚠️ **Ne laisse pas le bot local et le bot Render allumés en même temps avec le même token**, sinon discord recevra des réponses en double. Quand Render fonctionne, ferme la fenêtre noire sur ton PC.

⚠️ Sur Render gratuit, les fichiers locaux peuvent être effacés à chaque redéploiement ou redémarrage. La copie **Supabase** permet au bot de récupérer ses réglages automatiquement.

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
| Erreur `disallowed intents` | Tu as oublié d'activer **SERVER MEMBERS INTENT** (et **MESSAGE CONTENT INTENT** si l'IA est activée) sur le portail développeur (étape 2, point 4). |
| Le bot est en ligne mais aucun message de bienvenue | Vérifie dans le dashboard : système **activé** + **salon choisi**. Puis teste avec le bouton « Envoyer un test ». Vérifie aussi que le bot a le droit d'écrire dans ce salon. |
| Le rôle automatique ne se donne pas | Paramètres du serveur → **Rôles** : glisse le rôle du bot **au-dessus** du rôle à donner. discord refuse sinon. |
| L'IA des tickets ne répond pas | Regarde l'encadré d'état dans l'onglet **🎫 Tickets** du dashboard : il te dit ce qui manque. Les 3 causes classiques : pas de clé `MISTRAL_API_KEY` dans le `.env` • **MESSAGE CONTENT INTENT** pas coché sur le portail développeur • le bot pas **redémarré** après l'activation. Et si un membre du staff a déjà répondu dans le ticket, l'IA se met en pause (c'est un réglage). |
| L'IA envoie un lien faux ou coupé | Ne mets pas le lien dans ses consignes. Ajoute-le dans **« 🔗 Liens exacts »** de l'onglet Tickets : l'IA écrira un petit code et le bot enverra le vrai lien sans le modifier. |
| La commande `/config` n'apparaît pas | Elle est réservée aux administrateurs et enregistrée au démarrage du bot. Redémarre le bot, attends quelques secondes, réessaie. |
| `EADDRINUSE` / le dashboard ne démarre pas | Le port 3000 est déjà pris (bot lancé deux fois ?). Ferme l'autre fenêtre, ou change `DASHBOARD_PORT` dans le `.env`. |
| Mot de passe du dashboard oublié | C'est `DASHBOARD_PASSWORD` dans ton fichier `.env`. Si tu ne l'as jamais défini, il s'affiche dans la fenêtre noire au démarrage du bot. |
| Le bot Render s'endort quand même | Ouvre une fois son adresse `onrender.com` pour le réveiller, puis vérifie dans les logs Render la ligne **« 🔁 Auto-ping activé »** et dans le dashboard **« Auto-ping Render : activé »**. Si le service était arrêté ou en erreur, il ne peut pas se pinger lui-même : corrige l'erreur dans les logs puis redéploie. |

---

## 📁 Le projet en bref (pour plus tard)

```
virality/
├── .env                 ← TES secrets (token + mot de passe) — à créer depuis .env.example
├── render.yaml          ← déploiement gratuit sur Render (auto-ping inclus)
├── data/config.json     ← la configuration sauvegardée (créé automatiquement)
├── src/
│   ├── index.js         ← démarrage (bot + dashboard)
│   ├── bot.js           ← le bot discord (limité au serveur Virality)
│   ├── welcome.js       ← envoi des messages de bienvenue + rôle Membre auto
│   ├── tickets.js       ← les tickets (boutons, Salons privés, IA)
│   ├── embeds.js        ← fabrication des embeds (tickets + créateur)
│   ├── ai.js            ← l'assistante IA Mistral des tickets
│   ├── configPanel.js   ← la commande /config dans discord
│   ├── dashboard.js     ← le serveur du dashboard web
│   └── config.js        ← lecture/écriture de la configuration
├── views/               ← pages du dashboard (connexion + configuration)
└── public/              ← style, script et images du dashboard
```

🔒 **Sécurité** : le dashboard est fait pour tourner **en local sur ton PC**. Ne l'expose pas sur internet (pas de redirection de port sur ta box) sans protection supplémentaire.
