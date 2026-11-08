# Contrats du premier lot

## Données
`src/domain/model.ts` fait autorité. `src/domain/fixtures.ts` exporte `subjects: Subject[]` et `initialData: LearningData`.

## État partagé
`src/state/learning-store.tsx` exporte `LearningProvider` et `useLearning()` :
- `subjects`, `courses`, `series`, `attempts`, `reviewedCourseIds`, `isReady`, `storageError: string | null`.
- `addCourse(input: CourseDraftInput): string` crée un brouillon et renvoie son id.
- `updateCourse(id: string, updates: Partial<Omit<Course, 'id'>>): void`.
- `publishCourse(id: string): {ok: boolean; error?: string}`.
- `addSeries(input: SeriesDraftInput): string` crée un brouillon.
- `publishSeries(id: string): {ok: boolean; error?: string}`.
- `startAttempt(seriesId: string, restart?: boolean): string | null` reprend l'inachevée ou en crée une nouvelle.
- `answerQuestion(attemptId: string, questionId: string, choiceId: string, usedHint: boolean): void` enregistre une réponse une seule fois.
- `completeAttempt(attemptId: string): void` si toutes les questions ont une réponse.
- `markReviewed(courseId: string): void`.
- `resetDemo(): void`.

Les mutations sont synchrones dans React ; persistance asynchrone via AsyncStorage. La correction utilise le snapshot de questions d'une tentative. Les séries et fiches en brouillon ne sont jamais affichées à l'enfant.

## Routes et fichiers
- Root : `/`, composants partagés, thème, layout, configuration, documentation et intégration.
- Agent données : `src/domain/fixtures.ts`, `src/domain/learning.ts`, `src/state/**`, `tests/domain/**`.
- Agent élève : `src/features/child/**`, `src/app/student/**`.
- Agent parent : `src/features/parent/**`, `src/app/parent/**`.

## Navigation
Routes élève : `/student`, `/student/subject/[id]`, `/student/course/[id]`, `/student/exercises` (query subjectId optionnelle), `/student/exercise/[id]` (id de série), `/student/progress`.
Routes parent : `/parent`, `/parent/import`, `/parent/review/[id]`, `/parent/exercises`.
`AppShell`, `AppText`, `Card`, `Button`, `Badge`, `AppIcon`, `PageHeading`, `EmptyState`, `ProgressBar`, `Brand` sont exportés par `@/components/ui`. Voir signatures et tokens `@/theme`.

Le premier lot fonctionne sans clé IA : édition manuelle et cours de démonstration, avec absence de service IA clairement annoncée. Aucune simulation présentée comme de l'IA. Parent : import de sources puis édition/relecture ; création manuelle d'une série QCM avec correction relue avant publication. Les plans/anglais/audio sont prévus ensuite.
