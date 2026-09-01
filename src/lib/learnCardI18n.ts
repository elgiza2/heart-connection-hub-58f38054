// Lightweight localization for LearnCard UI strings.
// Detects locale from the card's own text content (script-based) and
// falls back to navigator.language. Unknown languages get English.

export type LearnLocale =
  | "en"
  | "ar"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "it"
  | "ru"
  | "zh"
  | "ja"
  | "ko"
  | "tr"
  | "hi"
  | "id"
  | "nl"
  | "pl"
  | "vi"
  | "th"
  | "fa"
  | "ur";

export type LearnStrings = {
  // shells / labels
  question_choose: string;
  select_all_correct: string;
  true_or_false: string;
  fill_blank: string;
  match_columns: string;
  checkin_label: string;
  checkin_default_q: string;
  visual_explanation: string;
  learning_map: string;
  setup_exam: string;
  exam_result: string;
  question_n_of_m: (i: number, n: number) => string;
  step_by_step: string;
  introduce_yourself: string;
  card: string;
  // statuses
  correct_answer: string;
  wrong_try_again: string;
  correct: string;
  wrong: string;
  all_correct: string;
  not_all_correct: string;
  // actions
  go_harder: string;
  explain_again: string;
  tell_teacher: string;
  write_note_teacher: string;
  send: string;
  confirm: string;
  choose: string;
  write_answer: string;
  submit_grading: string;
  sent_grading: string;
  your_answer: string;
  // checkin options
  opt_continue: string;
  opt_slow_down: string;
  opt_another_example: string;
  opt_take_break: string;
  // roadmap
  start_stage: string;
  // exam setup
  topic_placeholder: string;
  num_questions: string;
  duration_minutes: string;
  difficulty: string;
  diff_easy: string;
  diff_intermediate: string;
  diff_hard: string;
  question_types: string;
  type_mcq: string;
  type_tf: string;
  type_fill: string;
  type_justify: string;
  start_exam: string;
  // exam runner
  previous: string;
  next: string;
  finish_view_score: string;
  analyze_result: string;
  correct_of_total: (c: number, n: number) => string;
  // photo solve
  final_answer: string;
  try_similar: string;
  // mermaid
  cannot_draw: string;
  // fill answers
  correct_answer_is: (a: string) => string;
  correct_with_answer: (a: string) => string;
  // explain prompt sent to teacher
  my_answer_prefix: (text: string) => string;
  start_with_stage: (title: string) => string;
  solve_for_me: (q: string) => string;
  score_analysis: (c: number, n: number) => string;
  prepare_exam: (args: {
    topic: string;
    count: number;
    duration: number;
    difficulty: string;
    types: string;
  }) => string;
  on_correct_continue: string;
  on_wrong_simplify: string;
  // ── new card types ──
  flashcard_label: string;
  flashcard_flip: string;
  flashcard_knew: string;
  flashcard_almost: string;
  flashcard_didnt: string;
  ordering_label: string;
  ordering_hint: string;
  ordering_check: string;
  ordering_all_right: string;
  ordering_some_wrong: string;
  summary_label: string;
  summary_placeholder: string;
  summary_submit: string;
  scenario_label: string;
  scenario_outcome: string;
  scenario_best_choice: string;
  // ── laddered hints + streak celebration ──
  hint_use: string;
  hint_first_letter: string;
  hint_generic: string;
  hint_eliminated: string;
  streak_badge: (n: number) => string;
};


