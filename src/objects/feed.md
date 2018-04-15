### is_feed notes
Return true if the value looks like a feed object

While it perenially appears like the value condition is implied in the typeof condition, this is not true. The value condition is short for `value !== null`, because `typeof null === 'object'`, and not checking value defined-ness would cause value.magic to throw. The value condition is checked first, because presumably it is cheaper than the typeof check.

indexedDB does not support storing Function objects, because Function objects are not serializable (aka structured-cloneable), so we store basic objects. Therefore, because instanceof is out of the question, and typeof cannot get us any additional type guarantee beyond stating the value is some object, we use a hidden property called magic to further guarantee the type.

### feed_append_url notes
Appends a url to the feed's internal list. Lazily creates the list if needed
* @param feed {Object} a feed object
* @param url {URL}

### feed_merge notes
// Returns a new object that results from merging the old feed with the new
// feed. Fields from the new feed take precedence, except for urls, which are
// merged to generate a distinct ordered set of oldest to newest url. Impure
// because of copying by reference.

// Internally, After assignment, the merged feed has only the urls from the new feed. So
// the output feed's url list needs to be fixed. First copy over the old
// feed's urls, then try and append each new feed url.

### feed_is_valid notes
// TODO: implement fully
// Return whether the feed has valid properties
// @param feed {any} any value, this should be a feed object, but it is not
// required
// @return {Boolean}
// feed_is_valid is generally called in the context of an assertion, so
// while this could be its own assert, there is no need. It is simpler to
// return here than throw an exception. It is, notably, generally an error to
// ever call this function on something other than a feed, but that care is
// left to the caller
// Validate the feed's id. It may not be present in the case of validating
// a feed that has never been stored.

### TODOs
* for `coerce_feed`, think about fetch info parameter more, I'd prefer maybe to just accept a Response object. But I don't know how to get request url.
* for `coerce_feed`, think more about separating out the integration of fetch information from coercion. This kind of mixes it all together and I do not like that.