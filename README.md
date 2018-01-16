# Tracking Protection Shield Study

## About This Study

[Study PHD](https://docs.google.com/document/d/1HMHoe6lXNtksdGCl2LDdOjCpS-spP2GFgE9jdvLhkEc/edit?ts=5a2041d5)

[Study UX](https://drive.google.com/file/d/0B8kj4Mlm-HJeVW5Dd3huVXg2OW8/view)

The purpose of this study is to test various types of messaging around [Tracking Protection](https://support.mozilla.org/en-US/kb/tracking-protection) in Firefox.

## Eligibility

Users are ineligible for the study if:
* They have already changed their Tracking Protection setting from the default.

## Treatment Branches

1. `"control"`: The user receives no messaging or prompts, and Tracking Protection is kept at its default setting (ON in private windows only).
2. `"pseudo-control"`: The user receives no messaging or prompts, and Tracking Protection is set to ON globally.
3. `"fast"`: The user receives messaging about how Tracking Protection saves them time. Tracking Protection is set to ON globally.
4. `"private"`: The user receives messaging about how Tracking Protection protects their privacy and blocks ads. Tracking Protection is set to ON globally. 

## User Flow

1. (Fast and Private branches only) For the first webpage the user visits with blocked resources, a pageAction icon will appear, displaying an introductory panel.
2. (Fast and Private branches only) For every subsequent webpage the user visits with blocked resources, the pageAction badge will display:
- The amount of time saved in seconds (Fast)
- The number of blocked resources (Private)
If the user clicks on the pageAction icon, a panel will open with more information.
3. (Fast and Private branches only) When the user visits `about:newtab` or `about:home`, a message on the page will display per-session totals for:
- number of blocked resources AND
- time saved per session (Fast) OR
- number of tracking companies blocked (Private)
4. (All branches) If the study is still running after two weeks, the study will end, restoring Tracking Protection to its default setting and opening a new tab to a survey.

### Notes
* (Fast and Private branches only) If the user disables Tracking Protection from either the introduction panel or the subsequent pageAction panel, the study will end.
* (All branches) If at any time during the study the user modifies their Tracking Protection setting, the study will end.

## Testing Preferences
The following preferences can be set to customize the study behavior for testing purposes.

<dl>
  <dt><code>extensions.tracking_protection_messaging_study.variation_override</code></dt>
  <dd>The treatment to use. Set this to a value from the Treatment Branches section to force the add-on to show you that treatment. You must set this preference before installing the study (default: random).</dd>

  <dt><code>extensions.tracking_protection_messaging_study.duration</code></dt>
  <dd>The the duration of the study (default: <code>1209600000</code>ms or 2 weeks).</dd>
</dl>

## Telemetry

See [TELEMETRY.md](./TELEMETRY.md) for more information.

## Test Plan

See [TESTPLAN.md](./TESTPLAN.md).

## Development

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

Note: To load legacy, unsigned addons like this Shield study in Firefox 57+ be sure to set the following preferences in `about:config`:
- `"extensions.legacy.enabled"`: `true`
- `"xpinstall.signatures.required"`: `false`

## Acknowledgements

This addon is built from Mozilla's [Shield Study template](http://github.com/mozilla/shield-studies-addon-template).

The Tracking Protection implementation is borrowed from [Tracking Protection Study](http://github.com/rhelmer/tracking-protection-study/) and [Blok](http://github.com/mozilla/blok/).