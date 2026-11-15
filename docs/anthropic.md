# Utiliser l’API Anthropic

Anthropic peut assurer la lecture des images, les fiches de révision, les exercices et l’extraction du vocabulaire anglais. Les PDF textuels restent lus sur le serveur ; les images à transcrire et les textes utiles aux préparations sont transmis à Anthropic. Le quiz lexical déterministe reste indépendant de l’IA.

Les résultats restent des brouillons privés à relire et à publier par un parent. Les contrôles de citations, de réponses, de calcul et du périmètre anglais restent actifs. Une erreur Anthropic ne déclenche aucun appel à un autre fournisseur.

## Sur Cloudflare

La configuration du dépôt sélectionne `AI_PROVIDER=anthropic` et `ANTHROPIC_MODEL=claude-sonnet-5-5`. Le Worker `revizo` appelle directement l’API Anthropic depuis le serveur.

Depuis le dépôt, après connexion à votre compte Cloudflare :

```sh
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy:cloud
```

Saisir la clé dans l’invite privée de Wrangler. Ne pas la placer dans `wrangler.jsonc`, GitHub, une conversation ou une variable `EXPO_PUBLIC_*`. Ce secret reste sur le Worker pendant les publications suivantes ; il n’est pas nécessaire de le copier dans les secrets GitHub Actions. La publication automatique exige que ce secret soit déjà configuré sur Cloudflare.

Pour le développement local Workers, ajouter `ANTHROPIC_API_KEY=…` et `SETUP_TOKEN=un-code-local` à `.dev.vars`, ignoré par Git. Puis lancer `npm run dev:cloud`. Cette configuration appelle réellement l’API Anthropic.

Pour changer de modèle, modifier `ANTHROPIC_MODEL` dans `wrangler.jsonc`, régénérer les types avec `npx wrangler types cloud/worker-configuration.d.ts`, puis redéployer. Pour utiliser Workers AI, sélectionner `AI_PROVIDER=workers-ai` et retirer `ANTHROPIC_API_KEY` de `secrets.required` avant de régénérer les types et redéployer. Le modèle Workers AI existant reste `@cf/google/gemma-4-26b-a4b-it`.

## Sur le serveur Node.js

```sh
cp .env.example .env
```

Renseigner ces variables dans le fichier `.env` privé :

```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=…
ANTHROPIC_MODEL=claude-sonnet-5-5
```

Puis lancer `npm run server`, ou reconstruire le serveur avec `npm run build:server` avant `npm run serve`. L’intégration nécessite la version du code qui la contient ; le paquet historique v1.0.0 utilise Ollama.

Ollama n’est pas nécessaire avec Anthropic. Poppler reste nécessaire pour les PDF sur Node.js. Les images normalisées en PNG sont lues directement par Claude ; l’OCR Tesseract indépendant reste utilisé avec Ollama. Sans fournisseur explicite, le serveur choisit Anthropic si une clé non vide est présente, sinon Ollama. `AI_PROVIDER=ollama` conserve le fonctionnement local, même si une clé Anthropic est présente.

## Vérifier et utiliser

Dans **Famille → L’IA pour préparer les cours**, le parent retrouve le modèle Claude et son état. L’adresse et le modèle sont contrôlés par la configuration du serveur ; un ancien réglage Ollama conservé dans la base n’est pas utilisé pour les appels Anthropic. La vérification consulte l’accès au modèle sans demander de génération ; elle ne garantit pas un solde suffisant pour l’appel suivant.

La clé ne figure ni dans les réglages retournés au navigateur, ni dans les sauvegardes familiales, ni dans les travaux enregistrés. Le client ne peut changer l’adresse destinataire d’un appel Anthropic. Les erreurs d’accès, de modèle, de crédit, de limite et de réponse incomplète sont signalées ; les documents sont conservés pour une relance.

L’utilisation est facturée sur le compte API Anthropic, séparément de l’hébergement Cloudflare. La [facturation API est distincte de l’abonnement Claude](https://support.claude.com/en/articles/9876003-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan) ; certains forfaits peuvent inclure des crédits API à rattacher au compte Console. Consulter les [modèles et tarifs Anthropic](https://platform.claude.com/docs/en/models/overview). Les appels utilisent les [sorties JSON structurées](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) et le stockage de clé suit la [configuration des secrets Workers](https://developers.cloudflare.com/workers/configuration/secrets/).

Les tests automatiques vérifient le contrat HTTP avec des réponses de test explicites. Une préparation réelle nécessite une clé valide et des crédits API ; ces tests ne prouvent pas la qualité pédagogique du modèle.
