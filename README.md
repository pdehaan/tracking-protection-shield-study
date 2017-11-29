# Tracking Protection Shield Study

![CircleCI badge](https://img.shields.io/circleci/project/github/mozilla/shield-studies-addon-template/master.svg?label=CircleCI)

Note: This addon is built from Mozilla's [Shield Study template](http://github.com/mozilla/shield-studies-addon-template).

## Getting started

Note: Make sure you are on NPM 5+ installed so that the proper dependencies are installed using the package-lock.json file.

After you [clone](https://help.github.com/articles/cloning-a-repository/) or [fork](https://help.github.com/articles/fork-a-repo/) the repo:

```
# install dependencies
npm install

## build
npm run eslint
npm run build

## build and run
npm run firefox
```

`npm run build` packages the add-on into `dist/linked-addon.xpi`. This file is the addon you load into Firefox.

Note: `linked-addon.xpi` is a symbolic link to the extension's true XPI, which is named based on the study's unique addon ID specified in `package.json`.


## About This Study

[Study PHD](https://docs.google.com/document/d/1OJq1EDMNqydNoR8Ui_916Uzq7SHq9rl0bfZTmO5dC3g/)

Goal:  Determine the optimal messaging for tracking protection in Firefox during new user onboarding.


## User Experience / Functionality

**Under Construction** TODO bdanforth: update


## Data Collected / Telemetry Pings

**Under Construction** TODO bdanforth: update

see [TELEMETRY.md](./TELEMETRY.md)


## Test Plan

**Under Construction** TODO bdanforth: update

see [TESTPLAN.md](./TESTPLAN.md)


## Directory Structure and Files

**Under Construction** TODO bdanforth: update

```
├── .circleci/            # setup for .circle ci integration
├── .eslintignore
├── .eslintrc.js          # mozilla, json
├── .git/
├── .gitignore
├── README.md             # (this file)
├── TELEMETRY.md          # Telemetry examples for this addon
├── TESTPLAN.md           # Manual QA test plan
├── addon                 # Files that will go into the addon
│   ├── Config.jsm
│   ├── StudyUtils.jsm    # (copied in during `prebuild`)
│   ├── bootstrap.js      # LEGACY Bootstrap.js
│   ├── chrome.manifest   # (derived from templates)
│   ├── install.rdf       # (derived from templates)
│   │
│   ├── lib               # JSM (Firefox modules)
│   │   └── AddonPrefs.jsm
│   │   └── Feature.jsm   # does `introduction`
|   |
│   └── webextension      # modern, embedded webextesion
│       ├── .eslintrc.json
│       ├── background.js
│       ├── icons
│       │   ├── Anonymous-Lizard.svg
│       │   ├── DogHazard1.svg
│       │   ├── Grooming-Cat-Line-Art.svg
│       │   ├── isolatedcorndog.svg
│       │   ├── kittens.svg
│       │   ├── lizard.svg
│       │   └── puppers.svg
│       └── manifest.json
│
├── bin                   # Scripts / commands
│   └── xpi.sh            # build the XPI
│
├── dist                  # built xpis (addons)
│   ├── @template-shield-study.mozilla.com-1.1.0.xpi
│   └── linked-addon.xpi -> @template-shield-study.mozilla.com-1.1.0.xpi
│
├── package-lock.json
├── package.json
├── run-firefox.js        # command
├── sign/                 # "LEGACY-SIGNED" addons.  used by `npm sign`
│
│
├── templates             # mustache templates, filled from `package.json`
│   ├── chrome.manifest.mustache
│   └── install.rdf.mustache
│
│
└── test                  # Automated tests `npm test` and circle
    ├── Dockerfile
    ├── docker_setup.sh
    ├── functional_tests.js
    ├── test-share-study.js
    ├── test_harness.js
    ├── test_printer.py
    └── utils.js


>> tree -a -I node_modules

```

## Getting Data

**Under Construction** TODO bdanforth: update

Telemetry pings are loaded into S3 and re:dash. You can use this [Example Query](https://sql.telemetry.mozilla.org/queries/46999/source#table) as a starting point.

## Testing

**Under Construction** TODO bdanforth: update

Run the following to run the functional tests:

`$ npm test`

Note: The functional tests are using async/await, so make sure you are running Node 7.6+
