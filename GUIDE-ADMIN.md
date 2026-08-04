# Guide d'administration — DS Nails

Ce guide décrit chaque écran de l'espace d'administration et ce que chaque action
produit réellement, y compris ses conséquences sur les comptes et sur le site
visible par les clientes.

**Accès** : connectez-vous, puis cliquez sur **Admin** dans la barre du haut.
Le bouton n'apparaît que pour un compte administrateur.

Sept onglets : **Réservations**, **Statistiques**, **Prestations**,
**Promotions**, **Horaires**, **Indisponibilités**, **Notifications**.

---

## La règle à retenir avant tout

Une réservation passe par quatre états :

| État | Signification | Compte dans le chiffre d'affaires ? |
|---|---|---|
| **En attente** | La cliente a réservé, vous n'avez pas encore validé | Non |
| **Confirmé** | Vous avez validé le rendez-vous | **Non** |
| **Terminé** | La prestation a été réalisée et réglée | **Oui** |
| **Annulé** | Le rendez-vous n'aura pas lieu | Non |

**Seules les réservations « Terminé » entrent dans les statistiques financières.**
Une réservation confirmée est un engagement, pas une recette : tant que vous ne
la marquez pas terminée, elle reste invisible dans le chiffre d'affaires, le
panier moyen et les classements.

Conséquence pratique : **si vous n'utilisez jamais le bouton « Terminer », votre
chiffre d'affaires restera à zéro.** Prenez l'habitude de clôturer les rendez-vous
passés.

Et son pendant : les prestations prises **au comptoir** n'existent nulle part
tant que vous ne les saisissez pas. Le § 1 explique comment les reporter.

---

## 1. Réservations

L'écran de travail quotidien.

### Les quatre compteurs du haut

| Compteur | Ce qu'il montre |
|---|---|
| **En attente** | Réservations à valider — c'est votre file d'attente |
| **Confirmées** | Rendez-vous validés, pas encore réalisés |
| **Aujourd'hui** | Rendez-vous du jour (en attente + confirmés) |
| **Jours suivants** | Rendez-vous à partir de demain |

Ces quatre compteurs ne comptent que ce qui reste à traiter : une réservation
terminée ou annulée n'y figure plus, et une prestation saisie à la main n'y
apparaît jamais.

### Filtrer la liste

- **Statut** : n'afficher qu'un état (en attente, confirmées, terminées, annulées).
- **Date** : une journée précise.
- **Recherche** : nom, téléphone ou e-mail, les trois en même temps.
- **Réinitialiser** remet les trois filtres à zéro.

Les filtres se combinent. Pour préparer votre journée : filtre **Date** sur
aujourd'hui, statut **Confirmées**.

### Les actions sur chaque ligne

**Confirmer** — disponible sur une réservation en attente. Elle passe en
« Confirmé ». Sans effet comptable.

**Terminer** — disponible sur une réservation confirmée, **une fois la prestation
achevée**, c'est-à-dire son heure de fin passée. Avant, le bouton n'apparaît
pas : la mention « À venir » ou « En cours » prend sa place, car une prestation
qui n'est pas rendue ne peut pas être encaissée. **Une fenêtre de confirmation s'ouvre** et rappelle la cliente, la
prestation, la date et surtout **le montant qui sera comptabilisé**. Validez
seulement si la prestation a été réalisée *et* réglée : ce montant entre
immédiatement dans le chiffre d'affaires, le panier moyen et les classements.

**Annuler** — disponible sur une réservation en attente ou confirmée. Le créneau
est libéré et redevient réservable. Action immédiate, sans confirmation.

> Une réservation annulée n'est jamais supprimée : elle reste dans la liste et
> alimente le taux de désistement.

**Actualiser** recharge la liste — utile si vous avez laissé la page ouverte
pendant que des clientes réservaient.

### Enregistrer une prestation faite sur place

Le salon reçoit plus de monde au comptoir qu'en ligne. Sans report, le chiffre
d'affaires affiché ne montre qu'une partie de votre activité. Le panneau
**« Prestation réalisée sur place »**, en haut de l'écran, sert à recopier le
cahier.

Cliquez sur **Enregistrer une prestation** pour déplier le formulaire.

| Champ | |
|---|---|
| **Prestation** | Celle qui a été réalisée. Les prestations masquées restent proposées : vous pouvez reporter une ancienne prestation |
| **Nom du client** | Obligatoire |
| **Date** | Aujourd'hui ou un jour passé. Une date future est refusée : une prestation à venir n'est pas encore réalisée |
| **Heure** | Heure de début |
| **Téléphone**, **Email** | Facultatifs |

Ensuite, la partie qui touche à la comptabilité :

