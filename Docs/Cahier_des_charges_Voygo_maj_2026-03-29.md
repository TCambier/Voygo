# Cahier des charges - Voygo

Version: 2026-03-29  
Statut: Document mis a jour selon les fonctionnalites actuellement presentes dans le projet

## 1. Presentation du projet

### 1.1 Nom du projet
Voygo

### 1.2 Concept general
Voygo est une application web de planification de voyage qui permet de centraliser les informations d'un sejour dans une interface unique.

L'utilisateur peut:
- creer et gerer ses voyages
- planifier ses activites, transports et hebergements
- suivre son budget
- visualiser son agenda et son itineraire sur carte
- partager un voyage avec d'autres utilisateurs
- exporter un resume en PDF

Objectif principal:
- simplifier l'organisation d'un voyage
- reduire la dispersion des informations (notes, couts, etapes, lieux)
- faciliter la collaboration autour d'un meme voyage

## 2. Objectifs du produit

L'application doit permettre:
- la gestion complete du cycle de vie d'un voyage (creation, lecture, mise a jour, suppression)
- la planification jour par jour des activites et deplacements
- la visualisation des etapes dans un agenda interactif
- la visualisation geographique des lieux sur carte
- le suivi budgetaire (previsionnel vs reel)
- le partage d'un voyage (lecture seule ou edition)
- l'export d'un rapport de synthese en PDF

## 3. Utilisateurs cibles

Le produit s'adresse a:
- voyageurs individuels
- couples
- groupes d'amis
- familles
- toute personne souhaitant preparer un voyage de facon structuree

## 4. Perimetre fonctionnel (etat actuel)

## 4.1 Authentification et compte utilisateur (Livre)

Fonctionnalites:
- inscription
- connexion
- deconnexion
- verification d'email existant
- mot de passe oublie
- reinitialisation de mot de passe
- edition profil (prenom, nom)
- changement email
- changement mot de passe
- suppression du compte (avec suppression des donnees associees)

Regles:
- routes protegees par authentification
- verification de force du mot de passe pour operations sensibles

## 4.2 Gestion des voyages (Livre)

Fonctionnalites:
- creation d'un voyage
- consultation d'un voyage
- mise a jour d'un voyage
- suppression d'un voyage
- liste des voyages proprietaire + voyages partages

Donnees principales d'un voyage:
- nom
- destination
- date de debut
- date de fin
- nombre de personnes (selon formulaire)
- budget global (si renseigne)
- notes / resume (si renseigne)

Comportement metier notable:
- si la destination change, les elements de planning dependants peuvent etre purges pour eviter les incoherences

## 4.3 Partage et collaboration (Livre)

Fonctionnalites:
- partage d'un voyage par email
- gestion des partages existants
- modification des droits d'un collaborateur
- suppression d'un acces partage

Niveaux d'acces:
- owner: proprietaire complet
- edit: edition autorisee
- read: lecture seule

Regles:
- seul le proprietaire gere les partages
- un utilisateur en lecture seule ne peut pas modifier le voyage

## 4.4 Planning et agenda (Livre)

Fonctionnalites:
- navigation sur les jours du voyage
- affichage agenda des etapes
- ajout/edition/suppression d'activites
- ajout/edition/suppression de transports
- integration des hebergements dans la logique de planning
- edition inline et modales selon les sections

Donnees activite:
- titre
- lieu
- date
- horaire
- duree
- cout estime
- description

Donnees transport:
- type de transport
- point de depart / arrivee
- date
- horaire
- duree
- cout

Regles:
- controle de conflits d'horaire (selon metadata de planning)
- propagation des parametres de voyage dans la navigation interne (planning, agenda, resume, carte, budget)

## 4.5 Exploration d'activites (Livre)

Fonctionnalites:
- suggestions d'activites par destination
- filtres thematiques (monuments, nature, culture, etc.)
- integration OpenTripMap pour les points d'interet
- enrichissement details de lieux
- insertion d'une suggestion dans le planning du voyage

Sources externes:
- OpenTripMap
- geocodage destination (OpenStreetMap/Nominatim en fallback)

## 4.6 Carte interactive (Livre)

