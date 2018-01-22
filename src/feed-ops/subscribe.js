import showDesktopNotification from "/src/notifications.js";
import * as FetchUtils from "/src/common/fetch-utils.js";
import * as Status from "/src/common/status.js";
import {lookup} from "/src/favicon-service.js";
import FeedPoll from "/src/feed-poll/poll-feeds.js";
import * as Feed from "/src/feed-store/feed.js";
import {addFeed, containsFeedWithURL} from "/src/feed-store/feed-store.js";
import coerceFeed from "/src/coerce-feed.js";

// TODO: reconsider the transaction lifetime. Right now it is protected by the error that
// occurs due to violation of uniqueness constraint. But it would be better if both reads and
// writes occurred on same transaction. Also because I have mixed feelings about treating
// already-subscribed as an error. It isn't a programming error.

// TODO: currently the redirect url is not validated as to whether it is a fetchable
// url according to the app's fetch policy. It is just assumed. I am not quite sure what to
// do about it at the moment. Maybe I could create a second policy that controls what urls
// are allowed by the app to be stored in the database? Or maybe I should just call
// isAllowedURL here explicitly? This is partly a caveat of attempting to abstract it away behind
// the call to the fetch helper, which checks the policy internally. The issue is that it cannot
// be abstracted away if I need to use it again for non-fetch purposes. So really it is just the
// wrong abstraction.
// TODO: reconsider how notify overlaps with concurrent. For that matter, the term concurrent is
// overly abstract and instead should be named more specifically to what it does, such as
// enqueuePoll
// TODO: the polling of entries after subscribing is still kind of wonky and should eventually
// be more well thought out.
// TODO: rather than poll later, this should just accept a boolean flag parameter that if true
// polls entries asynchronously, on the subscribed feed object itself, and without calling
// pollFeed. It should simply call pollEntries in a way that is non-blocking. Then there is
// no need to involve poll functionality outside of the poll entries function. This also
// means that poll entries needs to be able to work in two contexts, and should be a public
// member of the poll module. Moreover, there may not even need to be a flag. Entries should
// always be immediately polled, it is just that it should always be done in a non-blocking way,
// where subscribe returns prior to polling entries completing. Basically the flag is just
// whether the entry processing should be async or not. But it should always be async, so that
// is kind of stupid.
// TODO: perhaps instead of calling poll feed, there should be an observer somewhere listening
// for 'feed-added' events that automatically triggers the poll. addFeed in feed-store would
// post a message to a channel, and that observer would automatically pick it up. Then there is
// need to call this explicitly, at all.


// TODO: connect on demand?

// Properties for the context argument:
// feedConn {IDBDatabase} an open conn to feed store
// iconConn {IDBDatabase} an open conn to icon store
// channel {BroadcastChannel} optional, an open channel to which to send feed added message
// fetchFeedTimeout {Number} optional, positive integer, how long to wait in ms before considering
// feed fetch a failure
// concurrent {Boolean} optional, whether called concurrently. If not concurrent then entries
// scheduled to be polled shortly after subscribing
// notify {Boolean} optional, whether to show a desktop notification
// console {console object} optional, console-like logging destination

export default async function subscribe(context, url) {
  assert(typeof context === 'object');
  assert(context.iconConn instanceof IDBDatabase);
  assert(url instanceof URL);
  const console = context.console || NULL_CONSOLE;
  console.log('Subscribing to', url.href);

  // Treat any error from containsFeedWithURL as fatal to subscribe and do not catch
  let containsFeed = await containsFeedWithURL(context.feedConn, url);
  // If already subscribed, throw an error
  // TODO: is this really an error? This isn't an error. This just means cannot subscribe,
  // but it isn't exception worthy. Should I return undefined instead? But then how do I know
  // about failure? This is not a programmer error. This is just rejected user input, and
  // users can input whatever they want. Even then, should I use an exception anyway? Ugh.
  if(containsFeed) {
    throw new Error('Already subscribed to ' + url.href);
  }

  let response, status;
  [status, response] = await FetchUtils.fetchFeed(url, context.fetchFeedTimeout || 2000);
  if(status === Status.EOFFLINE) {
    // Continue with offline subscription
    console.debug('Subscribing while offline to', url.href);
  } else if(status !== Status.OK) {
    throw new Error('Error fetching ' + url.href);
  }

  let feed;
  if(response) {
    // Allow errors to bubble
    feed = await createFeedFromResponse(context, feed, url);
  } else {
    // Offline subscription
    feed = Feed.create();
    Feed.appendURL(feed, url);
  }

  // Set the feed's favicon
  const query = {};
  query.conn = context.iconConn;
  query.skipURLFetch = true;

  await setFeedFavicon(query, feed, console);

  const storedFeed = await addFeed(context.feedConn, context.channel, feed);

  if(context.notify || !('notify' in context)) {
    showNotification(storedFeed);
  }

  // If not concurrent with other subscribe calls, schedule a poll
  if(!context.concurrent) {
    // Call non-awaited to allow for subscribe to settle first
    deferredPollFeed(storedFeed).catch(console.warn);
  }

  return storedFeed;
}

async function createFeedFromResponse(context, response, url) {
  const responseURL = new URL(response.url);

  // If there was a redirect, then check if subscribed to the redirect
  if(FetchUtils.detectURLChanged(url, responseURL)) {

    // Allow database error to bubble uncaught
    const containsFeed = await containsFeedWithURL(context.conn, responseURL);
    if(containsFeed) {
      throw new Error('Already susbcribed to redirect url ' + responseURL.href);
    }
  }

  // Treat any fetch error here as fatal. We are past the point of trying to subscribe
  // while offline. This basically should never throw
  const responseText = await response.text();

  // Take the fetched feed xml and turn it into a storable feed object
  // Treat any coercion error as fatal and allow the error to bubble
  const procEntries = false;
  const result = coerceFeed(responseText, url, responseURL,
    FetchUtils.getLastModified(response), procEntries);

  return result.feed;
}

async function setFeedFavicon(query, feed, console) {
  assert(Feed.isFeed(feed));

  const lookupURL = Feed.createIconLookupURL(feed);

  // Lookup errors are not fatal. Simply do nothing on error.
  let iconURLString;
  try {
    iconURLString = await lookup(query);
  } catch(error) {
    console.debug(error);
    return;
  }

  if(iconURLString) {
    feed.faviconURLString = iconURLString;
  }
}

function showNotification(feed) {
  const title = 'Subscribed!';
  const feedName = feed.title || Feed.peekURL(feed);
  const message = 'Subscribed to ' + feedName;
  showDesktopNotification(title, message, feed.faviconURLString);
}



async function deferredPollFeed(feed) {

  const poll = new FeedPoll();
  poll.init();

  // We just fetched and added the feed. We definitely want to be able to process its entries,
  // so disable these checks because they most likely otherwise cancel the operation
  poll.ignoreRecencyCheck = true;
  poll.ignoreModifiedCheck = true;

  const batched = false;
  try {
    await poll.open();
    await poll.pollFeed(feed, batched);
  } catch(error) {
    console.warn(error);
  } finally {
    poll.close();
  }
}

function assert(value, message) {
  if(!value) throw new Error(message || 'Assertion error');
}

function noop() {}

const NULL_CONSOLE = {
  log: noop,
  warn: noop,
  debug: noop
};