- Cochez **« Une remise a été appliquée »** seulement s'il y a eu une remise, et
  saisissez le pourcentage consenti.
- Le **montant encaissé** s'affiche à droite et se recalcule à chaque frappe.
  C'est lui qui entrera dans vos comptes : vérifiez qu'il correspond à ce qui a
  été réglé avant de valider.

Si une promotion était en cours ce jour-là pour cette prestation, un bandeau
vous le rappelle, avec un bouton **« L'appliquer »**. Elle n'est jamais cochée
d'office : c'est ce que la cliente a **réellement payé** qui fait foi, pas ce
qu'elle aurait dû payer.

**Ajouter au chiffre d'affaires** enregistre la prestation directement en
« Terminé ». Elle apparaît aussitôt dans la liste et dans les statistiques.

> Une saisie manuelle n'est soumise à aucun contrôle de créneau : ni horaires
> d'ouverture, ni indisponibilité, ni chevauchement avec un autre rendez-vous.
> C'est voulu — le cahier fait autorité, et vous devez pouvoir reporter un
> dimanche même si le salon est marqué fermé.

---

## 2. Statistiques

### Le chiffre du mois

En haut, le **chiffre d'affaires du mois en cours**, avec l'écart en pourcentage
par rapport au mois précédent : flèche verte vers le haut, rouge vers le bas.
Le montant du mois précédent est rappelé entre parenthèses pour situer l'écart.

### Les cinq indicateurs

| Indicateur | Définition exacte |
|---|---|
| **CA cumulé** | Total de toutes les prestations **terminées**, depuis l'ouverture |
| **Panier moyen** | CA cumulé ÷ nombre de prestations terminées. Le diviseur est affiché sous le chiffre |
| **Réservations terminées** | Nombre de prestations clôturées. En note : combien sont confirmées mais pas encore terminées — **c'est votre rappel de ce qui reste à clôturer** |
| **Clients inscrits** | Comptes ayant vérifié leur adresse e-mail, hors administrateurs. En note : les inscriptions jamais confirmées |
| **Taux de désistement** | Annulées ÷ (annulées + confirmées + terminées). Les réservations en attente sont exclues du calcul : leur sort n'est pas encore décidé |

### Les trois faits marquants

**Prestation la plus réservée**, **créneau le plus demandé**, **client le plus
fidèle** — calculés sur les seules réservations terminées, sur tout l'historique.

Le créneau le plus demandé indique l'heure de début : « 14h – 15h » signifie que
c'est le créneau de 14 h qui est le plus choisi.

### Les deux filtres de période

Une seule rangée, au-dessus des graphiques :

- **Historique du chiffre d'affaires** : 6, 12 ou 24 mois — cadre le graphique du CA.
- **Courbe des réservations** : 14, 30 ou 90 jours — cadre la courbe d'activité
  et celle des clients inscrits.

### Les graphiques

**Chiffre d'affaires par mois** — une colonne par mois. Un mois sans prestation
terminée apparaît à zéro plutôt que d'être absent, pour que les creux se voient.

**Évolution des réservations** — nombre de rendez-vous **par jour**. Contrairement
aux montants, cette courbe compte toutes les réservations non annulées : c'est le
rythme de prise de rendez-vous, pas une donnée comptable. Survolez pour lire une
journée précise.

**Clients inscrits (email vérifié)** — cumul, jour après jour. La courbe ne
redescend jamais : elle démarre au total déjà atteint avant la période affichée.
L'en-tête indique le gain sur la période (« +4 sur la période »).

**Répartition par civilité** — anneau Femmes / Hommes / Non renseigné. Survolez
une part pour voir son effectif au centre. La part « Non renseigné » correspond
aux comptes créés avant l'ajout de ce champ à l'inscription.

**Prestations les plus réservées** et **Créneaux horaires les plus demandés** —
classements sur les prestations terminées. Le créneau le plus demandé vous
indique où concentrer votre disponibilité.

> Chaque graphique possède un dépliant **« Voir les données »** qui affiche les
> chiffres exacts sous forme de tableau. Utile pour recopier un montant ou
> vérifier une valeur difficile à lire à l'œil.

### Liste des clients

Tous les comptes inscrits, avec recherche (nom, e-mail, téléphone), filtre par
statut de compte (vérifié / en attente de confirmation) et pagination réglable
(10, 25 ou 50 par page).

Un compte **« En attente »** est une personne qui s'est inscrite sans jamais
cliquer le lien de confirmation reçu par e-mail : **elle ne peut pas se connecter**.

### Clients les plus fidèles

Classement par nombre de visites, avec le total dépensé et la date de dernière
visite. La mention **« Réservation en mode invité »** signale une réservation
prise sans compte : le téléphone est alors affiché en dessous, c'est votre seul
moyen de recontact.

