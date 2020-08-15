# mv-multithreaded-save
 RPG Maker MV Plugin that uses web workers to save asynchronously on its own thread

## Is this a port of MZ's async code to MV?

NO! This code uses the same external libraries as MZ (localforage and pako) so it is able to accomplish some of the same things. However the code is very clearly just MV with some "async" and "await" keywords thrown in. No code was copy+pasted from MZ.

### MZ's code does this:
- Saving is asynchronous
- Compressing save data is asynchronous on the main thread
- Loading is asynchronous

### Whereas this plugin does this:
- Saving is asynchronous
- Compressing save data is asynchronous AND uses a dedicated thread via a web worker
- Loading is synchronous like default MV

## Is this code ready for production?

Probably not! I'm really only releasing it to inspire more talented people than me. Someone in the community must be a pro at using web workers, and I'd love to see them take this technology and really make it polished and stable.

## How to use in your own project
- Copy js/libs/localforage.min.js and js/libs/pako.min.js into your own js/libs
- Add script tags for localforage and pako into your index.html file
- Copy the files from js/plugins into your own project's plugins folder.
- Delete N_BloatSave if you don't want it. It's just for testing.
- Activate N_SaveManager and wrapper-pako in your plugin manager.
- Do not activate worker-pako. It is not meant to be run in the browser.
