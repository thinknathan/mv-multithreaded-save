importScripts('../libs/pako.min.js');

/* @version v1.0.3
 * Web worker that interfaces with Pako
 * Returns a compressed string
 */

// Template by Gilad Dayagi
// https://codeburst.io/promises-for-the-web-worker-9311b7831733
async function deflateString(data, cb) {
    let result = null,
        err = null;

    if (typeof data === 'string') {
        const compressed = await pako.deflate(data, {
            to: "string",
            level: 1
        });
        result = compressed;
    } else {
        err = 'Not a string';
    }

    const delay = Math.ceil(Math.random() * 1000);
    setTimeout(function () {
        cb(err, result);
    }, delay);
};

// Handle incoming messages
self.onmessage = function (msg) {
    const { id, payload } = msg.data;

    deflateString(payload, function (err, result) {
        const msg = {
            id,
            err,
            payload: result,
        }
        self.postMessage(msg);
    });
};