### Deux précisions sur les montants

**Le prix est figé au moment de la réservation.** Si vous augmentez le tarif d'une
prestation — ou si vous lancez, puis arrêtez une promotion — les réservations
déjà passées gardent le prix qui leur a été appliqué. Votre historique ne se
réécrit pas.

**Tout repose sur le statut « Terminé ».** C'est le seul geste qui alimente la
comptabilité. Les prestations saisies à la main (§ 1) y entrent directement :
en ligne ou au comptoir, tout se retrouve dans les mêmes chiffres.

---

## 3. Prestations

### Les catégories, en haut de l'écran

Côté client, l'accueil ne montre **que les catégories**. C'est en ouvrant l'une
d'elles qu'on découvre ses prestations. Une prestation sans catégorie
**n'apparaît nulle part** : le bloc « Non classées » est votre liste des oublis.

- **Nouvelle catégorie** : tapez le nom, **Ajouter**.
- **Ajouter des prestations** ouvre une fenêtre où vous cochez plusieurs
  prestations d'un coup. Une prestation qui appartient déjà ailleurs est
  signalée « déjà dans "…" » — la valider la **déplace**, elle ne sera pas dans
  les deux.
- Vous pouvez aussi **faire glisser** une prestation d'une catégorie à l'autre.
- **Renommer**, **Supprimer** : supprimer une catégorie ne supprime aucune
  prestation, elles redeviennent simplement non classées — et disparaissent du
  site tant qu'elles ne sont pas reclassées.

### Ajouter une prestation

- **Nom** — celui que verront les clientes.
- **Catégorie** — obligatoire, c'est elle qui rend la prestation visible.
- **Heures** et **Minutes** — durée séparée en deux champs. L'aperçu sous la
  saisie confirme le résultat (« Durée : 1 h 30 »). Les minutes vont de 0 à 59 :
  au-delà, utilisez le champ Heures.
- **Prix (FCFA)**.
- **Photo** — déposez une image dans le cadre en pointillés, ou cliquez pour
  parcourir. **JPG ou PNG uniquement, 5 Mo maximum.**

La durée est déterminante : elle définit la longueur du créneau réservé et donc
le nombre de rendez-vous possibles dans une journée.

### Le tableau

Photo, nom, durée, prix, état, actions.

