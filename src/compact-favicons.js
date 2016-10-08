// Copyright 2016 Josh Froelich. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file

'use strict';

{

// TODO: for this to be testable, cache must be a parameter

function compactFavicons(verbose) {
  const cache = new FaviconCache();
  const log = new LoggingService();
  log.enabled = verbose;
  log.log('Compacting favicon cache, max age:', cache.maxAge);

  if(!Number.isInteger(cache.maxAge)) {
    throw new TypeError('invalid maxAge value');
  }

  const ctx = {
    'cache': cache,
    'maxAge': cache.defaultMaxAge,
    'log': log,
    'numDeleted': 0
  };

  cache.connect(connectOnSuccess.bind(ctx), connectOnError.bind(ctx));
}

function connectOnSuccess(event) {
  this.log.debug('Connected to database');
  this.db = event.target.result;
  this.cache.openCursor(this.db, openCursorOnSuccess.bind(this),
    openCursorOnError.bind(this));
}

function connectOnError(event) {
  this.log.error(event.target.error);
  onComplete.call(this);
}

function openCursorOnSuccess(event) {
  const cursor = event.target.result;
  if(!cursor) {
    return onComplete.call(this);
  }

  const entry = cursor.value;
  if(this.cache.isExpired(entry, this.maxAge)) {
    this.log.debug('Deleting', entry.pageURLString);
    this.numDeleted++;
    cursor.delete();
  } else {
    this.log.debug('Retaining', entry.pageURLString,
      new Date() - entry.dateUpdated);
  }

  cursor.continue();
}

function openCursorOnError(event) {
  this.log.error(event.target.error);
  onComplete.call(this);
}

function onComplete() {
  if(this.db) {
    this.log.debug('Requesting database be closed');
    this.db.close();
  }

  this.log.log('Completed compacting favicon cache, deleted %s entries',
    this.numDeleted);
}


this.compactFavicons = compactFavicons;

}
