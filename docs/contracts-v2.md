# Contrats version complète

## État de l’application

Les types de `src/domain/model.ts` sont partagés par le client et le serveur. LearningData v1 garde les anciennes propriétés ; plans, english, readingRecords et spacedReviews sont optionnels pour migrer les premières sauvegardes. Le contexte expose toujours plans=[] et english={words:[],verbs:[],tenses:[],toolWords:[]} quand absents.

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
