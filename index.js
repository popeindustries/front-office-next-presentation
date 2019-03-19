/* global hljs */
import './assets/highlight.js';

const RE_MULTIPLE_SPACES = /\s\s+/g;
const TOUCH_THRESHOLD = 100;
const VOLUME_CHANGE = 0.1;

const elSlides = document.querySelector('.slides');
const elClock = document.querySelector('.clock');
const isShowtime = window.location.search.includes('showtime');
const isLocal = window.location.hostname === 'localhost';
const isNotes = window.name === 'notes';
const startingSlide = isShowtime ? 0 : getUrlSlide();
const model = (window.model = parse({
  media: [],
  notes: [],
  noteIndex: 0,
  notesWindow: null,
  slides: [],
  slideIndex: 0,
  steps: [],
  stepIndex: 0,
  volume: 1,
  volumeBg: 0.3
}));
let start = Date.now();

/**
 * Parse slide elements
 * @param {object} model
 * @returns {object}
 */
function parse(model) {
  model.slides = Array.from(elSlides.querySelectorAll('header, section'));
  model.media = model.slides.map((element) =>
    Array.from(element.querySelectorAll('audio, video'))
  );
  model.notes = model.slides.map((element) =>
    Array.from(element.querySelectorAll('.note'))
  );
  model.steps = model.notes.map((group) => {
    let step = 0;

    return group.reduce((steps, element, idx) => {
      element.innerHTML = `<span class="note-progress">${idx + 1}/${
        group.length
      }</span> ${element.innerHTML}`;
      if (element.classList.contains('step')) {
        step++;
      }
      steps.push(step);
      return steps;
    }, []);
  });

  return model;
}

/**
 * Display slide at 'slideIndex'
 * @param {number} slideIndex
 * @param {boolean} back
 */
function changeSlide(slideIndex, back) {
  const current = model.slides[model.slideIndex];
  const next = model.slides[slideIndex];
  const noteIndex = back ? model.notes[slideIndex].length - 1 : 0;

  model.stepIndex = back ? model.steps[slideIndex] + 1 : 0;

  next.classList.add('show');
  next.classList.remove('hide');
  next.style.zIndex = 100 - slideIndex;
  if (current && next !== current) {
    current.classList.add('hide');
    current.addEventListener('transitionend', onTransitionEnd, false);
  }
  changeNote(model.slideIndex, slideIndex, noteIndex);
  model.slideIndex = slideIndex;
  if (isLocal) {
    window.history.pushState(
      {},
      '',
      window.location.href.replace(/\/\d*$/, `/${slideIndex}`)
    );
  }
}

function removeSlide() {}

/**
 * Display note at 'noteIndex'
 * @param {number} currentSlideIndex
 * @param {number} nextSlideIndex
 * @param {number} noteIndex
 */
function changeNote(currentSlideIndex, nextSlideIndex, noteIndex) {
  const current = model.notes[currentSlideIndex][model.noteIndex];
  const next = model.notes[nextSlideIndex][noteIndex];

  if (current) {
    current.style.opacity = 0;
  }
  if (next) {
    next.style.opacity = 1;
  }
  changeStep(nextSlideIndex, model.steps[nextSlideIndex][noteIndex]);
  if (model.notesWindow) {
    model.notesWindow.change(
      currentSlideIndex,
      nextSlideIndex,
      model.noteIndex,
      noteIndex
    );
  }
  model.noteIndex = noteIndex;
}

/**
 * Display step at 'stepIndex'
 * @param {number} slideIndex
 * @param {number} stepIndex
 */
function changeStep(slideIndex, stepIndex) {
  const slide = model.slides[slideIndex];
  let classStr = slide.getAttribute('class').replace(/step-\d*/g, '');

  for (let i = 1; i <= stepIndex; i++) {
    classStr += ` step-${i}`;
  }
  slide.setAttribute('class', classStr.replace(RE_MULTIPLE_SPACES, ' '));
  model.stepIndex = stepIndex;
  controlMedia(slideIndex);
}

