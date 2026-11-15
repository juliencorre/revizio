# Contrats version complète

## État de l’application

Les types de `src/domain/model.ts` sont partagés par le client et le serveur. LearningData v1 garde les anciennes propriétés ; plans, english, readingRecords, spacedReviews, vocabularyLists et vocabularySessions sont optionnels pour migrer les premières sauvegardes. Le contexte expose toujours plans=[], vocabularyLists=[], vocabularySessions=[] et english={words:[],verbs:[],tenses:[],toolWords:[]} quand absents. Le vocabulaire d’un ancien répertoire anglais est repris comme liste si le champ vocabularyLists est absent ; un tableau explicitement vide est conservé.

Méthodes supplémentaires de useLearning :

- addPlan(input:PlanDraftInput):string ; updatePlan(id,updates:Partial<Omit<RevisionPlan,'id'>>):void ; deletePlan(id):void.
- publishPlan(id):{ok:boolean,error?:string} ; completePlanStep(planId,stepId):void ; postponePlan(id,examDate):{ok:boolean,error?:string}.
- updateEnglish(settings:EnglishSettings):void ; extractEnglish(sources:CourseSource[]):Promise<EnglishSettings>.
- updateSeries(id,updates):void (brouillon) ; deleteCourse(id) et deleteSeries(id) avec validation des références.
- startAttempt(seriesId,restartOrOptions?:boolean|{restart?:boolean,mode?:'practice'|'exam',timeLimitSeconds?:number}):string|null ; submitAttempt(id):void.
- childName, childGrade, profiles, activeProfileId, syncStatus, isDemo, serverAvailable exposés au contexte.

La publication du répertoire anglais crée le support de cours et sa série par `buildEnglishMaterial(settings)` exporté par domain/english.ts. Les anciennes tentatives gardent leurs snapshots.

## Plans

Domain planning.ts fournit buildRevisionSteps(input), planValidation(plan,courses), reschedulePlan(plan,newExamDate,today). Les parcours vers un exercice peuvent passer planId, stepId, mode=exam et minutes. À la fin, le store marque l’étape correspondante terminée.

## Serveur

Fastify + SQLite, famille privée, comptes parent/enfant, fichiers privés, jobs IA réels et asynchrones avec Ollama. Les endpoints /api/session, /profiles, /data, /uploads, /jobs, /ai/course, /ai/exercises, /ai/english, /settings et /backup sont coordonnés avec le propriétaire backend. GET /api/data?profileId renvoie {data,revision}; PUT /api/data reçoit {data,revision,profileId}. Conflit 409 renvoie data+revision. Les écritures enfant sont limitées aux réponses, lectures et étapes de leur propre profil.

Les modèles IA ne publient aucun contenu. Le parent relit les sources, la fiche et les corrections avant de partager.

## Vocabulaire

`VocabularyList` contient id, title, language (`english`, `spanish`, `latin`), status et words. Chaque mot a un id stable, un term et une translation ; les variantes acceptées sont séparées par un point-virgule. Une liste contient au plus 200 mots. Seul un parent peut créer, modifier, publier ou supprimer les listes. Les listes en brouillon sont filtrées dans la réponse serveur destinée à l’enfant.

Le contexte propose `saveVocabularyList(list)`, `deleteVocabularyList(id)`, `startVocabularySession(listId, mode, scope, restart?)`, `answerVocabulary(sessionId, questionId, response)` et `completeVocabulary(sessionId)`. Le mode vaut `to-french`, `from-french` ou `both` ; le périmètre vaut `all` ou `review` pour les mots non connus. Sans redémarrage explicite, une séance inachevée du même mode et périmètre est reprise.

`VocabularySession` conserve le titre et la langue de la liste, le mode, le périmètre, les dates, les questions et les réponses. Chaque question contient le mot, sa traduction, le sens et les variantes acceptées réellement présentés. Une modification ultérieure de la liste ne réécrit pas ce snapshot. Le serveur vérifie les questions des nouvelles séances contre les listes publiées, recalcule les corrections et interdit la modification des réponses enregistrées et des séances terminées. La persistance et les sauvegardes familiales conservent les deux collections.

`vocabularyProgress(list, sessions)` calcule le suivi par mot et par sens à partir des réponses écrites : à découvrir, en cours, à revoir ou connu. Deux réussites consécutives dans chaque sens sont nécessaires au statut connu ; une erreur remet le mot à revoir. Une modification du mot ou de sa traduction exclut les anciens résultats de ce mot du suivi courant, tout en conservant les anciennes séances. Les accents restent significatifs et la normalisation ne porte que sur la casse, les espaces et les équivalences Unicode. Le suivi reste propre au profil enfant associé aux données familiales.
