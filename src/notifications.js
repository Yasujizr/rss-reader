import showSlideshowTab from '/src/views/show-slideshow-tab.js';

export default function showDesktopNotification(title, message, iconURL) {
  if (typeof Notification === 'undefined') {
    return;
  }

  if (!('SHOW_NOTIFICATIONS' in localStorage)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  const defaultIconURL = chrome.extension.getURL('/images/rss_icon_trans.gif');

  const details = {};
  details.body = message || '';
  details.icon = iconURL || defaultIconURL;

  // Instantiation implicitly shows the notification
  const notification = new Notification(title, details);
  notification.addEventListener('click', notificationOnclick);
}

function notificationOnclick(event) {
  // TODO: test if the absence of this approach still causes a crash in latest
  // Chrome

  // Ensure the browser is open to avoid crash that occurs in Chrome 55 running
  // on Mac
  try {
    const windowHandle = window.open();
    windowHandle.close();
  } catch (error) {
    console.warn(error);
    return;
  }

  showSlideshowTab().catch(console.warn);
}
