import storyData from '../content/cuento.json';

const app = document.querySelector('#app');

let story;
let position = { page: 0, fragment: 0 };
let speaking = false;
let voices = [];
let recognition = null;
let shouldListen = false;
const activatedHints = new Set();

const voiceOptions = {
  alegre: { rate: 1.08, pitch: 1.45 },
  grave: { rate: 0.88, pitch: 0.72 },
  suave: { rate: 0.96, pitch: 1.18 },
  normal: { rate: 1, pitch: 1 }
};

function getCurrent() {
  return story.paginas[position.page].fragmentos[position.fragment];
}

function totalFragments() {
  return story.paginas.reduce((count, page) => count + page.fragmentos.length, 0);
}

function completedFragments() {
  return story.paginas.slice(0, position.page).reduce((count, page) => count + page.fragmentos.length, 0) + position.fragment;
}

function loadVoices() {
  voices = window.speechSynthesis?.getVoices?.() ?? [];
}

function characterFor(id) {
  return story.personajes.find((character) => character.id === id);
}

function escapeHtml(text) {
  const element = document.createElement('span');
  element.textContent = text;
  return element.innerHTML;
}

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hintId(hint) {
  return `${position.page}-${position.fragment}-${hint.frase}`;
}

function formatNarration(fragment) {
  let text = escapeHtml(fragment.texto);
  const phrases = [...new Set((fragment.disparadores ?? []).map((hint) => hint.frase))]
    .sort((first, second) => second.length - first.length);

  for (const phrase of phrases) {
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(${escapedPhrase})`, 'gi'), '<strong class="voice-hint">$1</strong>');
  }
  return text;
}

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function stopListening() {
  shouldListen = false;
  if (recognition) {
    recognition.onend = null;
    recognition.abort();
    recognition = null;
  }
}

function triggerEffect(hint) {
  const id = hintId(hint);
  if (activatedHints.has(id)) return;
  activatedHints.add(id);

  const illustration = document.querySelector('.illustration-placeholder');
  const caption = document.querySelector('#effect-caption');
  const status = document.querySelector('#status');
  illustration?.classList.add('effect-active', `effect-${hint.efecto}`);
  if (caption) caption.textContent = `✦ ${hint.etiqueta ?? '¡Efecto activado!'}`;
  if (status) status.textContent = `¡Escuché “${hint.frase}”!`;
}

function startListening(fragment) {
  const hints = fragment.disparadores ?? [];
  if (fragment.lector !== 'adulto' || hints.length === 0) return;

  const Recognition = speechRecognitionConstructor();
  const status = document.querySelector('#status');
  if (!Recognition) {
    if (status) status.textContent = 'Tu navegador no reconoce voz. Puedes continuar normalmente.';
    return;
  }

  stopListening();
  shouldListen = true;
  recognition = new Recognition();
  recognition.lang = 'es-CL';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const heard = normalize(Array.from(event.results).map((result) => result[0].transcript).join(' '));
    for (const hint of hints) {
      if (heard.includes(normalize(hint.frase))) triggerEffect(hint);
    }
  };
  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      shouldListen = false;
      if (status) status.textContent = 'No se activó el micrófono. Puedes seguir leyendo y avanzar manualmente.';
    }
  };
  recognition.onend = () => {
    if (shouldListen && getCurrent() === fragment) {
      try { recognition.start(); } catch { /* ya está iniciándose */ }
    }
  };
  try {
    recognition.start();
    if (status) status.textContent = 'Escuchando las palabras destacadas…';
  } catch {
    if (status) status.textContent = 'Toca continuar y vuelve a intentarlo si quieres usar el micrófono.';
  }
}

function renderStart() {
  app.innerHTML = `
    <section class="welcome-shell">
      <div class="stars" aria-hidden="true">✦ &nbsp;·&nbsp; ✧ &nbsp;·&nbsp; ✦</div>
      <div class="cover-illustration" aria-label="Espacio reservado para la portada">
        <span class="moon">☾</span>
        <span class="spark one">✦</span><span class="spark two">✧</span><span class="spark three">✦</span>
        <small>Portada próximamente</small>
      </div>
      <p class="eyebrow">CUENTO INTERACTIVO</p>
      <h1>${escapeHtml(story.titulo)}</h1>
      <p class="subtitle">${escapeHtml(story.subtitulo ?? 'Un cuento para leer acompañados')}</p>
      <div class="reading-note"><span>◉</span> Tú lees la narración. Los personajes cobran voz.</div>
      <button class="primary-button start-button" id="start" type="button">
        <span>Comenzar cuento</span><span aria-hidden="true">→</span>
      </button>
      <p class="audio-hint">Activa el sonido para escuchar a los personajes.</p>
    </section>`;
  document.querySelector('#start').addEventListener('click', startStory);
}

function renderStory() {
  stopListening();
  const page = story.paginas[position.page];
  const fragment = getCurrent();
  const character = characterFor(fragment.personaje);
  const appReads = fragment.lector === 'app';
  const progress = ((completedFragments() + 1) / totalFragments()) * 100;
  const isLast = position.page === story.paginas.length - 1 && position.fragment === page.fragmentos.length - 1;
  const speaker = appReads ? character?.nombre ?? 'Personaje' : 'Tú lees';
  const hasHints = !appReads && (fragment.disparadores?.length ?? 0) > 0;

  app.innerHTML = `
    <section class="reader-shell">
      <header class="reader-header">
        <button class="icon-button" id="restart" type="button" aria-label="Volver al inicio">‹</button>
        <div class="progress-wrap" aria-label="Progreso del cuento">
          <div class="progress-meta"><span>Página ${page.numero} de ${story.paginas.length}</span><span>${completedFragments() + 1} / ${totalFragments()}</span></div>
          <div class="progress-track"><div class="progress-value" style="width: ${progress}%"></div></div>
        </div>
        <button class="icon-button sound-button ${speaking ? 'is-active' : ''}" id="repeat" type="button" aria-label="${appReads ? 'Repetir diálogo' : 'Activar reconocimiento de voz'}" ${appReads || hasHints ? '' : 'disabled'}>${appReads ? '♬' : '◉'}</button>
      </header>

      <div class="illustration-placeholder" aria-label="Espacio reservado para la ilustración de la página ${page.numero}">
        <span class="placeholder-sun">☀</span>
        <p>Ilustración de esta página</p>
        <span class="effect-caption" id="effect-caption"></span>
      </div>

      <article class="text-card ${appReads ? 'app-reading' : 'adult-reading'}">
        <div class="reader-label"><span class="reader-dot"></span>${appReads ? 'LA APP LEE' : 'TÚ LEES'}</div>
        <div class="speaker-row">
          <div class="avatar" aria-hidden="true">${appReads ? speaker.slice(0, 1).toUpperCase() : '♥'}</div>
          <h2>${escapeHtml(speaker)}</h2>
        </div>
        <p class="story-text">${appReads ? escapeHtml(fragment.texto) : formatNarration(fragment)}</p>
      </article>

      <footer class="reader-footer">
        <p class="status" id="status">${appReads ? 'Escucha el diálogo antes de continuar.' : hasHints ? 'Preparando el micrófono…' : 'Léelo a tu ritmo y continúa cuando termines.'}</p>
        <button class="primary-button continue-button" id="continue" type="button" ${speaking ? 'disabled' : ''}>
          <span>${isLast ? 'Terminar cuento' : appReads ? 'Continuar' : 'Ya leí esta parte'}</span><span aria-hidden="true">${isLast ? '✓' : '→'}</span>
        </button>
      </footer>
    </section>`;

  document.querySelector('#restart').addEventListener('click', () => {
    stopListening();
    window.speechSynthesis?.cancel();
    speaking = false;
    position = { page: 0, fragment: 0 };
    renderStart();
  });
  document.querySelector('#continue').addEventListener('click', next);
  document.querySelector('#repeat').addEventListener('click', () => appReads ? speak(fragment) : startListening(fragment));
  if (hasHints) startListening(fragment);
}

function updateSpeakingState(isSpeaking) {
  speaking = isSpeaking;
  const button = document.querySelector('#continue');
  const status = document.querySelector('#status');
  const sound = document.querySelector('#repeat');
  if (button) button.disabled = isSpeaking;
  if (sound) sound.classList.toggle('is-active', isSpeaking);
  if (status && isSpeaking) status.textContent = 'El personaje está hablando…';
  if (status && !isSpeaking && getCurrent().lector === 'app') status.textContent = 'Puedes repetirlo o continuar.';
}

function speak(fragment) {
  if (!('speechSynthesis' in window)) {
    const status = document.querySelector('#status');
    if (status) status.textContent = 'Tu navegador no permite voz automática. Puedes leer este diálogo.';
    return;
  }
  window.speechSynthesis.cancel();
  const character = characterFor(fragment.personaje);
  const setup = voiceOptions[character?.voz] ?? voiceOptions.normal;
  const utterance = new SpeechSynthesisUtterance(fragment.texto);
  utterance.lang = 'es-CL';
  utterance.rate = setup.rate;
  utterance.pitch = setup.pitch;
  utterance.volume = 1;
  const spanishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('es'));
  if (spanishVoice) utterance.voice = spanishVoice;
  utterance.onstart = () => updateSpeakingState(true);
  utterance.onend = () => updateSpeakingState(false);
  utterance.onerror = () => updateSpeakingState(false);
  window.speechSynthesis.speak(utterance);
}

function next() {
  if (speaking) return;
  stopListening();
  const page = story.paginas[position.page];
  const isLast = position.page === story.paginas.length - 1 && position.fragment === page.fragmentos.length - 1;
  if (isLast) {
    renderEnd();
    return;
  }
  if (position.fragment < page.fragmentos.length - 1) {
    position.fragment += 1;
  } else {
    position.page += 1;
    position.fragment = 0;
  }
  renderStory();
  if (getCurrent().lector === 'app') speak(getCurrent());
}

function startStory() {
  position = { page: 0, fragment: 0 };
  renderStory();
  if (getCurrent().lector === 'app') speak(getCurrent());
}

function renderEnd() {
  stopListening();
  window.speechSynthesis?.cancel();
  app.innerHTML = `
    <section class="welcome-shell end-screen">
      <div class="end-icon" aria-hidden="true">✦</div>
      <p class="eyebrow">FIN DEL CUENTO</p>
      <h1>${escapeHtml(story.titulo)}</h1>
      <p class="subtitle">Gracias por leer juntos.</p>
      <button class="primary-button start-button" id="read-again" type="button"><span>Leer otra vez</span><span aria-hidden="true">↻</span></button>
    </section>`;
  document.querySelector('#read-again').addEventListener('click', startStory);
}

function boot() {
  story = storyData;
  loadVoices();
  window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
  renderStart();
}

boot();
