# Serveur familial Révizo

Le serveur Node.js 24 fournit une vraie session parent/enfant, des données SQLite par profil, le stockage privé des photos/PDF et des préparations IA persistantes. La démonstration locale reste indépendante. La création d’une famille démarre avec des cours et exercices vides.

## Démarrer

```sh
npm install
ollama pull ministral-3:8b
npm run export:web
npm run server
```

Installer Poppler (`pdftotext`, `pdfinfo`, `pdftoppm`) pour les PDF. L’OCR imprimé utilise Tesseract.js et télécharge les données françaises au premier document ; elles sont ensuite conservées dans `.revizio/.cache/ocr`. Une connexion réseau est nécessaire pour ce premier téléchargement. Le traitement des documents et l’inférence Ollama restent locaux. Les photos manuscrites ou les OCR peu confiants utilisent la vision du modèle, avec une incertitude visible. Une lecture trop courte est refusée avec une demande de nouvelle photo ou de texte saisi.

Par défaut : `http://127.0.0.1:4173`, fichiers dans `.revizio/`. Variables possibles :

| Variable | Effet |
|---|---|
| `HOST` | Adresse d’écoute, `127.0.0.1` par défaut ; `0.0.0.0` expose au réseau local |
| `PORT` | Port, `4173` par défaut |
| `REVIZIO_DATA_DIR` | Répertoire privé SQLite, documents, cache et sauvegardes de restauration |
| `OLLAMA_BASE_URL` | Serveur Ollama initial, `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Modèle initial, `ministral-3:8b` |
| `ALLOWED_ORIGINS` | Origines web de développement autorisées, séparées par des virgules |
| `SECURE_COOKIES` | `true` derrière une terminaison HTTPS |

Pour l’iPad, utiliser une adresse accessible sur le réseau familial et HTTPS pour un déploiement durable. Le serveur ne configure pas de tunnel public et ne contient aucune clé IA dans le client. Le bundle de production se construit avec `npm run build:server`, puis démarre avec `npm run serve`.

## Données et autorisations

Le compte parent utilise un mot de passe de 10 à 256 caractères. Chaque enfant possède un PIN de 4 à 8 chiffres. Les deux sont dérivés par scrypt et sel aléatoire. La base conserve uniquement le condensat des jetons de session. Le web reçoit un cookie HttpOnly SameSite Strict ; les applications natives peuvent envoyer le jeton dans `Authorization: Bearer …`. La déconnexion invalide la session côté serveur.

Le parent gère tous les profils et contenus de sa famille. Un enfant voit exclusivement les cours, séries et plans publiés de son profil. Il peut enregistrer ses tentatives, lectures et étapes accomplies. Le serveur recalcule la correction et vérifie les questions présentées ; les anciennes tentatives conservent leur instantané. Il refuse les modifications de contenus, de réglages et de périmètre anglais. Le dernier profil familial ne peut pas être supprimé.

`GET /api/data?profileId=…` retourne `{data,revision}`. `PUT /api/data` reçoit `{profileId,data,revision}`. Une version périmée donne HTTP 409 et `{error,data,revision}` ; l’application doit recharger puis proposer de reprendre les modifications. La réponse respecte les mêmes autorisations que la lecture normale.

Les fichiers ne sont pas servis par le répertoire public. `POST /api/uploads?profileId=…` reçoit un champ multipart `file`, limité à 25 Mo. Les images sont validées, corrigées selon EXIF, converties en PNG et limitées en dimensions ; l’original est conservé. Les PDF doivent avoir un en-tête PDF valide. Le serveur choisit ses propres noms de fichiers. `GET /api/uploads/:id` exige une session ; un enfant ne peut lire que les documents attachés à un cours publié de son profil. `PATCH /api/uploads/:id` accepte `{rotation:0|90|180|270}`. La suppression d’un fichier utilisé par un cours est refusée.

## Préparations IA

Les requêtes suivantes créent `{job}` et n’enregistrent aucun contenu publié :

- `POST /api/ai/course` : `{profileId,subjectId,title,sourceIds,sourceText?,existingCourseId?}`.
- `POST /api/ai/exercises` : `{profileId,courseIds,types,level,count,english?}`. Les formats sont `single-choice`, `true-false`, `fill-blank`, `short-answer`, `problem` ; le nombre est 5, 10, 15 ou 20. Le serveur répartit les questions entre tous les cours sélectionnés.
- `POST /api/ai/english` : `{profileId,sourceIds}`. Le résultat propose les mots, verbes, temps et mots outils à valider par le parent.

`GET /api/jobs`, `GET /api/jobs/:id` et `POST /api/jobs/:id/retry` sont réservés au parent. Les états sont `queued`, `running`, `succeeded`, `failed`, accompagnés d’une étape, d’un message, de dates, du profil cible et des paramètres de reprise non sensibles. Les travaux interrompus par un redémarrage repartent en file d’attente. Le résultat reste consultable après fermeture du navigateur. Les entrées et résultats sont conservés en SQLite ; le traitement est séquentiel.

Les pages PDF textuelles passent par Poppler ; les scans passent par OCR/vision. Chaque extrait garde sa source, sa page et son incertitude. Pour les fiches, le modèle organise des passages et le serveur construit les sections à partir de citations retrouvées dans les documents : une citation inventée n’est pas retenue. Les contenus sont des brouillons à relire.

Les exercices utilisent une sortie JSON structurée, puis une validation des formats, réponses et références. Les choix numériques équivalents sont refusés ; les réponses textuelles doivent être courtes. Un parseur arithmétique borné, sans exécution de code, calcule les réponses aux expressions explicites non ambiguës et fournit leur correction exacte ; la correction indique ce contrôle par le calculateur de Révizo. Un QCM qui ne propose pas le résultat exact est régénéré. Les portions anglaises déclarées, choix et réponses sont vérifiés contre le vocabulaire, les formes verbales et les mots outils autorisés. Ces contrôles ne démontrent pas la justesse de chaque problème rédigé : la relecture parentale reste nécessaire avant publication. Une erreur non réparable entraîne une nouvelle génération puis un échec explicite si elle persiste.

`GET/PATCH /api/settings` gère `{baseUrl,model,available}` côté parent. La disponibilité du modèle est testée avec un délai court, distinct de la durée d’inférence.

## Comptes et sauvegarde

- `/api/setup`, `/api/login`, `/api/child-login`, `/api/session`, `/api/logout` gèrent l’accès.
- `GET /api/profiles` public expose seulement identifiant, prénom et classe. Les mutations `/api/profiles` et `/api/profiles/:id` sont réservées au parent.
- `PATCH /api/account` reçoit `{currentPassword,parentName?,email?,newPassword?}`.
- `GET /api/backup` exporte `{format:'revizio-backup',version:1,exportedAt,profiles,uploads}`. Les documents normalisés et originaux sont intégrés en base64 ; plafond de 100 Mo décodés. L’adresse de connexion, les mots de passe, PIN, sessions et réglages serveur ne sont pas exportés.
- `POST /api/backup/restore` reçoit `{backup}` (ou l’objet brut). Il **remplace** tous les profils, cours, résultats et documents de la famille connectée, après validation complète. Il conserve le compte parent, conserve le PIN d’un profil déjà présent avec le même identifiant et demande un nouveau PIN pour les profils récupérés. Les sessions enfant sont invalidées. Une sauvegarde privée de l’état précédent est écrite dans `backups/` avant remplacement.
- `DELETE /api/family` reçoit `{password}` et efface la famille, ses documents et les archives privées créées avant une restauration.

Conserver régulièrement une copie du répertoire de données serveur, serveur arrêté, complète l’export portable. Les journaux de génération ne sont pas inclus dans l’export portable.

## Vérification

`npm run test:server` couvre les rôles, l’isolation des profils, les révisions, les documents privés, les sauvegardes, les jobs, les instantanés et la correction. Le moteur utilisé dans les tests rapides est explicitement un double de test.

```sh
REVIZIO_LIVE_AI=1 npx vitest run tests/server/live-ai.test.ts
```

Ce test opt-in utilise le modèle installé, une image imprimée et un PDF de test, puis cinq formats répartis sur deux cours. Il vérifie le texte réellement lu, les passages cités, les formats et les contrôles numériques. Le rapport local est écrit dans `artifacts/live-ai-report.json`. Il n’est pas lancé en CI sans Ollama.
