export const SLIDE_ELEMENT_NAME = 'slide';
const container = document.getElementById('slideshow-container');
let cursor;
let active_transition_count = 0;

export function element_get_name() {
  return SLIDE_ELEMENT_NAME;
}

export function get_current_slide() {
  return cursor;
}

export function slide_is_current(slide) {
  return slide === cursor;
}

export function slide_get_first() {
  return container.firstElementChild;
}

export function next() {
  if (active_transition_count > 0) {
    return false;
  }

  if (!cursor) {
    return false;
  }

  const nextSlide = cursor.nextElementSibling;
  if (!nextSlide) {
    return false;
  }

  active_transition_count++;
  cursor.style.left = '-100%';

  // NOTE: in process of creating this lib I noticed the source of the strange
  // behavior with why count is only 1 despite two transitions, it was here
  // because I forgot to increment again. But it is working like I want so I am
  // hesitant to change it at the moment.

  // active_transition_count++;

  nextSlide.style.left = '0';
  cursor = nextSlide;

  return true;
}

export function prev() {
  if (active_transition_count > 0) {
    return;
  }

  if (!cursor) {
    return;
  }

  const previousSlide = cursor.previousElementSibling;
  if (!previousSlide) {
    return;
  }

  active_transition_count++;
  cursor.style.left = '100%';
  // active_transition_count++;
  previousSlide.style.left = '0';
  cursor = previousSlide;
}

export function count() {
  return container.childElementCount;
}

export function slide_get_all() {
  return container.querySelectorAll(SLIDE_ELEMENT_NAME);
}

export function slide_is_slide(element) {
  return element instanceof Element && element.localName === SLIDE_ELEMENT_NAME;
}

let duration = 0.35;

function is_valid_transition_duration(duration) {
  return !isNaN(duration) && isFinite(duration) && duration >= 0;
}

export function set_transition_duration(input_duration) {
  if (!is_valid_transition_duration(input_duration)) {
    throw new TypeError('Invalid duration parameter', input_duration);
  }

  duration = input_duration;
}

export function create() {
  return document.createElement(SLIDE_ELEMENT_NAME);
}

export function append(slide) {
  if (!slide_is_slide(slide)) {
    throw new TypeError('Invalid slide parameter', slide);
  }

  // Caller handles slide clicks
  // slide.addEventListener('click', onClick);

  // Setup s ide scroll handling. The listener is bound to the slide itself,
  // because it is the slide itself that scrolls, and not window. Also, in order
  // for scrolling to react to keyboard shortcuts, the element must be focused,
  // and in order to focus an element, it must have the tabindex attribute.
  slide.setAttribute('tabindex', '-1');

  // Set the position of the slide. Slides are positioned absolutely. Setting
  // left to 100% places the slide off the right side of the view. Setting left
  // to 0 places the slide in the view. The initial value must be defined here
  // and not via css, before adding the slide to the page. Otherwise, changing
  // the style for the first slide causes an unwanted transition, and I have to
  // change the style for the first slide because it is not set in css.
  slide.style.left = container.childElementCount === 0 ? '0' : '100%';

  // In order for scrolling a slide element with keyboard keys to work, the
  // slide must be focused. But calling element.focus() while a transition is
  // active, such as what happens when a slide is moved, interrupts the
  // transition. Therefore, schedule a call to focus the slide for when the
  // transition completes.
  slide.addEventListener('webkitTransitionEnd', transition_onend);

  // Define the animation effect that will occur when moving the slide. Slides
  // are moved by changing a slide's css left property, which is basically its
  // offset from the left side of window. This will also trigger a transition
  // event. The transition property must be defined here in code, and not via
  // css, in order to have the transition only apply to a slide when it is in a
  // certain state. If set in css then this causes an immediate transition on
  // the first slide, which I want to avoid.
  slide.style.transition = `left ${duration}s ease-in-out`;

  // Initialize the cursor if needed
  if (!cursor) {
    cursor = slide;

    // TODO: is this right? I think it is because there is no transition for
    // first slide, so there is no focus call. But maybe not needed?
    cursor.focus();
  }

  container.appendChild(slide);
}

// Remove a slide from the dom
export function remove(slide) {
  slide.remove();
}

function transition_onend(event) {
  // The slide that the transition occured upon (event.target) is not guaranteed
  // to be equal to the current slide. We fire off two transitions per
  // animation, one for the slide being moved out of view, and one for the slide
  // being moved into view. Both transitions result in call to this listener,
  // but we only want to call focus on one of the two elements. We want to be in
  // the state where after both transitions complete, the new slide (which is
  // the current slide at this point) is now focused. Therefore we ignore
  // event.target and directly affect the current slide only.
  cursor.focus();

  // There may be more than one transition effect occurring at the moment. Point
  // out that this transition completed. This provides a method for checking if
  // any transitions are outstanding.
  active_transition_count--;
}