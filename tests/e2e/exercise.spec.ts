import {expect,test} from '@playwright/test';
import {initialData} from '../../src/domain/fixtures';
const practice=initialData.series.find(series=>series.id==='maths-relative-practice')!;
const storageKey='revizo.learning.v1';

test('répondre, reprendre après rechargement et conserver le bilan',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/student/exercise/${practice.id}`);
  const first=practice.questions[0];
  const wrong=first.choices.find(choice=>choice.id!==first.correctChoiceId)!;
  await page.getByTestId(`choice-${wrong.id}`).click();
  await page.getByTestId('verify-answer').click();
  await expect(page.getByText(first.explanation,{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}').attempts?.[0]?.answers.length,storageKey)).toBe(1);
  await page.reload();
  await expect(page.getByText(practice.questions[1].prompt,{exact:true})).toBeVisible();
  for(const question of practice.questions.slice(1)){
    await page.getByTestId(`choice-${question.correctChoiceId}`).click();
    await page.getByTestId('verify-answer').click();
    await expect(page.getByText(question.explanation,{exact:true})).toBeVisible();
    await page.getByTestId('next-question').click();
  }
  await expect(page.getByTestId('exercise-result')).toBeVisible();
  await expect(page.getByTestId('exercise-score')).toContainText('4');
  await expect.poll(()=>page.evaluate(key=>{
    const data=JSON.parse(localStorage.getItem(key)||'{}');
    return data.attempts?.filter((attempt:{completedAt?:string})=>!!attempt.completedAt).length;
  },storageKey)).toBe(1);
  await page.reload();
  await expect(page.getByTestId('exercise-result')).toBeVisible();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}').attempts.length,storageKey)).toBe(1);
  await page.goto('/student/progress');
  await expect(page.getByText('Addition de signes contraires',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('les cours en brouillon restent hors de l’espace enfant',async({page})=>{
  await page.goto('/student/subject/history-geography');
  await expect(page.getByText('Vivre dans une seigneurie',{exact:true})).toHaveCount(0);
  await page.goto('/student/course/history-middle-ages-draft');
  await expect(page.getByText('Ce cours n’est pas disponible',{exact:true})).toBeVisible();
});