const en: LearnStrings = {
  question_choose: "Question — choose the answer",
  select_all_correct: "Select all correct answers",
  true_or_false: "True or false",
  fill_blank: "Fill in the blank",
  match_columns: "Match column A with column B",
  checkin_label: "Are you still with me?",
  checkin_default_q: "What do you think? Should we continue or is anything unclear?",
  visual_explanation: "Visual explanation",
  learning_map: "Learning map",
  setup_exam: "Set up exam",
  exam_result: "Exam result",
  question_n_of_m: (i, n) => `Question ${i} / ${n}`,
  step_by_step: "Step-by-step solution",
  introduce_yourself: "Introduce yourself in 30 seconds",
  card: "Card",
  correct_answer: "Correct answer",
  wrong_try_again: "Wrong — try again",
  correct: "Correct",
  wrong: "Wrong",
  all_correct: "All answers correct",
  not_all_correct: "Not all correct",
  go_harder: "Go harder →",
  explain_again: "Explain again",
  tell_teacher: "Tell the teacher",
  write_note_teacher: "Write a note for the teacher...",
  send: "Send",
  confirm: "Confirm",
  choose: "Choose...",
  write_answer: "Write your answer...",
  submit_grading: "Submit for grading",
  sent_grading: "Sent to teacher for grading ✓",
  your_answer: "Your answer...",
  opt_continue: "Continue",
  opt_slow_down: "Slow down a bit",
  opt_another_example: "Another example",
  opt_take_break: "Take a break",
  start_stage: "Start this stage →",
  topic_placeholder: "Topic (e.g.: algebra, ancient history)",
  num_questions: "Number of questions",
  duration_minutes: "Duration (minutes)",
  difficulty: "Difficulty",
  diff_easy: "Easy",
  diff_intermediate: "Intermediate",
  diff_hard: "Hard",
  question_types: "Question types",
  type_mcq: "Multiple choice",
  type_tf: "True/False",
  type_fill: "Fill in the blank",
  type_justify: "Justify/explain",
  start_exam: "Start the exam",
  previous: "← Previous",
  next: "Next →",
  finish_view_score: "Finish and view score",
  analyze_result: "Analyze my result →",
  correct_of_total: (c, n) => `${c} of ${n} correct`,
  final_answer: "Final answer",
  try_similar: "Try similar questions:",
  cannot_draw: "Could not draw shape",
  correct_answer_is: (a) => `Correct answer: ${a}`,
  correct_with_answer: (a) => `Correct — answer: ${a}`,
  my_answer_prefix: (t) =>
    `My answer: ${t}\n\n(Grade my answer and tell me what's right and what's wrong)`,
  start_with_stage: (title) => `Start with me at stage: ${title}`,
  solve_for_me: (q) => `Solve for me: ${q}`,
  score_analysis: (c, n) => `Score ${c}/${n}. Analyze my weak points and tell me what to review.`,
  prepare_exam: ({ topic, count, duration, difficulty, types }) =>
    `Prepare an exam for me:\n- Topic: ${topic}\n- Number of questions: ${count}\n- Duration: ${duration} minutes\n- Difficulty: ${difficulty}\n- Question types: ${types}\n\nStart the exam directly in one reply as exam_runner.`,
  on_correct_continue: "You answered correctly — continue and give a harder question",
  on_wrong_simplify: "You answered wrong — explain again and simplify more",
  flashcard_label: "Flashcard — tap to flip",
  flashcard_flip: "Tap to see the answer",
  flashcard_knew: "I knew it",
  flashcard_almost: "Almost",
  flashcard_didnt: "I didn't",
  ordering_label: "Put the steps in order",
  ordering_hint: "Tap to swap positions",
  ordering_check: "Check my order",
  ordering_all_right: "Perfect order",
  ordering_some_wrong: "Some steps are out of order",
  summary_label: "Teach it back in your own words",
  summary_placeholder: "In 2–4 sentences, explain what you just learned…",
  summary_submit: "Submit summary",
  scenario_label: "Real scenario — choose your next move",
  scenario_outcome: "What happens next",
  scenario_best_choice: "Best choice",
  hint_use: "Hint",
  hint_first_letter: "Starts with",
  hint_generic: "Think about the definition you just read",
  hint_eliminated: "One wrong option was crossed out",
  streak_badge: (n) => `${n} in a row!`,
};


