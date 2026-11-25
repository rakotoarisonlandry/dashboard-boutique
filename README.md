# Robia IoT — Dashboard boutique

Application React pour les agents affectés à une ou plusieurs boutiques. Le compte doit déjà exister dans Robia et avoir été ajouté à l'équipe d'une boutique par le propriétaire (depuis l'administration, avec son adresse e-mail).

## Démarrer

```sh
npm install
npm run dev
```

Ouvrir l'adresse affichée (par défaut `http://localhost:5173`). L'API utilisée par défaut est `https://api.robiacopilot.site`. Pour un autre environnement, créer un fichier `.env.local` avec `VITE_API_URL=https://adresse-du-backend` puis redémarrer Vite. Aucune clé privée ne doit être ajoutée au frontend.

## Fonctions

- **Agenda du jour** et des 6 jours suivants, en frise horaire (`?date=` côté API), avec filtres par statut.
- **File « À traiter »** : toutes les demandes en attente, triées par heure de rendez-vous.
- **En direct** : rafraîchissement toutes les 10 secondes quand l'onglet est visible, alerte à chaque nouvelle demande.
- **Actions** : confirmer, refuser, enregistrer l'arrivée (« Client arrivé »), puis envoyer au client un retour « traité / non traité » avec un message (notification sur son téléphone).
- **Vérifier un ticket** par sa référence et enregistrer l'arrivée.
- **Recherche** instantanée par nom, téléphone, référence ou service ; badge **En retard** 15 minutes après l'heure du rendez-vous ; navigation vers n'importe quel jour.
- **Export CSV** de la journée (ouvrable dans Excel) ; raccourci clavier `/` pour vérifier un ticket ; nombre de demandes en attente dans le titre de l'onglet ; bandeau hors connexion.
- **Récupération d'accès** d'un client qui a changé de téléphone, après vérification de la CIN.

La caméra et le scan QR ne sont pas encore intégrés. La session est conservée dans l'onglet (sessionStorage) et disparaît à sa fermeture.

## Mise en production

`npm run build` produit `dist/`. Servir le dossier en HTTPS. Ajouter l'origine exacte de l'interface à `FRONTEND_URLS` côté backend et redémarrer selon la procédure serveur ; autrement, le navigateur bloquera les appels CORS. Faire un test avec des comptes de deux boutiques avant utilisation réelle.
