# Révizo

[Dépôt GitHub public](https://github.com/juliencorre/revizio)

Application familiale de révision, conçue pour l’iPad : les parents importent les cours et relisent les fiches et exercices préparés avec une IA locale ou hébergée ; l’enfant retrouve les contenus publiés, ses plans et ses résultats. Expo, React Native et TypeScript partagent le même socle web et natif, avec une interface neuromorphique et de grandes cartes tactiles.

## Ouvrir l’espace familial

Sur [cours.gofel.fr](https://cours.gofel.fr), aucune configuration de serveur n’est demandée : la connexion utilise automatiquement le site ouvert. L’accès parent utilise une adresse e-mail et un mot de passe ; l’accès enfant, son prénom et son code. Les profils et les cours ne sont pas affichés aux visiteurs. La première création sur le site hébergé nécessite l’invitation privée du propriétaire. Voir le [guide Cloudflare](docs/cloudflare.md).

Vous avez téléchargé le paquet serveur compilé d’une release ? Suivre [son guide d’installation](docs/installation-release.md). Les commandes ci-dessous partent du dépôt source.

Installer Node.js 24, npm et Poppler (`pdftotext`, `pdfinfo`, `pdftoppm` disponibles dans le PATH). Pour Anthropic, copier `.env.example` vers `.env` et y renseigner `ANTHROPIC_API_KEY` ; voir le [guide Anthropic](docs/anthropic.md). Pour l’IA locale, installer Ollama sur la machine serveur et sélectionner `AI_PROVIDER=ollama`.

```sh
npm ci
cp .env.example .env
# Renseigner ANTHROPIC_API_KEY dans .env avant de démarrer.
npm run build
npm run serve
```

Ouvrir `http://127.0.0.1:4173`, choisir **Parent**, puis créer le compte parent et les deux profils enfants, en CM1 et en 5e, chacun avec son code. Le premier espace familial est vide. Le compte du conjoint s’ajoute depuis **Famille**, avec confirmation du mot de passe du parent connecté. Le foyer est limité côté serveur à deux parents et deux enfants. La démonstration est désactivée sur les installations familiales.

Le serveur conserve SQLite et les pièces jointes privées dans `.revizio/`. Avec la configuration d’exemple, les préparations utilisent l’API Anthropic et le modèle `claude-sonnet-5-5`. La clé et le modèle se configurent exclusivement sur le serveur. Le mode Ollama conserve son modèle `ministral-3:8b`, ses réglages dans **Famille** et son OCR Tesseract local. Le détail des variables, limites et sauvegardes figure dans le [guide serveur](docs/backend.md).

Pour accéder au serveur depuis l’iPad du même réseau :

```sh
HOST=0.0.0.0 PORT=4173 npm run serve
```

Ouvrir alors l’adresse réseau de cette machine dans Safari. Pour une installation durable, servir l’application et `/api` sous la même origine HTTPS ; définir `SECURE_COOKIES=true` derrière cette terminaison HTTPS. La carte d’installation sur l’accueil et dans **Famille** guide l’ajout sur l’écran d’accueil de l’iPad et propose **Installer Révizo** sur les navigateurs compatibles. L’application s’ouvre ensuite dans une fenêtre dédiée, en portrait ou paysage. Le statut du cache et les mises à jour disponibles sont affichés dans cette carte. Le cache de l’interface s’installe après une première ouverture en ligne ; une adresse LAN en HTTP ne suffit pas sur iPad. Voir [installation iPad et hors connexion](docs/ipad-offline.md).

## Héberger sur Cloudflare

L’application est accessible sur **[cours.gofel.fr](https://cours.gofel.fr)**. Le [guide Cloudflare](docs/cloudflare.md) installe l’application complète sur Workers : données et documents privés dans un Durable Object SQLite, préparations avec Anthropic. L’ordinateur familial peut être éteint. L’hébergement utilise l’offre Workers Free et ses quotas ; les appels Anthropic sont facturés séparément sur votre compte API.

```sh
npm ci
npx wrangler login --device
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy:cloud
```

Le premier compte se crée avec un code d’installation privé conservé dans `.cloudflare/installation-code`. Les documents utilisés pour l’IA sont transmis à Anthropic ; la clé reste un secret du Worker. Le [guide Anthropic](docs/anthropic.md) décrit aussi l’alternative Workers AI et la configuration locale avec Ollama.

## Premier parcours

1. Sur l’accueil parent, choisir la matière, puis **Ajouter un cours** dans l’onglet **Cours**. Donner un titre au cours, choisir les documents dans **Choisir des fichiers** ou ajouter une photo, puis créer le brouillon.
2. **Préparer la fiche** : lancer la vraie préparation IA ou rédiger à la main, ouvrir la source citée, corriger et confirmer la relecture avant de publier. Sur iPad en paysage, la page citée peut rester à côté de la fiche. Pour corriger une publication, créer une copie puis choisir **Remplacer la fiche publiée**. L’ancienne édition reste consultable dans la bibliothèque parent.
3. Dans **Exercices**, toucher **Préparer des exercices** puis choisir les cours publiés de la matière, les formats, le niveau et le nombre de questions. Relire les questions et les corrections avant publication.
4. **Contrôles** : choisir une date et un temps quotidien, ajuster les séances puis partager le plan. La semaine de révision additionne les minutes de toutes les matières pour l’enfant sélectionné. Le parent peut y déplacer une séance à venir ou rattraper une séance en retard avant le contrôle. Dans **Anglais → Conjugaison**, le parent choisit les verbes et les temps étudiés.
5. Dans **Anglais**, **Espagnol** ou **Latin**, ouvrir **Vocabulaire** et choisir **Importer une liste (PDF, photo…)**. Pour compléter une liste existante, l’ouvrir puis toucher **Importer des mots (PDF, photo…)**. La saisie manuelle et le collage au format `mot = traduction` sont également disponibles. Les boutons **Choisir des images** et **Choisir des fichiers** permettent de réunir plusieurs pièces avant de sélectionner **Analyser les documents**. L’IA lit les pièces et signale les traductions qu’elle propose quand une seule langue y figure. Relire, corriger ou écarter les propositions, puis ajouter les mots au brouillon. La liste devient accessible à l’enfant à la publication. Un point-virgule sépare les variantes acceptées.
6. L’enfant entre avec son profil et son code ; il lit, s’exerce, reprend ses essais et revoit ses erreurs. La rubrique **Famille** gère les profils et l’export/restauration des sauvegardes.

Les générations continuent sur le serveur et se retrouvent dans **Préparations IA**. Aucun résultat IA n’est publié automatiquement. La rédaction manuelle et le quiz lexical déterministe ne sont pas présentés comme de l’IA.

## Se repérer dans l’application

L’enfant retrouve cinq rubriques stables : **Aujourd’hui**, **Matières**, **Exercices**, **Contrôles** et **Progrès**. L’accueil propose une prochaine séance : reprise de l’exercice ou de la séance de vocabulaire utilisés le plus récemment, séance prévue aujourd’hui, relecture à échéance, puis exercice ou fiche à découvrir. Les durées indicatives sont annoncées comme des estimations. Dans **Matières → Anglais, Espagnol ou Latin → Mes listes de vocabulaire**, il consulte les mots, écrit leurs traductions dans un sens ou dans les deux et reprend une séance interrompue. Les verbes et les temps restent accessibles dans la matière Anglais.

Chaque liste distingue les mots **À découvrir**, **En cours**, **À revoir** et **Connus**. Un mot devient connu après **deux réussites consécutives dans chaque sens** ; une erreur le remet à revoir. Le suivi détaille les deux sens, peut être filtré et permet de travailler seulement les mots non connus. Les accents comptent, tandis que les majuscules et les espaces autour d’une réponse sont ignorés. Consulter les traductions ne valide aucun mot. L’enfant retrouve aussi les mots travaillés par langue dans **Progrès**, et le parent dans **Suivi**. Un même mot exercé dans les deux sens y compte une seule fois par traduction. Pour les traductions simples, la consigne indique si le pronom sujet est facultatif. Par exemple, « hablo » et « yo hablo » conviennent pour « je parle ». L’enfant peut aussi donner un nom avec ou sans son article quand celui-ci figure dans la liste ou que Révizo reconnaît le mot. Le parent peut activer **Exiger l’article pour réviser le genre**. La correction et le bilan montrent la forme complète. La correction fonctionne hors ligne, sans appel à une IA.

L’espace parent comporte **Accueil**, **Matières**, **Contrôles**, **Suivi** et **Famille**. L’accueil affiche en premier une préparation à reprendre lorsqu’un brouillon existe, puis les matières. **Voir toutes les matières** donne accès à chaque discipline, y compris celles sans contenu. Le titre de la matière ouvre un sélecteur pour passer directement à une autre discipline. Les onglets **Cours** et **Exercices** affichent les contenus de l’enfant et leur statut. Les langues proposent aussi **Vocabulaire**, et l’anglais propose **Conjugaison**. La bibliothèque permet de rechercher et filtrer les fiches et séries par matière, type et statut. **Brouillon** désigne un contenu encore vide ; **À vérifier** un brouillon contenant une fiche ou des questions ; **Publié** un contenu partagé après confirmation parentale. Les préparations IA sont accessibles depuis l’accueil. Un parent peut reprendre la saisie d’un cours dans sa matière ou rouvrir une série depuis la fiche associée.

Le **Suivi** présente les résultats du dernier essai terminé de chaque série, les erreurs encore présentes avec les questions et corrections réellement présentées, les lectures déclarées et les séances à accompagner. Les résultats et l’activité ne sont pas présentés comme une mesure de maîtrise. Le profil suivi reste visible et peut être changé depuis chaque page parent.

## Développer avec Expo

Le serveur de développement se lance avec `npm run server`. Pour une application iOS/Android, démarrer Metro dans un autre terminal :

```sh
npm start
```

Utiliser un client Expo compatible avec le SDK 58 ou un development build. Configurer l’adresse du serveur familial dans l’écran de connexion ; elle doit être joignable depuis l’appareil. Le simulateur iOS nécessite macOS et Xcode. `npm run web` ouvre le client Expo web de développement ; le parcours familial le plus simple utilise l’export servi avec son API à la même origine.

## Périmètre actuel

Photos/PDF durables, comptes parent/enfant, deux parents et deux enfants, synchronisation par révisions, préparations Ollama, cinq formats d’exercices, contrôles blancs chronométrés, plans modifiables, listes de vocabulaire dans trois langues, cartes d’anglais et lecture audio sont implémentés. Les tentatives et séances de vocabulaire conservent les questions et corrections réellement affichées.

Les imports de cours, d’anglais et de vocabulaire acceptent les PDF, les photos, les documents Office récents (DOCX, PPTX, XLSX), OpenDocument (ODT, ODP, ODS) et les fichiers texte (TXT, Markdown, CSV, entre autres). Pour les documents bureautiques, Révizo lit le texte et les valeurs enregistrées des cellules. Pour conserver les figures, les équations mises en page ou un document composé uniquement d’images, exporter en PDF. Pour les anciens DOC, XLS et PPT ou les documents protégés, exporter une copie en PDF sans mot de passe.

Les photos manuscrites, formules et schémas nécessitent une relecture attentive ; une extraction incertaine est signalée. Après installation du cache en contexte sécurisé, l’interface et les contenus déjà conservés peuvent être repris hors connexion ; les générations et la synchronisation nécessitent le serveur. La caméra, les voix système et l’application native restent à vérifier sur iPad physique. Voir la [matrice fonctionnelle et les étapes restantes](docs/development-plan.md).

## Vérifier

```sh
npm run typecheck
npm test
npm run export:web
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Les tests navigateur utilisent un serveur réel éphémère et une base de test distincte. Ils couvrent les orientations paysage/portrait avec Chromium et WebKit ; cela ne remplace pas Safari sur iPad physique. Le test opt-in `REVIZIO_LIVE_AI=1 npx vitest run tests/server/live-ai.test.ts` nécessite Ollama et les outils PDF ; voir le [guide serveur](docs/backend.md).

Les résultats exécutés et leurs limites sont consignés dans [la validation](docs/validation.md).

## Organisation

- `src/app` : routes Expo Router.
- `src/features` : écrans enfant et parent.
- `src/components` : composants partagés.
- `src/domain` : modèles, règles et données de démonstration.
- `src/state` : état de l’application et persistance.
- `server` : sessions, SQLite, documents privés et file IA.
- `tests` : règles métier et parcours.

Voir [l’architecture](docs/architecture.md), [le plan](docs/development-plan.md) et [les contrats actuels](docs/contracts-v2.md).

## Collaboration

Développement par agents dans des branches et worktrees indépendants. L’intégration est faite séquentiellement sur `main`. Voir [AGENTS.md](AGENTS.md).

Le fichier LICENSE conserve la licence du modèle Expo utilisé pour initialiser le projet.