/**
 * Display note in remote window
 * @param {number} currentSlideIndex
 * @param {number} nextSlideIndex
 * @param {number} currentNoteIndex
 * @param {number} nextNoteIndex
 */
function changeRemoteNote(
  currentSlideIndex,
  nextSlideIndex,
  currentNoteIndex,
  nextNoteIndex
) {
  const currentSlide = model.slides[currentSlideIndex];
  const nextSlide = model.slides[nextSlideIndex];
  const currentNote = model.notes[currentSlideIndex][currentNoteIndex];
  const nextNote = model.notes[nextSlideIndex][nextNoteIndex];

  nextSlide.classList.add('show');
  nextSlide.classList.remove('hide');
  nextSlide.style.zIndex = 100 - nextSlideIndex;
  if (currentSlide && nextSlide !== currentSlide) {
    currentSlide.classList.add('hide');
    currentSlide.classList.remove('show');
  }
  if (currentNote) {
    currentNote.style.opacity = 0;
  }
  if (nextNote) {
    nextNote.style.opacity = 1;
  }
  updateClock();
}

/**
 * Play/pause media based on current state
 * @param {number} slideIndex
 */
function controlMedia(slideIndex) {
  model.media.forEach((group, idx) => {
    for (const element of group) {
      const isPlaying = !element.paused;
      const isBg = element.dataset.bg !== undefined;
      const fadeOut = element.dataset['fadeout'] !== undefined;
      const fadeIn = element.dataset['fadein'] !== undefined;

      if (idx !== slideIndex) {
        if (isPlaying && fadeOut) {
          fadeVolume(element, 'out', 0);
        } else {
          element.pause();
        }
      } else {
        const isHidden =
          getComputedStyle(element).getPropertyValue('visibility') === 'hidden';

        if (isHidden && isPlaying) {
          if (isPlaying && fadeOut) {
            fadeVolume(element, 'out', 0);
          } else {
            element.pause();
          }
        } else if (!isHidden && !isPlaying) {
          element.currentTime = parseInt(element.dataset.offset, 10) || 0;
          if (fadeIn) {
            element.volume = 0;
            fadeVolume(element, 'in', isBg ? model.volumeBg : model.volume);
          } else {
            element.volume = isBg ? model.volumeBg : model.volume;
          }
          element.play();
        } else if (isPlaying) {
          element.volume = isBg ? model.volumeBg : model.volume;
        }
      }
    }
  });
}

/**
 * Fade volume for 'element'
 * @param {DOMElement} element
 * @param {string} direction
 * @param {number} target
 */
function fadeVolume(element, direction, target) {
  function fade() {
    const vol =
      direction === 'out' ? element.volume - 0.005 : element.volume + 0.005;
    if (
      (direction === 'out' && vol > target) ||
      (direction === 'in' && vol < target)
    ) {
      element.volume = vol;
      requestAnimationFrame(fade);
    } else {
      element.volume = target;
      if (direction === 'out') {
        element.pause();
      }
    }
  }

  requestAnimationFrame(fade);
}

/**
 * Advance to next step/slide/note
 */
function next() {
  if (model.noteIndex + 1 < model.notes[model.slideIndex].length) {
    changeNote(model.slideIndex, model.slideIndex, model.noteIndex + 1);
  } else if (model.slideIndex + 1 < model.slides.length) {
    changeSlide(model.slideIndex + 1);
  } else {
    return;
  }
}

/**
 * Advance to previous step/slide/note
 */
function prev() {
  if (model.noteIndex - 1 >= 0) {
    changeNote(model.slideIndex, model.slideIndex, model.noteIndex - 1);
  } else if (model.slideIndex - 1 >= 0) {
    changeSlide(model.slideIndex - 1, true);
  } else {
    return;
  }
}

/**
 * Update clock
 */