const ar: LearnStrings = {
  question_choose: "سؤال — اختر الإجابة",
  select_all_correct: "اختر كل الإجابات الصحيحة",
  true_or_false: "صح أم خطأ",
  fill_blank: "أكمل الفراغ",
  match_columns: "وصِّل العمود (أ) بالعمود (ب)",
  checkin_label: "هل ما زلت معي؟",
  checkin_default_q: "إيه رأيك؟ نكمل ولا في حاجة مش واضحة؟",
  visual_explanation: "شرح مرئي",
  learning_map: "خريطة التعلم",
  setup_exam: "إعداد الامتحان",
  exam_result: "نتيجة الامتحان",
  question_n_of_m: (i, n) => `سؤال ${i} من ${n}`,
  step_by_step: "حل خطوة بخطوة",
  introduce_yourself: "عرّف نفسك في 30 ثانية",
  card: "بطاقة",
  correct_answer: "إجابة صحيحة",
  wrong_try_again: "خطأ — حاول تاني",
  correct: "صحيح",
  wrong: "خطأ",
  all_correct: "كل الإجابات صحيحة",
  not_all_correct: "مش كل الإجابات صح",
  go_harder: "صعّب أكتر ←",
  explain_again: "اشرح تاني",
  tell_teacher: "كلّم المعلم",
  write_note_teacher: "اكتب ملاحظة للمعلم...",
  send: "إرسال",
  confirm: "تأكيد",
  choose: "اختر...",
  write_answer: "اكتب إجابتك...",
  submit_grading: "ابعت للتصحيح",
  sent_grading: "تم الإرسال للمعلم للتصحيح ✓",
  your_answer: "إجابتك...",
  opt_continue: "كمّل",
  opt_slow_down: "هدّي السرعة شوية",
  opt_another_example: "مثال تاني",
  opt_take_break: "خد بريك",
  start_stage: "ابدأ من هنا ←",
  topic_placeholder: "الموضوع (مثلًا: الجبر، التاريخ الإسلامي)",
  num_questions: "عدد الأسئلة",
  duration_minutes: "المدة (دقيقة)",
  difficulty: "الصعوبة",
  diff_easy: "سهل",
  diff_intermediate: "متوسط",
  diff_hard: "صعب",
  question_types: "أنواع الأسئلة",
  type_mcq: "اختيار من متعدد",
  type_tf: "صح/خطأ",
  type_fill: "أكمل الفراغ",
  type_justify: "علّل/اشرح",
  start_exam: "ابدأ الامتحان",
  previous: "→ السابق",
  next: "التالي ←",
  finish_view_score: "إنهاء وعرض النتيجة",
  analyze_result: "حلّل نتيجتي ←",
  correct_of_total: (c, n) => `${c} من ${n} صحيحة`,
  final_answer: "الإجابة النهائية",
  try_similar: "جرّب أسئلة مشابهة:",
  cannot_draw: "ما قدرتش أرسم الشكل",
  correct_answer_is: (a) => `الإجابة الصحيحة: ${a}`,
  correct_with_answer: (a) => `صحيح — الإجابة: ${a}`,
  my_answer_prefix: (t) => `إجابتي: ${t}\n\n(صحّح إجابتي وقلي إيه الصح وإيه الغلط)`,
  start_with_stage: (title) => `ابدأ معايا من مرحلة: ${title}`,
  solve_for_me: (q) => `حلّ لي: ${q}`,
  score_analysis: (c, n) => `نتيجتي ${c}/${n}. حلّل نقاط ضعفي وقلي أراجع إيه.`,
  prepare_exam: ({ topic, count, duration, difficulty, types }) =>
    `جهّز لي امتحان:\n- الموضوع: ${topic}\n- عدد الأسئلة: ${count}\n- المدة: ${duration} دقيقة\n- المستوى: ${difficulty}\n- أنواع الأسئلة: ${types}\n\nابدأ الامتحان مباشرة في رد واحد كـ exam_runner.`,
  on_correct_continue: "إجابتي صحيحة — كمّل وادّيني سؤال أصعب",
  on_wrong_simplify: "إجابتي غلط — اشرح تاني وبسّط أكتر",
  flashcard_label: "بطاقة تذكّر — دوس علشان تقلبها",
  flashcard_flip: "اضغط علشان تشوف الإجابة",
  flashcard_knew: "كنت عارف",
  flashcard_almost: "تقريباً",
  flashcard_didnt: "مكنتش عارف",
  ordering_label: "رتّب الخطوات",
  ordering_hint: "دوس علشان تبدّل المواقع",
  ordering_check: "اتأكد من الترتيب",
  ordering_all_right: "ترتيب مثالي",
  ordering_some_wrong: "في خطوات مش في مكانها",
  summary_label: "اشرحها بكلامك انت (Feynman)",
  summary_placeholder: "في 2-4 جمل، اشرح اللي اتعلمته دلوقتي…",
  summary_submit: "ابعت الشرح",
  scenario_label: "سيناريو حقيقي — اختار خطوتك",
  scenario_outcome: "اللي هيحصل بعدها",
  scenario_best_choice: "الاختيار الأفضل",
  hint_use: "تلميح",
  hint_first_letter: "يبدأ بـ",
  hint_generic: "فكّر في التعريف اللي قريته دلوقتي",
  hint_eliminated: "اتشطب اختيار واحد غلط",
  streak_badge: (n) => `${n} صح ورا بعض!`,
};


const es: LearnStrings = {
  ...en,
  question_choose: "Pregunta — elige la respuesta",
  select_all_correct: "Selecciona todas las correctas",
  true_or_false: "Verdadero o falso",
  fill_blank: "Completa el espacio",
  match_columns: "Une la columna A con la B",
  checkin_label: "¿Sigues conmigo?",
  checkin_default_q: "¿Qué opinas? ¿Continuamos o algo no está claro?",
  visual_explanation: "Explicación visual",
  learning_map: "Mapa de aprendizaje",
  setup_exam: "Configurar examen",
  exam_result: "Resultado del examen",
  question_n_of_m: (i, n) => `Pregunta ${i} / ${n}`,
  step_by_step: "Solución paso a paso",
  introduce_yourself: "Preséntate en 30 segundos",
  card: "Tarjeta",
  correct_answer: "Respuesta correcta",
  wrong_try_again: "Incorrecto — intenta de nuevo",
  correct: "Correcto",
  wrong: "Incorrecto",
  all_correct: "Todas correctas",
  not_all_correct: "No todas correctas",
  go_harder: "Más difícil →",
  explain_again: "Explica otra vez",
  tell_teacher: "Dile al profesor",
  write_note_teacher: "Escribe una nota para el profesor...",
  confirm: "Confirmar",
  choose: "Elige...",
  write_answer: "Escribe tu respuesta...",
  submit_grading: "Enviar para calificar",
  sent_grading: "Enviado al profesor ✓",
  your_answer: "Tu respuesta...",
  opt_continue: "Continuar",
  opt_slow_down: "Más despacio",
  opt_another_example: "Otro ejemplo",
  opt_take_break: "Tomar un descanso",
  start_stage: "Empezar esta etapa →",
  topic_placeholder: "Tema (ej.: álgebra, historia antigua)",
  num_questions: "Número de preguntas",
  duration_minutes: "Duración (minutos)",
  difficulty: "Dificultad",
  diff_easy: "Fácil",
  diff_intermediate: "Intermedio",
  diff_hard: "Difícil",
  question_types: "Tipos de pregunta",
  type_mcq: "Opción múltiple",
  type_tf: "Verdadero/Falso",
  type_fill: "Completar",
  type_justify: "Justificar/explicar",
  start_exam: "Iniciar examen",
  previous: "← Anterior",
  next: "Siguiente →",
  finish_view_score: "Terminar y ver resultado",
  analyze_result: "Analizar mi resultado →",
  correct_of_total: (c, n) => `${c} de ${n} correctas`,
  final_answer: "Respuesta final",
  try_similar: "Prueba preguntas similares:",
  cannot_draw: "No se pudo dibujar la forma",
  correct_answer_is: (a) => `Respuesta correcta: ${a}`,
  correct_with_answer: (a) => `Correcto — respuesta: ${a}`,
  my_answer_prefix: (t) =>
    `Mi respuesta: ${t}\n\n(Califica mi respuesta y dime qué está bien y qué está mal)`,
  start_with_stage: (title) => `Empieza conmigo en la etapa: ${title}`,
  solve_for_me: (q) => `Resuelve para mí: ${q}`,
  score_analysis: (c, n) => `Puntuación ${c}/${n}. Analiza mis puntos débiles.`,
  on_correct_continue: "Respondí bien — continúa y dame una pregunta más difícil",
  on_wrong_simplify: "Respondí mal — explica otra vez y simplifica más",
};

