/*:
 * @plugindesc v1.02 Wrapper that allows a web worker to return a promise.
 * @author Think_Nathan, Gilad Dayagi
 */

// Template by Gilad Dayagi
// https://codeburst.io/promises-for-the-web-worker-9311b7831733
(function () {
    const resolves = {};
    const rejects = {};
    let globalMsgId = 0;

    // Activate calculation in the worker, returning a promise
    function sendMsg(payload, worker) {
        const msgId = globalMsgId++;
        const msg = {
            id: msgId,
            payload,
        }
        return new Promise(function (resolve, reject) {
            // save callbacks for later
            resolves[msgId] = resolve;
            rejects[msgId] = reject;
            worker.postMessage(msg);
        })
    };

    // Handle incoming calculation result
    function handleMsg(msg) {
        const {
            id,
            err,
            payload,
        } = msg.data;
        if (payload) {
            const resolve = resolves[id];
            if (resolve) {
                resolve(payload);
            }
        } else {
            // error condition
            const reject = rejects[id];
            if (reject) {
                if (err) {
                    reject(err);
                } else {
                    reject('Got nothing');
                }
            }
        }

        // purge used callbacks
        delete resolves[id];
        delete rejects[id];
    };

    // Wrapper class
    class pakoWrapper {
        constructor() {
            this.worker = new Worker('./js/plugins/worker-pako.js');
            this.worker.onmessage = handleMsg;
        }

        compress(str) {
            return sendMsg(str, this.worker);
        }
        
        terminate() {
            this.worker.terminate();
        }
    }

    window.pakoWrapper = pakoWrapper;
})();
