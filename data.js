export const workouts = {
 A: {title:'Superiores', focus:'Peito, costas, ombros e braços', icon:'↗', exercises:[['supino-maquina','Supino máquina','10–12','Peitoral, tríceps e ombros','Ajuste o banco para as alças ficarem na linha do peito. Empurre e retorne com controle.','Mantenha as costas apoiadas e não trave os cotovelos.'],['puxada-frontal','Puxada frontal','10–12','Costas e bíceps','Puxe a barra à frente até a parte alta do peito e retorne devagar.','Evite balançar o tronco ou puxar atrás da nuca.'],['remada-baixa','Remada baixa','10–12','Costas e bíceps','Com o tronco estável, puxe a alça em direção ao abdômen e retorne.','Evite arredondar as costas ou usar impulso.'],['desenvolvimento-maquina','Desenvolvimento máquina','10–12','Ombros e tríceps','Ajuste o banco e empurre as alças para cima, retornando com controle.','Use amplitude confortável, sem arquear as costas.'],['triceps-polia','Tríceps polia','10–12','Tríceps','Mantenha os cotovelos próximos do corpo e estenda os braços na polia.','Não use o peso do tronco para empurrar.'],['rosca-halteres','Rosca halteres','10–12','Bíceps','Flexione os cotovelos levando os halteres para cima e desça lentamente.','Mantenha o tronco parado e os punhos alinhados.']]},
 B: {title:'Pernas e glúteos',focus:'Base forte, movimento com controle',icon:'↓',exercises:[['leg-press','Leg press 45°','10–12','Quadríceps e glúteos','Apoie os pés na plataforma, flexione os joelhos e empurre com controle.','Mantenha quadril e costas apoiados; não trave os joelhos.'],['elevacao-pelvica','Elevação pélvica','10–12','Glúteos','Com os pés apoiados, eleve o quadril e retorne lentamente.','Evite exagerar na extensão da lombar.'],['mesa-flexora','Mesa flexora','10–12','Posteriores das coxas','Ajuste o equipamento e flexione os joelhos, aproximando os calcanhares.','Mantenha o quadril apoiado e evite impulso.'],['cadeira-extensora','Cadeira extensora','10–12','Quadríceps','Alinhe os joelhos ao eixo da máquina e estenda as pernas com controle.','Ajuste o apoio e evite movimentos bruscos.'],['panturrilha-sentado','Panturrilha sentado','12–15','Panturrilhas','Eleve os calcanhares e retorne devagar, mantendo os pés apoiados na base.','Não quique e use amplitude confortável.'],['prancha','Prancha','20–30 segundos','Abdômen e estabilizadores','Apoie antebraços e pontas dos pés, mantendo o corpo alinhado.','Respire normalmente e evite deixar o quadril cair.','tempo']]},
 C: {title:'Corpo inteiro',focus:'Um pouco de tudo. Por vocês.',icon:'✳',exercises:[['agachamento-halter','Agachamento com halter','10–12','Quadríceps e glúteos','Segure o halter próximo ao peito, flexione quadril e joelhos e retorne.','Mantenha os pés apoiados e os joelhos alinhados.'],['remada-articulada','Remada articulada','10–12','Costas e bíceps','Ajuste o apoio e puxe as alças em direção ao tronco.','Mantenha o peito apoiado e evite elevar os ombros.'],['supino-inclinado','Supino inclinado','10–12','Peitoral, ombros e tríceps','No banco inclinado, empurre a carga para cima e retorne com controle.','Mantenha os pés firmes e use amplitude confortável.'],['cadeira-abdutora','Cadeira abdutora','12–15','Glúteos','Sentado com as costas apoiadas, afaste os joelhos e retorne lentamente.','Evite impulso e não force além da amplitude confortável.'],['terra-romeno','Levantamento terra romeno com halteres','8–10','Posteriores e glúteos','Com joelhos levemente flexionados, leve o quadril para trás e desça os halteres próximos às pernas.','Mantenha a coluna estável; pare antes de perder o alinhamento.'],['dead-bug','Dead bug','8–10 por lado','Abdômen e estabilizadores','Deitado, eleve braços e pernas. Estenda braço e perna opostos alternadamente.','Mantenha o tronco estável e não arqueie a lombar.','repeticoes']]}
};
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const weekday = date => new Date(date+'T12:00:00-03:00').getUTCDay();
export const recommended = date => ({1:'B',3:'A',5:'C'})[weekday(date)] || 'B';
export const sessionKey = (profile,date,workout) => `${profile}:${date}:${workout}`;
export const progress = session => Math.round(Object.values(session?.sets || {}).filter(s=>s.done).length/12*100);

export function lastExerciseSession(sessions, profile, date, exerciseId, excludedKey) {
  const candidates = Object.entries(sessions)
    .filter(([key, session]) => key !== excludedKey && session.profile === profile && session.date <= date)
    .sort(([aKey, a], [bKey, b]) => b.date.localeCompare(a.date) || Number(bKey.split(':')[3] || 0) - Number(aKey.split(':')[3] || 0));
  for (const [, session] of candidates) {
    const sets = [0, 1].map(index => ({index, ...session.sets[`${exerciseId}:${index}`]})).filter(set => set.done);
    if (sets.length) return {date: session.date, sets};
  }
  return null;
}

export function workoutSummary(sessions, profile, start, end) {
  const summary = {registered: 0, complete: 0, partial: 0, ongoing: 0};
  for (const [key, session] of Object.entries(sessions)) {
    if (session.profile !== profile || session.date < start || session.date >= end) continue;
    if (key === sessionKey(session.profile, session.date, session.workout)) {
      summary.ongoing++;
      continue;
    }
    summary.registered++;
    if (progress(session) === 100) summary.complete++;
    else summary.partial++;
  }
  return summary;
}

export const exercisePhotos={
  "supino-maquina": "Machine_Bench_Press",
  "puxada-frontal": "Wide-Grip_Lat_Pulldown",
  "remada-baixa": "Seated_Cable_Rows",
  "desenvolvimento-maquina": "Machine_Shoulder_Military_Press",
  "triceps-polia": "Triceps_Pushdown",
  "rosca-halteres": "Dumbbell_Bicep_Curl",
  "leg-press": "Leg_Press",
  "elevacao-pelvica": "Barbell_Hip_Thrust",
  "mesa-flexora": "Lying_Leg_Curls",
  "cadeira-extensora": "Leg_Extensions",
  "panturrilha-sentado": "Seated_Calf_Raise",
  "prancha": "Plank",
  "agachamento-halter": "Goblet_Squat",
  "remada-articulada": "Leverage_Iso_Row",
  "supino-inclinado": "Incline_Dumbbell_Press",
  "cadeira-abdutora": "Thigh_Abductor",
  "dead-bug": "Dead_Bug"
};
