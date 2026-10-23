/**
 * What students get to see of a question's answer material. These notes
 * must match the code (a teacher may otherwise write private notes in a
 * field that students later read):
 *  - criteria: portal.getResult returns every rubric item with
 *    behaald/niet behaald once results are visible and the teacher used
 *    the checklist (also for a Toets);
 *  - model solution / model answer: help.solutions, only when the afname's
 *    "Modeloplossing tonen" allows it (default after the last attempt for
 *    Oefenen and Zelfstudie, always "Nooit" for a Toets: studentSettings);
 *  - the grading notes (rubric text) are never sent to students.
 */

export const OPEN_QUESTION_VISIBILITY_NOTE =
  "Open vragen kijk je zelf na. De toelichting voor het nakijken zien alleen docenten. Gebruik je bij het nakijken de criteria, dan ziet de leerling ze bij het resultaat, met per criterium behaald of niet behaald. Het modelantwoord ziet de leerling alleen als de afname modeloplossingen toont: standaard bij Oefenen na de laatste poging, nooit bij een Toets.";

export const CODE_QUESTION_VISIBILITY_NOTE =
  "De startcode ziet de leerling in de editor. De modeloplossing ziet de leerling alleen als de afname dat toestaat (instelling ‘Modeloplossing tonen’): standaard bij Oefenen na de laatste poging, nooit bij een Toets.";