const fr: LearnStrings = {
  ...en,
  question_choose: "Question — choisis la réponse",
  select_all_correct: "Sélectionne toutes les bonnes réponses",
  true_or_false: "Vrai ou faux",
  fill_blank: "Complète le blanc",
  match_columns: "Associe la colonne A à la B",
  checkin_label: "Tu es toujours avec moi ?",
  checkin_default_q: "Qu'en penses-tu ? On continue ou quelque chose n'est pas clair ?",
  visual_explanation: "Explication visuelle",
  learning_map: "Carte d'apprentissage",
  setup_exam: "Configurer l'examen",
  exam_result: "Résultat de l'examen",
  question_n_of_m: (i, n) => `Question ${i} / ${n}`,
  step_by_step: "Solution étape par étape",
  introduce_yourself: "Présente-toi en 30 secondes",
  card: "Carte",
  correct_answer: "Bonne réponse",
  wrong_try_again: "Faux — réessaie",
  correct: "Correct",
  wrong: "Faux",
  all_correct: "Toutes correctes",
  not_all_correct: "Pas toutes correctes",
  go_harder: "Plus difficile →",
  explain_again: "Explique encore",
  tell_teacher: "Dis au prof",
  write_note_teacher: "Écris une note au prof...",
  confirm: "Confirmer",
  choose: "Choisir...",
  write_answer: "Écris ta réponse...",
  submit_grading: "Soumettre pour notation",
  sent_grading: "Envoyé au prof ✓",
  your_answer: "Ta réponse...",
  opt_continue: "Continuer",
  opt_slow_down: "Ralentir",
  opt_another_example: "Un autre exemple",
  opt_take_break: "Faire une pause",
  start_stage: "Commencer cette étape →",
  topic_placeholder: "Sujet (ex. : algèbre, histoire ancienne)",
  num_questions: "Nombre de questions",
  duration_minutes: "Durée (minutes)",
  difficulty: "Difficulté",
  diff_easy: "Facile",
  diff_intermediate: "Intermédiaire",
  diff_hard: "Difficile",
  question_types: "Types de questions",
  type_mcq: "Choix multiple",
  type_tf: "Vrai/Faux",
  type_fill: "Compléter",
  type_justify: "Justifier/expliquer",
  start_exam: "Commencer l'examen",
  previous: "← Précédent",
  next: "Suivant →",
  finish_view_score: "Terminer et voir le score",
  analyze_result: "Analyser mon résultat →",
  correct_of_total: (c, n) => `${c} sur ${n} correctes`,
  final_answer: "Réponse finale",
  try_similar: "Essaie des questions similaires :",
  cannot_draw: "Impossible de dessiner la forme",
  correct_answer_is: (a) => `Bonne réponse : ${a}`,
  correct_with_answer: (a) => `Correct — réponse : ${a}`,
  my_answer_prefix: (t) =>
    `Ma réponse : ${t}\n\n(Corrige ma réponse et dis-moi ce qui est juste et faux)`,
  start_with_stage: (title) => `Commence avec moi à l'étape : ${title}`,
  solve_for_me: (q) => `Résous pour moi : ${q}`,
  score_analysis: (c, n) => `Score ${c}/${n}. Analyse mes faiblesses.`,
  on_correct_continue: "Bonne réponse — continue et donne-moi plus difficile",
  on_wrong_simplify: "Mauvaise réponse — réexplique et simplifie plus",
};

