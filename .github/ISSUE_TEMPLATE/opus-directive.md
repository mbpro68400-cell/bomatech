---
name: Opus directive
about: Tâche dictée par Opus 4.7 dans Claude.ai, à exécuter par Claude Code en local
title: "[OPUS] "
labels: ["opus-directive"]
assignees: []
---

## Contexte

<!-- Pourquoi cette tâche existe, quel problème elle résout -->

## Action demandée

<!--
Liste les actions concrètes, dans l'ordre.
Sois précis sur les fichiers à modifier, les commandes à lancer, les valeurs à utiliser.
-->

1. 
2. 
3. 

## Fichiers concernés

<!-- Liste les fichiers à créer / modifier / supprimer -->

- [ ] `path/to/file1.ts` — créer / modifier / supprimer
- [ ] `path/to/file2.tsx` — créer / modifier / supprimer

## Critères de validation

<!--
Comment savoir que c'est fait correctement.
Au moins un critère doit être testable manuellement.
-->

- [ ] Le code compile sans erreur (`pnpm build` dans `apps/web`)
- [ ] Le test manuel suivant passe : ___
- [ ] Le déploiement Vercel passe en `Ready`

## Plan de rollback

<!--
Si ça plante en prod, comment revenir en arrière.
Souvent : `git revert <sha>` du commit concerné.
-->

`git revert <sha>` puis `git push origin main` — Vercel redéploiera automatiquement la version précédente.

## Notes Opus

<!-- Réflexions, alternatives envisagées, pièges à éviter -->

---

**Référence conversation Claude.ai** : <!-- URL si applicable -->
