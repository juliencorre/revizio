# Installer le paquet serveur d’une release

Le fichier `revizio-1.0.0-serveur.tar.gz` contient l’application web et le serveur déjà compilés. Les archives « Source code » de GitHub contiennent le projet à développer.

## Paquet compilé

Installer Node.js 24, npm, Ollama et Poppler (`pdftotext`, `pdfinfo`, `pdftoppm`). Extraire le paquet dans un répertoire dédié, puis lancer depuis ce répertoire :

```sh
npm ci --omit=dev
ollama pull ministral-3:8b
npm run serve
```

Il n’est pas nécessaire de reconstruire ce paquet. Ouvrir `http://127.0.0.1:4173` pour créer le compte parent et le premier profil enfant. **Essayer la démonstration** ouvre les exemples séparément.

Les données familiales sont créées dans `.revizio/`. Conserver ce répertoire lors d’une mise à jour et exporter régulièrement une sauvegarde depuis les réglages. Ne pas extraire une nouvelle version par-dessus ce répertoire de données.

## iPad et réseau familial

Pour joindre le serveur depuis un autre appareil :

```sh
HOST=0.0.0.0 npm run serve
```

Utiliser l’adresse réseau de cette machine dans Safari. Pour installer l’application sur l’écran d’accueil et la reprendre hors connexion, servir le site et `/api` sous la même origine HTTPS. Copier `.env.example` vers `.env`, renseigner `ALLOWED_ORIGINS` avec l’origine HTTPS exacte et activer `SECURE_COOKIES=true` derrière cette terminaison HTTPS.

Le [guide iPad](ipad-offline.md) décrit l’installation, le cache et les mises à jour. Le [guide serveur](backend.md) détaille les réglages IA, les sauvegardes et les limites. Le modèle Ollama doit être disponible pour générer ; la rédaction manuelle reste possible.

## Projet source

Pour modifier l’application Expo ou construire une application native, utiliser le dépôt GitHub ou son archive source puis suivre le [README](../README.md). Le paquet serveur compilé n’inclut pas les sources de développement.