const de: LearnStrings = {
  ...en,
  question_choose: "Frage — wähle die Antwort",
  select_all_correct: "Wähle alle richtigen Antworten",
  true_or_false: "Richtig oder falsch",
  fill_blank: "Lücke ausfüllen",
  match_columns: "Spalte A mit B verbinden",
  checkin_label: "Bist du noch dabei?",
  visual_explanation: "Visuelle Erklärung",
  learning_map: "Lernkarte",
  setup_exam: "Prüfung einrichten",
  exam_result: "Prüfungsergebnis",
  step_by_step: "Schritt-für-Schritt-Lösung",
  correct_answer: "Richtige Antwort",
  wrong_try_again: "Falsch — nochmal versuchen",
  correct: "Richtig",
  wrong: "Falsch",
  all_correct: "Alle richtig",
  not_all_correct: "Nicht alle richtig",
  go_harder: "Schwerer →",
  explain_again: "Nochmal erklären",
  tell_teacher: "Lehrer benachrichtigen",
  confirm: "Bestätigen",
  submit_grading: "Zur Bewertung senden",
  your_answer: "Deine Antwort...",
  opt_continue: "Weiter",
  opt_slow_down: "Langsamer",
  opt_another_example: "Anderes Beispiel",
  opt_take_break: "Pause machen",
  start_exam: "Prüfung starten",
  previous: "← Zurück",
  next: "Weiter →",
  diff_easy: "Leicht",
  diff_intermediate: "Mittel",
  diff_hard: "Schwer",
};

const pt: LearnStrings = {
  ...en,
  question_choose: "Pergunta — escolha a resposta",
  select_all_correct: "Selecione todas as corretas",
  true_or_false: "Verdadeiro ou falso",
  fill_blank: "Complete a lacuna",
  match_columns: "Ligue a coluna A com a B",
  checkin_label: "Ainda está comigo?",
  visual_explanation: "Explicação visual",
  learning_map: "Mapa de aprendizagem",
  setup_exam: "Configurar prova",
  exam_result: "Resultado da prova",
  step_by_step: "Solução passo a passo",
  correct_answer: "Resposta correta",
  wrong_try_again: "Errado — tente de novo",
  correct: "Correto",
  wrong: "Errado",
  all_correct: "Todas corretas",
  not_all_correct: "Nem todas corretas",
  go_harder: "Mais difícil →",
  explain_again: "Explique de novo",
  tell_teacher: "Avise o professor",
  confirm: "Confirmar",
  submit_grading: "Enviar para corrigir",
  your_answer: "Sua resposta...",
  opt_continue: "Continuar",
  opt_slow_down: "Mais devagar",
  opt_another_example: "Outro exemplo",
  opt_take_break: "Fazer pausa",
  start_exam: "Começar prova",
  previous: "← Anterior",
  next: "Próximo →",
  diff_easy: "Fácil",
  diff_intermediate: "Intermediário",
  diff_hard: "Difícil",
};

const it: LearnStrings = {
  ...en,
  question_choose: "Domanda — scegli la risposta",
  select_all_correct: "Seleziona tutte le corrette",
  true_or_false: "Vero o falso",
  fill_blank: "Completa lo spazio",
  match_columns: "Abbina la colonna A con la B",
  checkin_label: "Sei ancora con me?",
  visual_explanation: "Spiegazione visiva",
  learning_map: "Mappa di apprendimento",
  setup_exam: "Imposta esame",
  exam_result: "Risultato esame",
  step_by_step: "Soluzione passo dopo passo",
  correct_answer: "Risposta corretta",
  wrong_try_again: "Sbagliato — riprova",
  correct: "Corretto",
  wrong: "Sbagliato",
  all_correct: "Tutte corrette",
  not_all_correct: "Non tutte corrette",
  go_harder: "Più difficile →",
  explain_again: "Spiega ancora",
  tell_teacher: "Dillo all'insegnante",
  confirm: "Conferma",
  submit_grading: "Invia per valutazione",
  your_answer: "La tua risposta...",
  opt_continue: "Continua",
  opt_slow_down: "Rallenta",
  opt_another_example: "Altro esempio",
  opt_take_break: "Pausa",
  start_exam: "Inizia esame",
  previous: "← Precedente",
  next: "Avanti →",
  diff_easy: "Facile",
  diff_intermediate: "Intermedio",
  diff_hard: "Difficile",
};

const ru: LearnStrings = {
  ...en,
  question_choose: "Вопрос — выбери ответ",
  select_all_correct: "Выбери все правильные",
  true_or_false: "Верно или неверно",
  fill_blank: "Заполни пропуск",
  match_columns: "Сопоставь колонки А и Б",
  checkin_label: "Ты ещё со мной?",
  visual_explanation: "Визуальное объяснение",
  learning_map: "Карта обучения",
  setup_exam: "Настроить экзамен",
  exam_result: "Результат экзамена",
  step_by_step: "Пошаговое решение",
  correct_answer: "Правильный ответ",
  wrong_try_again: "Неверно — попробуй ещё",
  correct: "Верно",
  wrong: "Неверно",
  all_correct: "Все верно",
  not_all_correct: "Не все верно",
  go_harder: "Сложнее →",
  explain_again: "Объясни ещё раз",
  tell_teacher: "Сообщить учителю",
  confirm: "Подтвердить",
  submit_grading: "Отправить на проверку",
  your_answer: "Твой ответ...",
  opt_continue: "Продолжить",
  opt_slow_down: "Помедленнее",
  opt_another_example: "Другой пример",
  opt_take_break: "Перерыв",
  start_exam: "Начать экзамен",
  previous: "← Назад",
  next: "Далее →",
  diff_easy: "Лёгкий",
  diff_intermediate: "Средний",
  diff_hard: "Сложный",
};