**Modifier** — la ligne devient éditable. Vous pouvez changer tous les champs et
remplacer la photo (l'ancienne est supprimée automatiquement). **Enregistrer** ou
**Annuler**.

**Masquer / Afficher** — une prestation masquée disparaît du site public mais
reste en base, avec son historique. **C'est l'action à privilégier** pour une
prestation que vous ne proposez plus temporairement.

**Supprimer** — définitif, avec demande de confirmation. Si des réservations y
sont rattachées, la suppression est **refusée** et un message vous invite à
masquer la prestation à la place.

> ⚠ **En cas de doute, masquez plutôt que de supprimer.** Une prestation
> supprimée emporte le lien avec son historique, donc une part de votre chiffre
> d'affaires. Masquer produit exactement le même effet côté client — la
> prestation disparaît du site — sans rien perdre.

> Une prestation sans photo s'affiche avec un emplacement gris côté client.
> Pensez à en ajouter une pour chaque prestation.

---

## 4. Promotions

Une remise en pourcentage, sur **toutes** les prestations ou sur **une seule**,
entre deux dates.

### Créer une promotion

| Champ | |
|---|---|
| **Nom** | Visible par la cliente sur l'écran de confirmation (« Offre de rentrée ») |
| **Remise (%)** | De 1 à 100 |
| **S'applique à** | « Toutes les prestations », ou une prestation précise |
| **Début**, **Fin** | Les deux dates sont **incluses** |

**La remise s'applique selon la date du rendez-vous, pas la date de
réservation.** Une cliente qui réserve aujourd'hui pour un rendez-vous après la
fin de la promotion paie le prix plein — et inversement.

### Ce que voit la cliente

Sur la liste des prestations, le prix public apparaît **barré**, suivi du prix
remisé et d'une pastille « −20 % ». L'écran de confirmation affiche le montant
exact qui sera facturé, avec le nom de la promotion.

### Le tableau

Chaque promotion porte un état, calculé à partir des dates :

| État | |
|---|---|
| **En cours** | Elle s'applique aujourd'hui |
| **Programmée** | Sa date de début n'est pas encore arrivée |
| **Terminée** | Sa date de fin est passée |
| **Désactivée** | Vous l'avez mise en pause |

- **Modifier** rend la ligne éditable.
- **Désactiver** l'interrompt sans la supprimer : les prix reviennent au tarif
  public. **Activer** la remet en service.
- **Supprimer** l'efface définitivement.

### Deux règles à connaître

**Si deux promotions se chevauchent, c'est la plus avantageuse qui s'applique —
elles ne s'additionnent jamais.** Une promotion générale à 20 % et une promotion
ciblée à 35 % sur les Braids donnent 35 % sur les Braids, pas 55 %.

**Supprimer ou désactiver une promotion ne change rien aux réservations déjà
prises.** Leur prix a été figé au moment de la réservation. Votre chiffre
d'affaires passé ne se réécrit jamais.

---

## 5. Horaires

Les horaires d'ouverture, un jour par ligne.

Pour chaque jour : une case **Fermé**, une heure d'**ouverture**, une heure de
**fermeture**. Les champs horaires se grisent quand le jour est coché fermé.

**Enregistrer** valide la ligne, **Annuler** revient à la valeur précédente. Les
deux boutons ne s'activent que si vous avez modifié quelque chose. L'heure de
fermeture doit être postérieure à l'heure d'ouverture.

### Ce que ça change côté client

Un jour coché **fermé** :

- s'affiche **« Fermé »** dans la carte Horaires de la page d'accueil ;
- apparaît **grisé et non sélectionnable** dans le choix de la date ;
- ne propose aucun créneau.

Les horaires d'ouverture définissent la plage dans laquelle les créneaux sont
calculés. Réduire l'amplitude d'une journée réduit mécaniquement le nombre de
rendez-vous possibles.

> La page d'accueil regroupe automatiquement les jours identiques : si du lundi
> au samedi vous ouvrez de 9 h à 19 h, elle affichera une seule ligne
> « Lundi – Samedi : 9h – 19h ».

---

## 6. Indisponibilités

Pour bloquer un moment précis sans toucher aux horaires habituels : congés,
formation, rendez-vous personnel.

### Bloquer un créneau

**Date**, **début**, **fin**, et un **motif** libre (facultatif, pour votre
mémoire — il n'est pas montré aux clientes). L'heure de fin doit être postérieure
à l'heure de début.

Pour bloquer une journée entière, couvrez toute l'amplitude d'ouverture, par
exemple 9 h – 19 h.

### Ce que ça change côté client

Les créneaux qui chevauchent la plage bloquée disparaissent. Si plus aucun
créneau ne reste, la date apparaît **grisée avec la mention « Indisponible »**
dans le choix de la date.

Le grisage dépend de la prestation choisie : un blocage de 9 h à 18 h laisse
encore de la place pour une prestation d'une heure à 18 h, mais aucune pour une
prestation de deux heures. La même date pourra donc être proposée ou refusée
selon la prestation.

Les indisponibilités passées restent affichées, en grisé, et peuvent être
supprimées à tout moment.

---

## 7. Notifications

Les messages WhatsApp envoyés au salon et aux clientes.

> **Rien ne part encore.** L'envoi attend un numéro WhatsApp dédié à
> l'application. En attendant, les messages sont bel et bien rédigés et
> conservés : cette page vous montre exactement ce qui sera envoyé, à qui et
> quand. Le jour où le numéro sera prêt, les messages en attente partiront sans
> qu'aucun soit perdu.

### Réglages

**Numéro qui reçoit les alertes du salon** — le vôtre. C'est là qu'arriveront
les avis de nouvelle réservation.

Deux interrupteurs :

| | Ce qu'il déclenche |
|---|---|
| **Alerter le salon** | Nouvelle réservation, annulation par une cliente |
| **Prévenir les clientes** | Confirmation, annulation par le salon, rappel 24 h avant le rendez-vous |

### Journal des messages

Quand, quel événement, destinataire, contenu, état. Un message **En attente**
n'est pas une erreur : c'est la file, normale tant que l'envoi n'est pas activé.

---

## Trois mentions vues côté client

Sur l'écran de choix de la date, une date grisée porte un motif :

| Mention | Cause | Où corriger |
|---|---|---|
| **Fermé** | Le jour est marqué fermé | Onglet **Horaires** |
| **Indisponible** | Un blocage couvre la journée | Onglet **Indisponibilités** |
| **Complet** | Tous les créneaux sont pris | Rien à corriger — c'est une bonne nouvelle |

---

## Votre compte

Depuis **Mon espace**, l'entrée **Paramètres du compte** permet de modifier votre
nom, votre civilité, votre adresse e-mail et votre mot de passe.

Le changement d'adresse et le changement de mot de passe **ferment votre session**
et demandent une reconnexion — par sécurité. Pour l'adresse e-mail, un code de
vérification à 6 chiffres est envoyé à la nouvelle adresse ; il est valable
10 minutes.

Votre session se ferme également d'elle-même **au bout de 24 heures**.
