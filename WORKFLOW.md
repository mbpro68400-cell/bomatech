# Workflow Opus 4.7 ↔ Claude Code

> Comment on fait avancer bomatech sans copier-coller à la main.

---

## Acteurs

- **Toi (Mag68400)** : tu coordonnes, tu valides, tu testes en prod
- **Opus 4.7** (Claude.ai web/mobile) : conseille, conçoit, rédige les directives techniques sous forme d'issues
- **Claude Code** (CLI local) : exécute les issues, modifie le code, push, surveille les builds
- **GitHub** : pont asynchrone entre Opus et Claude Code via les issues
- **Vercel** : redéploie automatiquement à chaque push sur `main`

---

## Schéma de flux

```
TOI                    OPUS 4.7              GITHUB              CLAUDE CODE          VERCEL
 │                        │                     │                      │                  │
 ├──"opus, fais X"───────►│                     │                      │                  │
 │                        │                     │                      │                  │
 │◄──"voici la directive"─┤                     │                      │                  │
 │                        │                     │                      │                  │
 ├──crée issue #N─────────────────────────────►●                      │                  │
 │  (copy-paste prêt)                            │                      │                  │
 │                                               │                      │                  │
 ├──"claude-code, fais l'issue #N"─────────────────────────────────────►│                  │
 │                                               │  ◄──lit issue────────┤                  │
 │                                               │                      │  exécute         │
 │                                               │  ◄──commits + push───┤                  │
 │                                               │                      │ ─── trigger ────►│
 │                                               │  ◄──ferme issue──────┤                  │ build
 │                                               │                      │  ◄── status ─────┤
 │                                               │                      │                  │
 │◄────────────────────────────────────────────"issue fermée, build Ready"─                │
 │                                               │                      │                  │
 ├──teste en prod──────────────────────────────────────────────────────────────────────────►
 │                                                                                          │
 │  si KO : retour vers Opus                                                                │
 │  si OK : on passe à l'issue suivante                                                     │
```

---

## Règles d'engagement

### Ce que fait Opus

- Rédige les directives **suffisamment précises** pour que Claude Code n'ait pas à inventer
- **Cite les fichiers exacts** à modifier (chemins absolus depuis la racine du repo)
- **Donne les valeurs littérales** (URLs, regex, payloads) plutôt que des descriptions vagues
- **Anticipe les pièges** : connaît les apprentissages des sessions précédentes (voir `CONTEXT.md`)
- **Découpe en issues atomiques** : 1 issue = 1 fonctionnalité ou 1 fix, pas plus
- Inclut un **plan de rollback** dans chaque issue

### Ce que fait Claude Code

- Lit `CONTEXT.md` au début de chaque session pour se mettre à jour
- Lit l'issue **en entier** avant d'agir
- Exécute uniquement ce qui est demandé, **pas plus**
- Si quelque chose semble manquant ou risqué : commente l'issue et attend
- Crée une branche dédiée par issue : `opus-directive/<issue-number>-<slug>`
- Push une PR plutôt qu'un commit direct sur `main` quand la modif est risquée
- Une fois mergée, ferme l'issue avec un récap des fichiers modifiés
- **Ne touche JAMAIS** : `database/migrations/` (migrations existantes), variables d'env de production, secrets, sans autorisation explicite

### Ce que tu fais (toi)

- Tu copies-colles le contenu généré par Opus dans une nouvelle issue GitHub
- Tu lances Claude Code dans le repo : `claude` puis "exécute l'issue #N"
- Tu testes en prod après chaque PR mergée
- Si OK : tu retournes vers Opus avec "issue #N OK, suite ?"
- Si KO : tu retournes vers Opus avec le message d'erreur précis

---

## Format type d'une session de travail

### Ouverture (5 minutes)

```
Toi → Opus (Claude.ai) :
"Salut Opus, on reprend bomatech. Statut : <ce que tu observes>"

Opus → Toi :
"OK, issue #N à créer. Voici le contenu à coller :
<contenu structuré>"
```

### Exécution (10-30 minutes)

```
Toi → GitHub :
[colle le contenu, crée l'issue]

Toi → Claude Code (terminal) :
"claude" puis "Lis CONTEXT.md, puis exécute l'issue #N. Demande si tu doutes."

Claude Code →
[lit, exécute, commit, push, ferme l'issue]
```

### Validation (5 minutes)

```
Toi → bomatech.vercel.app :
[teste la fonctionnalité]

Toi → Opus :
"Issue #N OK / KO avec <erreur>"
```

### Boucle

On enchaîne sur l'issue suivante, ou Opus diagnostique le KO.

---

## Anti-patterns à éviter

❌ **Une issue qui contient 5 fixes différents** → la PR est ingérable, le rollback impossible
❌ **Une issue floue genre "améliore le dashboard"** → Claude Code va inventer
❌ **Claude Code qui fait des modifs non demandées** ("tant que j'y suis...") → casse le contrat
❌ **Toi qui pousse direct sur main sans passer par les issues** → on perd la trace
❌ **Modification de SQL/migrations sans nouvelle migration numérotée** → impossible à reproduire

---

## Setup initial (à faire une fois)

### 1. Installer le MCP GitHub dans Claude Code

```bash
claude mcp add github
```

Il te demandera un Personal Access Token GitHub. Crée-le ici :
https://github.com/settings/tokens/new

Scopes nécessaires : `repo`, `workflow`. Expiration : 90 jours minimum.

### 2. Vérifier l'accès

Dans Claude Code :
```
> liste les issues ouvertes du repo mbpro68400-cell/bomatech
```

Si ça répond, le MCP est OK.

### 3. Cloner le template d'issue

Le template `opus-directive.md` est dans `.github/ISSUE_TEMPLATE/`.
Quand tu cliqueras "New issue" sur GitHub, tu auras le choix entre une issue blanche et le template Opus.

---

## En cas de désaccord entre Opus et Claude Code

Si Claude Code dit "cette directive ne marchera pas parce que X", il :
1. **Ne tente rien**.
2. Commente l'issue avec son objection précise.
3. Attend une réponse.

Toi tu fais le pont :
1. Tu copies son commentaire chez Opus.
2. Opus ré-évalue, propose un nouveau plan ou maintient sa directive.
3. Tu transmets à Claude Code, qui décide.

C'est lent **mais propre**. Mieux que de pousser une connerie en prod.

---

**Dernière mise à jour** : 2026-04-26