const zh: LearnStrings = {
  ...en,
  question_choose: "题目 — 选择答案",
  select_all_correct: "选出所有正确答案",
  true_or_false: "判断对错",
  fill_blank: "填空",
  match_columns: "把 A 列和 B 列连起来",
  checkin_label: "你还在吗？",
  visual_explanation: "图示讲解",
  learning_map: "学习路线",
  setup_exam: "设置考试",
  exam_result: "考试结果",
  step_by_step: "分步解答",
  correct_answer: "回答正确",
  wrong_try_again: "错了 — 再试试",
  correct: "正确",
  wrong: "错误",
  all_correct: "全部正确",
  not_all_correct: "并非全部正确",
  go_harder: "再难一点 →",
  explain_again: "再讲一次",
  tell_teacher: "告诉老师",
  confirm: "确认",
  submit_grading: "提交评分",
  your_answer: "你的答案...",
  opt_continue: "继续",
  opt_slow_down: "慢一点",
  opt_another_example: "再来一个例子",
  opt_take_break: "休息一下",
  start_exam: "开始考试",
  previous: "← 上一题",
  next: "下一题 →",
  diff_easy: "简单",
  diff_intermediate: "中等",
  diff_hard: "困难",
};

const ja: LearnStrings = {
  ...en,
  question_choose: "問題 — 答えを選んでね",
  select_all_correct: "正しい答えをすべて選択",
  true_or_false: "正しいか間違いか",
  fill_blank: "空欄を埋めよう",
  match_columns: "A列とB列を結ぼう",
  checkin_label: "まだついてきてる？",
  visual_explanation: "図で説明",
  learning_map: "学習マップ",
  setup_exam: "試験の設定",
  exam_result: "試験結果",
  step_by_step: "ステップごとの解説",
  correct_answer: "正解",
  wrong_try_again: "不正解 — もう一度",
  correct: "正解",
  wrong: "不正解",
  all_correct: "全問正解",
  not_all_correct: "全部は正解じゃないよ",
  go_harder: "もっと難しく →",
  explain_again: "もう一度説明",
  tell_teacher: "先生に伝える",
  confirm: "確定",
  submit_grading: "採点に出す",
  your_answer: "あなたの答え...",
  opt_continue: "続ける",
  opt_slow_down: "ゆっくり",
  opt_another_example: "別の例",
  opt_take_break: "休憩",
  start_exam: "試験開始",
  previous: "← 前へ",
  next: "次へ →",
  diff_easy: "簡単",
  diff_intermediate: "普通",
  diff_hard: "難しい",
};

const ko: LearnStrings = {
  ...en,
  question_choose: "문제 — 답을 골라봐",
  select_all_correct: "정답을 모두 선택",
  true_or_false: "참 또는 거짓",
  fill_blank: "빈칸 채우기",
  match_columns: "A열과 B열 연결",
  checkin_label: "아직 따라오고 있어?",
  visual_explanation: "시각적 설명",
  learning_map: "학습 지도",
  setup_exam: "시험 설정",
  exam_result: "시험 결과",
  step_by_step: "단계별 풀이",
  correct_answer: "정답",
  wrong_try_again: "오답 — 다시 시도",
  correct: "맞음",
  wrong: "틀림",
  all_correct: "모두 정답",
  not_all_correct: "전부 정답은 아님",
  go_harder: "더 어렵게 →",
  explain_again: "다시 설명",
  tell_teacher: "선생님께 알리기",
  confirm: "확인",
  submit_grading: "채점 제출",
  your_answer: "너의 답...",
  opt_continue: "계속",
  opt_slow_down: "천천히",
  opt_another_example: "다른 예시",
  opt_take_break: "잠깐 쉬기",
  start_exam: "시험 시작",
  previous: "← 이전",
  next: "다음 →",
  diff_easy: "쉬움",
  diff_intermediate: "보통",
  diff_hard: "어려움",
};

