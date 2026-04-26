# Positionnement légal

## Ce que Bomatech EST

- Un outil de **pilotage financier** : visualisation, simulation, alertes.
- Un copilote pour **le dirigeant**, centré sur la décision.
- Complémentaire du logiciel de comptabilité et de l'expert-comptable.

## Ce que Bomatech N'EST PAS

- ❌ Un logiciel de **comptabilité** (pas de tenue de livres, pas de bilan officiel).
- ❌ Un outil de **conseil fiscal** personnalisé.
- ❌ Un **conseil en investissement**.
- ❌ Un établissement de paiement ni un **agrégateur bancaire agréé** (on passe par Bridge, qui est AISP agréé ACPR).

## Réglementations applicables

### DSP2 (Directive Services de Paiement)

Pour l'accès aux comptes bancaires, Bomatech utilise un **AISP agréé** (Bridge). Bomatech n'a pas besoin d'agrément propre. Le consentement de l'utilisateur est géré côté Bridge.

### RGPD

- Hébergement EU (Supabase région Francfort, Fly.io région CDG ou AMS).
- Consentement explicite au moment de la connexion bancaire.
- Droit d'accès, de rectification, d'effacement → endpoints `/api/v1/me/*` à prévoir.
- Audit log sur toutes les modifications sensibles.
- Rétention : 10 ans pour les données comptables (obligation légale française), 2 ans pour les logs d'accès.

### Facture électronique (2026-2027)

Calendrier officiel :
- **Sept 2026** : toutes les entreprises doivent pouvoir **recevoir** des factures électroniques (Factur-X).
- **Sept 2026** : grandes entreprises et ETI doivent **émettre** au format Factur-X.
- **Sept 2027** : PME et TPE doivent émettre.

Bomatech devra supporter l'import Factur-X (PDF/A-3 avec XML embarqué) en v2.

## Disclaimers à afficher

Dans l'UI, systématiquement :

> Bomatech est un outil de pilotage. Pour vos déclarations fiscales, obligations comptables, et décisions d'investissement, consultez votre expert-comptable.

En pied de page :

> Bomatech n'est ni un établissement de paiement, ni un logiciel de comptabilité au sens légal. Les projections sont indicatives et ne constituent pas un conseil personnalisé.