Fonctionnalites:
- affichage des activites localisees sur carte
- affichage de marqueurs et traces d'itineraire
- filtrage des points par jour
- recentrage automatique selon les donnees disponibles

Technologies:
- Leaflet
- OpenStreetMap

## 4.7 Resume et synthese (Livre)

Fonctionnalites:
- vue de synthese du voyage
- consolidation activites/transports/hebergements
- indicateurs budgetaires et etapes
- visualisation cartographique integree dans le resume

## 4.8 Budget (Livre)

Fonctionnalites:
- lignes budgetaires par categorie
- suivi prevu vs reel
- filtres par voyage/categorie
- totaux et indicateurs
- repartition visuelle (camembert)
- ajout rapide de depenses liees au transport/hebergement
- mode local (fallback stockage navigateur) et mode API

Categories supportees:
- transport
- logement
- activites
- repas
- shopping
- autre

## 4.9 Notes personnelles (Livre)

Fonctionnalites:
- creation, lecture, mise a jour, suppression de notes
- integration API via ressource notes

## 4.10 Export (Partiellement livre)

Fonctionnalites disponibles:
- export PDF du resume voyage (jsPDF)

Fonctionnalites non observees dans l'etat actuel:
- export Excel
- export ICS (calendrier)

## 4.11 Pages institutionnelles et informationnelles (Livre)

Pages disponibles:
- a propos
- contact
- politique de confidentialite
- conditions d'utilisation

## 5. Navigation et experience utilisateur

Le menu principal doit proposer un acces clair a:
- Voyages
- Planning
- Resume
- Agenda
- Carte
- Budget
- Parametres

Exigences UX:
- parcours simple entre les pages du voyage courant
- adaptation desktop et mobile
- etats vides comprehensibles
- feedback explicite en cas d'erreur API

## 6. Architecture technique

## 6.1 Stack
- Front-end: HTML, CSS, JavaScript (modules)
- Back-end: Node.js + Express
- Base de donnees et auth: Supabase
- Cartographie: Leaflet + OpenStreetMap
- Export PDF: jsPDF
- Infrastructure locale: docker-compose + nginx (selon environnement)

## 6.2 Organisation logicielle
Architecture de type MVC separee par couches:
- Model: acces et representation des donnees
- View: pages HTML + assets UI
- Controller: logique metier front et back

## 6.3 API backend exposee
Domaines principaux:
- /api/auth
- /api/trips
- /api/transports
- /api/activities
- /api/{accommodations|activities|budgets|notes}

Securite:
- routes privees protegees par middleware d'authentification
- limitation de debit API active (rate limiting)

## 7. Regles de donnees et droits

Regles d'acces:
- seul le proprietaire supprime un voyage
- seuls les utilisateurs autorises accedent a un voyage partage
- permissions read/edit appliquees en front et backend

Integrite:
- suppression en cascade des donnees associees lors de la suppression de compte/voyage
- validations de base sur les champs requis

## 8. Livrables attendus (version actuelle)

Livrables disponibles:
- application web fonctionnelle (front + API)
- gestion authentification complete
- gestion voyages CRUD
- gestion planning/agenda/carte/budget
- partage de voyage avec permissions
- export PDF du resume
- pages legales et parametres utilisateur

## 9. Backlog prioritaire (prochaines versions)

Fonctionnalites a realiser en priorite:
- export Excel des donnees voyage
- export ICS compatible Google/Apple Calendar
- systeme de rappels automatiques (notifications)
- finalisation d'un module calendrier dedié si besoin (au-dela de l'agenda actuel)

Fonctionnalites envisageables ensuite:
- lien public de partage (mode lecture)
- application mobile (Android/iOS)
- mode hors ligne
- import automatique de reservations (emails)
- suggestions intelligentes personnalisees

## 10. Criteres d'acceptation (mise en production)

Le produit est considere conforme si:
- un utilisateur peut creer un compte et se connecter
- un voyage peut etre cree, modifie, partage, puis supprime sans incoherence
- les activites/transports/hebergements sont visibles dans planning, agenda, resume et carte
- le budget affiche des totaux coherents
- les droits read/edit sont respectes
- l'export PDF produit un document exploitable
- les erreurs API courantes sont gerees avec messages utilisateur
