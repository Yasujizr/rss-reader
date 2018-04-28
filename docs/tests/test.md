# test
Provides testing framework and test running functionality.

### TODOs
* many of the tests are logging things that they are not testing, I should silence those messages for those tests. For example most of the tests are logging opening and creating a test database but those tests are not testing the creation of a database so that aspect should be muted
* note the horrible requirement of requiring a unique database. Maybe to coordinate, if I want to continue async, is that each test's first parameter is a test database name. Then I can simply do things like use test0, test1, etc, and the counter guarantees each db name is unique. On the other hand, I could run tests serially.
* each test could take a custom console parameter, then i could do things like implement a bufferedlogger, then queue messages per logger (per test), then flush on test complete together with using console.group and groupEnd, to get a cleaner console. Alternatively I could use an html-based logger that appends log messages to the test view so that there is no need to even open the console area and instead just view the page to run tests
* I think I need the ability to run single tests, it feels heavyweight to always run all, maybe I could add a helper that runs test by name