const tr: LearnStrings = {
  ...en,
  question_choose: "Soru — cevabı seç",
  select_all_correct: "Tüm doğru cevapları seç",
  true_or_false: "Doğru ya da yanlış",
  fill_blank: "Boşluğu doldur",
  match_columns: "A ve B sütunlarını eşleştir",
  checkin_label: "Hâlâ benimle misin?",
  visual_explanation: "Görsel açıklama",
  learning_map: "Öğrenme haritası",
  setup_exam: "Sınav kur",
  exam_result: "Sınav sonucu",
  step_by_step: "Adım adım çözüm",
  correct_answer: "Doğru cevap",
  wrong_try_again: "Yanlış — tekrar dene",
  correct: "Doğru",
  wrong: "Yanlış",
  all_correct: "Hepsi doğru",
  not_all_correct: "Hepsi doğru değil",
  go_harder: "Daha zoru →",
  explain_again: "Tekrar açıkla",
  tell_teacher: "Öğretmene söyle",
  confirm: "Onayla",
  submit_grading: "Değerlendirmeye gönder",
  your_answer: "Cevabın...",
  opt_continue: "Devam",
  opt_slow_down: "Yavaşla",
  opt_another_example: "Başka örnek",
  opt_take_break: "Mola ver",
  start_exam: "Sınava başla",
  previous: "← Önceki",
  next: "Sonraki →",
  diff_easy: "Kolay",
  diff_intermediate: "Orta",
  diff_hard: "Zor",
};

const hi: LearnStrings = {
  ...en,
  question_choose: "प्रश्न — उत्तर चुनें",
  select_all_correct: "सभी सही उत्तर चुनें",
  true_or_false: "सही या गलत",
  fill_blank: "रिक्त स्थान भरें",
  match_columns: "स्तंभ A को B से मिलाएँ",
  checkin_label: "क्या आप अभी भी मेरे साथ हैं?",
  visual_explanation: "दृश्य व्याख्या",
  learning_map: "लर्निंग मैप",
  setup_exam: "परीक्षा सेट करें",
  exam_result: "परीक्षा परिणाम",
  step_by_step: "चरण-दर-चरण समाधान",
  correct_answer: "सही उत्तर",
  wrong_try_again: "गलत — फिर कोशिश करें",
  correct: "सही",
  wrong: "गलत",
  all_correct: "सभी सही",
  not_all_correct: "सभी सही नहीं",
  go_harder: "और कठिन →",
  explain_again: "फिर समझाएँ",
  tell_teacher: "शिक्षक को बताएँ",
  confirm: "पुष्टि करें",
  submit_grading: "जाँच के लिए भेजें",
  your_answer: "आपका उत्तर...",
  opt_continue: "जारी रखें",
  opt_slow_down: "धीरे चलें",
  opt_another_example: "एक और उदाहरण",
  opt_take_break: "थोड़ा ब्रेक",
  start_exam: "परीक्षा शुरू करें",
  previous: "← पिछला",
  next: "अगला →",
  diff_easy: "आसान",
  diff_intermediate: "मध्यम",
  diff_hard: "कठिन",
};

const id: LearnStrings = {
  ...en,
  question_choose: "Soal — pilih jawaban",
  select_all_correct: "Pilih semua yang benar",
  true_or_false: "Benar atau salah",
  fill_blank: "Isi titik-titik",
  match_columns: "Cocokkan kolom A dengan B",
  checkin_label: "Masih ikut?",
  visual_explanation: "Penjelasan visual",
  learning_map: "Peta belajar",
  setup_exam: "Atur ujian",
  exam_result: "Hasil ujian",
  step_by_step: "Penyelesaian langkah demi langkah",
  correct_answer: "Jawaban benar",
  wrong_try_again: "Salah — coba lagi",
  correct: "Benar",
  wrong: "Salah",
  all_correct: "Semua benar",
  not_all_correct: "Tidak semua benar",
  go_harder: "Lebih sulit →",
  explain_again: "Jelaskan lagi",
  tell_teacher: "Beritahu guru",
  confirm: "Konfirmasi",
  submit_grading: "Kirim untuk dinilai",
  your_answer: "Jawabanmu...",
  opt_continue: "Lanjut",
  opt_slow_down: "Pelan-pelan",
  opt_another_example: "Contoh lain",
  opt_take_break: "Istirahat",
  start_exam: "Mulai ujian",
  previous: "← Sebelumnya",
  next: "Selanjutnya →",
  diff_easy: "Mudah",
  diff_intermediate: "Sedang",
  diff_hard: "Sulit",
};

