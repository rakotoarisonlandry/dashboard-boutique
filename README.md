# Robia IoT — Dashboard boutique

Application React pour les agents affectés à une ou plusieurs boutiques. Le compte doit déjà exister dans Robia ; les autorisations sont vérifiées par le backend.

## Démarrer

```sh
npm install
npm run dev
```

Ouvrir l'adresse affichée (par défaut `http://localhost:5173`). L'API utilisée par défaut est `https://api.robiacopilot.site`. Pour un autre environnement, créer un fichier `.env.local` avec `VITE_API_URL=https://adresse-du-backend` puis redémarrer Vite. Aucune clé privée ne doit être ajoutée au frontend.

## Fonctions

Connexion Robia, sélection des boutiques autorisées, liste des rendez-vous et rafraîchissement toutes les 10 secondes lorsque la page est visible, confirmation/refus, vérification manuelle de référence et enregistrement de l'arrivée, et validation d'une récupération assistée après vérification physique de la CIN et du dossier. La caméra et le scan QR ne sont pas encore intégrés.

Les comptes, affectations et la disponibilité des boutiques doivent être créés côté backend. La liste de rendez-vous de l'API est limitée aux 100 dernières demandes. Le jeton de session est conservé uniquement en mémoire : actualiser l'onglet demande de se reconnecter.

## Mise en production

`npm run build` produit `dist/`. Servir le dossier en HTTPS. Ajouter l'origine exacte de l'interface à `FRONTEND_URLS` côté backend et redémarrer selon la procédure serveur ; autrement, le navigateur bloquera les appels CORS. Configurer une politique de sécurité et éviter toute publication d'identifiants. Faire un test avec des comptes de deux boutiques avant utilisation réelle.