function updateClock() {
  if (isNotes) {
    const diff = Date.now() - start;
    const m = Math.floor(diff / 60000);
    const s = ((diff % 60000) / 1000).toFixed(0);

    elClock.innerHTML = `${m}:${s < 10 ? 0 : ''}${s}`;
  }
}

/**
 * Get current slide index from url
 * @returns {number}
 */
function getUrlSlide() {
  const slide = window.location.pathname.split('/').slice(-1)[0];

  return parseInt(slide, 0) || 0;
}

/**
 * Handle key down
 * @param {Event} evt
 */
function onKeyDown(evt) {
  evt.preventDefault();
  const key = (evt.key || evt.keyIdentifier).toLowerCase();

  if (
    key === 'arrowright' ||
    key === 'arrowup' ||
    key === 'right' ||
    key === 'up' ||
    key === 'pagedown'
  ) {
    next();
  }
  if (
    key === 'arrowleft' ||
    key === 'arrowdown' ||
    key === 'left' ||
    key === 'down' ||
    key === 'pageup'
  ) {
    prev();
  }
  if (key === '-') {
    model.volume = Math.max(model.volume - VOLUME_CHANGE, 0);
    controlMedia(model.slideIndex);
  }
  if (key === '=') {
    model.volume = Math.min(model.volume + VOLUME_CHANGE, 1);
    controlMedia(model.slideIndex);
  }
  if (key === '[') {
    model.volumeBg = Math.max(model.volumeBg - VOLUME_CHANGE, 0);
    controlMedia(model.slideIndex);
  }
  if (key === ']') {
    model.volumeBg = Math.min(model.volumeBg + VOLUME_CHANGE, 1);
    controlMedia(model.slideIndex);
  }
  if (key === 'r') {
    start = Date.now();
    updateClock();
    changeSlide(0);
  }
}

/**
 * Handle touch
 * @param {Event} evt
 */
function onTouchStart(evt) {
  evt.preventDefault();
  const start = evt.layerX;
  let cb;

  document.documentElement.addEventListener(
    'touchend',
    (cb = function(evt) {
      document.documentElement.removeEventListener('touchend', cb, false);
      const diff = start - evt.layerX;

      if (Math.abs(diff) >= TOUCH_THRESHOLD) {
        diff > 0 ? next() : prev();
      }
    }),
    false
  );
}

/**
 * Handle pop state event
 * @param {Event} evt
 */
function onPopState(evt) {
  if (evt.state) {
    changeSlide(getUrlSlide());
  }
}

/**
 * Handle transition end event
 * @param {Event} evt
 */
function onTransitionEnd(evt) {
  const slide = evt.target;

  slide.removeEventListener('transitionend', onTransitionEnd, false);

  if (slide.classList.contains('hide') && slide.classList.contains('show')) {
    slide.classList.remove('show');
    slide.style.zIndex = null;
    if (isShowtime) {
      removeSlide(slide);
    }
  }
}

if (isNotes) {
  window.change = changeRemoteNote;
  document.documentElement.classList.add('presentation-notes');
  Array.from(document.querySelectorAll('section')).forEach((section) => {
    Array.from(section.children).forEach((child) => {
      if (!child.classList.contains('notes')) {
        section.removeChild(child);
      }
    });
  });
  elClock.addEventListener('click', () => {
    start = Date.now();
    updateClock();
  });
} else {
  document.addEventListener('keyup', onKeyDown, false, { passive: true });
  document.documentElement.addEventListener('touchstart', onTouchStart, false);

  hljs.initHighlightingOnLoad();

  if (isShowtime) {
    model.notesWindow = window.open(window.location.href, 'notes');
    setTimeout(() => {
      changeSlide(startingSlide);
    }, 1000);
  } else {
    if (!isShowtime) {
      // document.documentElement.classList.add('dev');
    }
    if (isLocal) {
      window.addEventListener('popstate', onPopState, false);
      window.history.replaceState({}, document.title, window.location.href);
    }
    changeSlide(startingSlide);
  }
}