const nl: LearnStrings = {
  ...en,
  correct: "Goed",
  wrong: "Fout",
  confirm: "Bevestig",
  opt_continue: "Doorgaan",
  opt_slow_down: "Langzamer",
  opt_another_example: "Ander voorbeeld",
  opt_take_break: "Pauze",
  previous: "← Vorige",
  next: "Volgende →",
  diff_easy: "Makkelijk",
  diff_intermediate: "Gemiddeld",
  diff_hard: "Moeilijk",
};
const pl: LearnStrings = {
  ...en,
  correct: "Poprawnie",
  wrong: "Źle",
  confirm: "Potwierdź",
  opt_continue: "Kontynuuj",
  opt_slow_down: "Wolniej",
  opt_another_example: "Inny przykład",
  opt_take_break: "Przerwa",
  previous: "← Poprzedni",
  next: "Dalej →",
  diff_easy: "Łatwy",
  diff_intermediate: "Średni",
  diff_hard: "Trudny",
};
const vi: LearnStrings = {
  ...en,
  correct: "Đúng",
  wrong: "Sai",
  confirm: "Xác nhận",
  opt_continue: "Tiếp tục",
  opt_slow_down: "Chậm lại",
  opt_another_example: "Ví dụ khác",
  opt_take_break: "Nghỉ",
  previous: "← Trước",
  next: "Tiếp →",
  diff_easy: "Dễ",
  diff_intermediate: "Trung bình",
  diff_hard: "Khó",
};
const th: LearnStrings = {
  ...en,
  correct: "ถูก",
  wrong: "ผิด",
  confirm: "ยืนยัน",
  opt_continue: "ไปต่อ",
  opt_slow_down: "ช้าลง",
  opt_another_example: "ตัวอย่างอื่น",
  opt_take_break: "พัก",
  previous: "← ก่อนหน้า",
  next: "ถัดไป →",
  diff_easy: "ง่าย",
  diff_intermediate: "ปานกลาง",
  diff_hard: "ยาก",
};
const fa: LearnStrings = {
  ...ar,
  question_choose: "سؤال — جواب را انتخاب کن",
  correct: "درست",
  wrong: "اشتباه",
  confirm: "تأیید",
  opt_continue: "ادامه",
  opt_slow_down: "آهسته‌تر",
  opt_another_example: "مثال دیگر",
  opt_take_break: "استراحت",
  previous: "→ قبلی",
  next: "بعدی ←",
  diff_easy: "آسان",
  diff_intermediate: "متوسط",
  diff_hard: "سخت",
};
const ur: LearnStrings = {
  ...ar,
  question_choose: "سوال — جواب چنیں",
  correct: "درست",
  wrong: "غلط",
  confirm: "تصدیق",
  opt_continue: "جاری رکھیں",
  previous: "→ پچھلا",
  next: "اگلا ←",
};

const DICTS: Record<LearnLocale, LearnStrings> = {
  en,
  ar,
  es,
  fr,
  de,
  pt,
  it,
  ru,
  zh,
  ja,
  ko,
  tr,
  hi,
  id,
  nl,
  pl,
  vi,
  th,
  fa,
  ur,
};

// Script-based detection from the card's own visible text.
// This wins over navigator.language because the AI replies in the user's language.
function detectFromText(text: string): LearnLocale | null {
  if (!text) return null;
  const s = text;
  // Persian / Urdu use Arabic script but with distinguishing letters
  if (/[\u067E\u0686\u0698\u06AF\u06CC\u06A9]/.test(s)) return "fa"; // پ چ ژ گ ی ک
  if (/[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06D2]/.test(s)) return "ur";
  if (/[\u0600-\u06FF]/.test(s)) return "ar";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(s)) return "ja"; // hiragana/katakana
  if (/[\uAC00-\uD7AF]/.test(s)) return "ko";
  if (/[\u4E00-\u9FFF]/.test(s)) return "zh";
  if (/[\u0900-\u097F]/.test(s)) return "hi";
  if (/[\u0E00-\u0E7F]/.test(s)) return "th";
  if (/[\u0400-\u04FF]/.test(s)) return "ru";
  // Latin-script European languages — quick keyword sniffing
  const lower = s.toLowerCase();
  if (/\b(qué|cómo|cuál|porque|para|está|también|años?)\b/.test(lower)) return "es";
  if (/\b(qu'est|c'est|pourquoi|comment|aussi|très|être)\b/.test(lower)) return "fr";
  if (/\b(was|wie|warum|sind|nicht|auch|für|über)\b/.test(lower)) return "de";
  if (/\b(o que|porquê|como|também|está|são|você)\b/.test(lower)) return "pt";
  if (/\b(che cosa|perché|come|anche|sono|della|degli)\b/.test(lower)) return "it";
  if (/\b(nedir|nasıl|neden|için|değil|olduğu)\b/.test(lower)) return "tr";
  if (/\b(apa|bagaimana|kenapa|untuk|tidak|sudah|adalah)\b/.test(lower)) return "id";
  if (/\b(wat|hoe|waarom|niet|voor|maar|omdat)\b/.test(lower)) return "nl";
  if (/\b(co to|jak|dlaczego|jest|nie|dla|aby)\b/.test(lower)) return "pl";
  if (/\b(là gì|tại sao|như thế nào|không|được|của)\b/.test(lower)) return "vi";
  return null;
}

function fromNavigator(): LearnLocale {
  try {
    const lang = (navigator?.language || "en").toLowerCase();
    const code = lang.split("-")[0];
    if (code in DICTS) return code as LearnLocale;
  } catch {
    /* ignore */
  }
  return "en";
}

export function detectLearnLocale(...contentSamples: (string | undefined | null)[]): LearnLocale {
  for (const s of contentSamples) {
    const hit = detectFromText(s || "");
    if (hit) return hit;
  }
  return fromNavigator();
}

export function getLearnStrings(locale: LearnLocale): LearnStrings {
  return DICTS[locale] || en;
}

export function t(locale: LearnLocale): LearnStrings {
  return getLearnStrings(locale);
}
